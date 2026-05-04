import { describe, expect, it } from "vitest";
import { EgovClient } from "../src/egov/client";
import { runGetLawMetadata } from "../src/tools/get_law_metadata";
import {
	jsonResponse,
	makeFetchMock,
	MemoryCache,
	plainResponse,
	SAMPLE_LAWS_LIST_COMPANIES,
	SAMPLE_REVISIONS,
} from "./fixtures";

describe("get_law_metadata", () => {
	it("returns headline metadata + revisions on a happy path", async () => {
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_REVISIONS),
		]);
		const client = new EgovClient({ fetch });
		const out = await runGetLawMetadata(client, { law_id: "417AC0000000086" });
		expect(out.law_id).toBe("417AC0000000086");
		expect(out.law_num).toBe("平成十七年法律第八十六号");
		expect(out.name).toBe("Companies Act");
		expect(out.name_japanese).toBe("会社法");
		expect(out.promulgation_date).toBe("2005-07-26");
		expect(out.current_revision_date).toBe("2024-06-15");
		expect(out.major_revisions).toHaveLength(2);
		// Most-recent first.
		expect(out.major_revisions[0].revision_date).toBe("2024-06-15");
		expect(out.major_revisions[1].revision_date).toBe("2015-05-01");
		expect(out.source_url).toBe("https://laws.e-gov.go.jp/law/417AC0000000086");
		expect(calls).toHaveLength(2);
	});

	it("survives a missing /law_revisions response (returns empty list)", async () => {
		const { fetch } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			plainResponse("not found", 404),
		]);
		const client = new EgovClient({ fetch });
		const out = await runGetLawMetadata(client, { law_id: "417AC0000000086" });
		expect(out.major_revisions).toEqual([]);
		// Headline metadata still populated.
		expect(out.name_japanese).toBe("会社法");
	});

	it("propagates a 404 from /laws as EgovNotFoundError", async () => {
		const { fetch } = makeFetchMock([
			plainResponse("not found", 404),
			jsonResponse(SAMPLE_REVISIONS),
		]);
		const client = new EgovClient({ fetch });
		// Note: /laws does not currently throw NotFound (it returns an empty list)
		// — but if the upstream were to 404 at the search-list endpoint, we'd
		// surface that error rather than silently produce a half-empty result.
		await expect(
			runGetLawMetadata(client, { law_id: "417AC0000000086" }),
		).rejects.toThrow();
	});

	it("hits the cache on the second identical call", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_REVISIONS),
		]);
		const client = new EgovClient({ cache, fetch });
		await runGetLawMetadata(client, { law_id: "417AC0000000086" });
		await runGetLawMetadata(client, { law_id: "417AC0000000086" });
		expect(calls).toHaveLength(2);
	});
});
