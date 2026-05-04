import { describe, expect, it } from "vitest";
import { EgovClient } from "../src/egov/client";
import { runGetArticle } from "../src/tools/get_article";
import {
	jsonResponse,
	makeFetchMock,
	MemoryCache,
	plainResponse,
	SAMPLE_LAW_DATA_COMPANIES,
} from "./fixtures";

describe("get_article", () => {
	it("returns text for a top-level article (Article 107)", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ fetch });
		const out = await runGetArticle(client, {
			law_id: "417AC0000000086",
			article_ref: "Article 107",
		});
		expect(out.law_id).toBe("417AC0000000086");
		expect(out.law_name_japanese).toBe("会社法");
		expect(out.article_number).toBe("第107条");
		expect(out.article_text).toContain("第百七条");
		expect(out.article_text).toContain("第百七条の本文");
		expect(out.paragraph).toBeUndefined();
		expect(out.item).toBeUndefined();
	});

	it("extracts a specific paragraph and item (第9条第2項第1号)", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ fetch });
		const out = await runGetArticle(client, {
			law_id: "417AC0000000086",
			article_ref: "第9条第2項第1号",
		});
		expect(out.article_number).toBe("第9条");
		expect(out.paragraph).toContain("第二号"); // paragraph contains both items' text
		expect(out.item).toBe("第一号の文言。");
	});

	it("handles branch articles (第325条の3)", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ fetch });
		const out = await runGetArticle(client, {
			law_id: "417AC0000000086",
			article_ref: "第325条の3",
		});
		expect(out.article_number).toBe("第325条の3");
		expect(out.article_text).toContain("枝条文の本文");
	});

	it("rejects an article that doesn't exist with an article_not_found code", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ fetch });
		await expect(
			runGetArticle(client, { law_id: "417AC0000000086", article_ref: "第999条" }),
		).rejects.toMatchObject({ code: "article_not_found" });
	});

	it("rejects an unparseable article_ref before any HTTP call", async () => {
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ fetch });
		await expect(
			runGetArticle(client, { law_id: "417AC0000000086", article_ref: "garbage" }),
		).rejects.toThrow();
		expect(calls).toHaveLength(0);
	});

	it("propagates a 404 from e-Gov as EgovNotFoundError", async () => {
		const { fetch } = makeFetchMock([plainResponse("not found", 404)]);
		const client = new EgovClient({ fetch });
		await expect(
			runGetArticle(client, { law_id: "999AC0000000999", article_ref: "第1条" }),
		).rejects.toMatchObject({ name: "EgovNotFoundError" });
	});

	it("hits the cache on a second identical call", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ cache, fetch });
		await runGetArticle(client, { law_id: "417AC0000000086", article_ref: "Article 107" });
		await runGetArticle(client, { law_id: "417AC0000000086", article_ref: "Article 107" });
		expect(calls).toHaveLength(1);
	});
});
