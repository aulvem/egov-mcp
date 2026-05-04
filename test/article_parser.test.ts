import { describe, expect, it } from "vitest";
import {
	ArticleRefParseError,
	formatArticleRefJa,
	parseArticleRef,
} from "../src/egov/article_parser";

describe("parseArticleRef", () => {
	it('parses "Article 107"', () => {
		expect(parseArticleRef("Article 107")).toEqual({ article: 107 });
	});

	it("parses 第107条 (Japanese)", () => {
		expect(parseArticleRef("第107条")).toEqual({ article: 107 });
	});

	it('parses "Article 9, Paragraph 2"', () => {
		expect(parseArticleRef("Article 9, Paragraph 2")).toEqual({
			article: 9,
			paragraph: 2,
		});
	});

	it("parses 第9条第2項", () => {
		expect(parseArticleRef("第9条第2項")).toEqual({ article: 9, paragraph: 2 });
	});

	it("parses 第9条第2項第1号", () => {
		expect(parseArticleRef("第9条第2項第1号")).toEqual({
			article: 9,
			paragraph: 2,
			item: 1,
		});
	});

	it("parses 第325条の3 (branch article)", () => {
		expect(parseArticleRef("第325条の3")).toEqual({
			article: 325,
			article_branch: "の3",
		});
	});

	it('parses "Art. 107(2)(1)" compact form', () => {
		expect(parseArticleRef("Art. 107(2)(1)")).toEqual({
			article: 107,
			paragraph: 2,
			item: 1,
		});
	});

	it("parses branch article with paragraph (第325条の3第2項)", () => {
		expect(parseArticleRef("第325条の3第2項")).toEqual({
			article: 325,
			article_branch: "の3",
			paragraph: 2,
		});
	});

	it("is whitespace-tolerant on Japanese form", () => {
		expect(parseArticleRef("  第 107 条  ")).toEqual({ article: 107 });
	});

	it("is case-insensitive on English form", () => {
		expect(parseArticleRef("article 9")).toEqual({ article: 9 });
		expect(parseArticleRef("ARTICLE 9, PARAGRAPH 2")).toEqual({
			article: 9,
			paragraph: 2,
		});
	});

	it("rejects empty string", () => {
		expect(() => parseArticleRef("")).toThrow(ArticleRefParseError);
	});

	it("rejects non-article garbage", () => {
		expect(() => parseArticleRef("hello")).toThrow(ArticleRefParseError);
		expect(() => parseArticleRef("条 107")).toThrow(ArticleRefParseError);
	});

	it("rejects mixed-language form (Article 9 第2項)", () => {
		expect(() => parseArticleRef("Article 9 第2項")).toThrow(ArticleRefParseError);
	});

	it("rejects zero / negative / non-integer article numbers", () => {
		expect(() => parseArticleRef("第0条")).toThrow(ArticleRefParseError);
		expect(() => parseArticleRef("Article 0")).toThrow(ArticleRefParseError);
	});
});

describe("formatArticleRefJa", () => {
	it("round-trips a simple article", () => {
		expect(formatArticleRefJa({ article: 107 })).toBe("第107条");
	});

	it("includes branch", () => {
		expect(formatArticleRefJa({ article: 325, article_branch: "の3" })).toBe("第325条の3");
	});

	it("includes paragraph and item", () => {
		expect(formatArticleRefJa({ article: 9, paragraph: 2, item: 1 })).toBe("第9条第2項第1号");
	});
});
