import { describe, expect, it } from "vitest";
import { EgovClient } from "../src/egov/client";
import { runSearchLaw } from "../src/tools/search_law";
import {
	jsonResponse,
	makeFetchMock,
	MemoryCache,
	SAMPLE_EGOV_ERROR,
	SAMPLE_LAWS_LIST_COMPANIES,
	SAMPLE_LAWS_LIST_EMPTY,
} from "./fixtures";

describe("search_law", () => {
	it("returns hits for a domain-scoped query (corporate)", async () => {
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAWS_LIST_COMPANIES)]);
		const client = new EgovClient({ fetch });
		const out = await runSearchLaw(client, { query: "会社", domain: "corporate" });
		expect(out.laws).toHaveLength(1);
		expect(out.laws[0]).toMatchObject({
			law_id: "417AC0000000086",
			name: "Companies Act",
			name_japanese: "会社法",
			domain: "corporate",
			source_url: "https://laws.e-gov.go.jp/law/417AC0000000086",
		});
		expect(out.total_count).toBe(1);
		// Domain-scoped path always queries by law_id, never law_title.
		expect(calls[0].url).toContain("law_id=417AC0000000086");
	});

	it("filters domain-scoped results by query (no match → empty)", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_LAWS_LIST_COMPANIES)]);
		const client = new EgovClient({ fetch });
		const out = await runSearchLaw(client, {
			query: "this-text-doesn't-match",
			domain: "corporate",
		});
		expect(out.laws).toHaveLength(0);
		expect(out.total_count).toBe(0);
	});

	it("falls back to title-search when no domain is given", async () => {
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAWS_LIST_COMPANIES)]);
		const client = new EgovClient({ fetch });
		const out = await runSearchLaw(client, { query: "会社法" });
		expect(out.laws[0].name_japanese).toBe("会社法");
		expect(calls[0].url).toContain("law_title=");
	});

	it("returns empty laws on an unmatched free-text search", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_LAWS_LIST_EMPTY)]);
		const client = new EgovClient({ fetch });
		const out = await runSearchLaw(client, { query: "no-such-law" });
		expect(out.laws).toEqual([]);
		expect(out.total_count).toBe(0);
	});

	it("propagates an upstream e-Gov API error", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_EGOV_ERROR, 400)]);
		const client = new EgovClient({ fetch, retryDelaysMs: [], maxRetries: 0 });
		await expect(runSearchLaw(client, { query: "会社", domain: "corporate" })).rejects.toThrow();
	});

	it("hits the cache on a second identical search", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAWS_LIST_COMPANIES)]);
		const client = new EgovClient({ cache, fetch });
		await runSearchLaw(client, { query: "会社法" });
		await runSearchLaw(client, { query: "会社法" });
		expect(calls).toHaveLength(1);
	});
});
