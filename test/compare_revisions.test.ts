import { describe, expect, it } from "vitest";
import { EgovClient } from "../src/egov/client";
import { runCompareRevisions } from "../src/tools/compare_revisions";
import {
	jsonResponse,
	makeFetchMock,
	MemoryCache,
	plainResponse,
	SAMPLE_LAW_DATA_COMPANIES,
	SAMPLE_LAW_DATA_COMPANIES_OLD,
} from "./fixtures";

describe("compare_revisions", () => {
	it("returns text_changed=true when the two revisions differ", async () => {
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES_OLD),
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
		]);
		const client = new EgovClient({ fetch });
		const out = await runCompareRevisions(client, {
			law_id: "417AC0000000086",
			article_ref: "第9条第1項",
			revision_a_date: "2015",
			revision_b_date: "2024",
		});
		expect(out.text_changed).toBe(true);
		expect(out.revision_a.text).toContain("旧本文");
		expect(out.revision_b.text).toContain("第九条第一項");
		// Both calls forwarded asof to e-Gov, expanded from year-only inputs.
		expect(calls[0].url).toContain("asof=2015-12-31");
		expect(calls[1].url).toContain("asof=2024-12-31");
	});

	it("returns text_changed=false when the article is unchanged", async () => {
		const { fetch } = makeFetchMock([
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
		]);
		const client = new EgovClient({ fetch });
		const out = await runCompareRevisions(client, {
			law_id: "417AC0000000086",
			article_ref: "Article 107",
			revision_a_date: "2024-01-01",
			revision_b_date: "2024-12-31",
		});
		expect(out.text_changed).toBe(false);
		expect(out.revision_a.text).toBe(out.revision_b.text);
	});

	it("rejects an unparseable article_ref before any HTTP call", async () => {
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
		]);
		const client = new EgovClient({ fetch });
		await expect(
			runCompareRevisions(client, {
				law_id: "417AC0000000086",
				article_ref: "garbage",
				revision_a_date: "2015",
				revision_b_date: "2024",
			}),
		).rejects.toThrow();
		expect(calls).toHaveLength(0);
	});

	it("surfaces a 404 from one of the asof snapshots", async () => {
		const { fetch } = makeFetchMock([
			plainResponse("not found", 404),
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
		]);
		const client = new EgovClient({ fetch });
		await expect(
			runCompareRevisions(client, {
				law_id: "999AC0000000999",
				article_ref: "Article 107",
				revision_a_date: "2015",
				revision_b_date: "2024",
			}),
		).rejects.toThrow();
	});

	it("hits the cache for repeat calls", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES_OLD),
			jsonResponse(SAMPLE_LAW_DATA_COMPANIES),
		]);
		const client = new EgovClient({ cache, fetch });
		const args = {
			law_id: "417AC0000000086",
			article_ref: "第9条第1項",
			revision_a_date: "2015",
			revision_b_date: "2024",
		};
		await runCompareRevisions(client, args);
		await runCompareRevisions(client, args);
		expect(calls).toHaveLength(2);
	});
});
