import { z } from "zod";
import {
	type ArticleRef,
	arabicToKanjiNum,
	expectedArticleTitle,
	formatArticleRefJa,
	parseArticleRef,
} from "../egov/article_parser";
import type { EgovClient } from "../egov/client";
import { lawDetailUrl } from "../egov/domains";
import {
	asArray,
	type EgovArticleLight,
	type EgovItemLight,
	type EgovLawDataResponse,
	type EgovParagraphLight,
	numAttr,
	textOf,
} from "../egov/types";
import { EgovApiError } from "../utils/errors";

export const GET_ARTICLE_DESCRIPTION =
	'Retrieve a specific article from a Japan law. Provide the law_id (from search_law) and the article reference (e.g. "Article 107", "第107条", "第9条第2項第1号"). Returns the article text in Japanese with metadata. For research and reference only — not legal advice.';

export const getArticleInputSchema = {
	law_id: z.string().min(1, "law_id is required"),
	article_ref: z.string().min(1, "article_ref is required"),
};

export type GetArticleInput = {
	law_id: string;
	article_ref: string;
};

export interface GetArticleOutput {
	law_id: string;
	law_name: string;
	law_name_japanese: string;
	article_number: string;
	article_text: string;
	paragraph?: string;
	item?: string;
	source_url: string;
}

// Recursively walk MainProvision-like trees and collect every Article node.
//
// e-Gov "light" responses embed Articles arbitrarily deep inside the
// Part / Chapter / Section / Subsection / Division hierarchy, so a flat
// `MainProvision.Article[]` lookup misses everything but the simplest laws.
// We use the presence of `ArticleTitle` as the discriminator — it's the only
// field that's both required and unique to Article nodes in v2 responses.
export function walkArticles(node: unknown, out: EgovArticleLight[]): void {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const it of node) walkArticles(it, out);
		return;
	}
	const obj = node as Record<string, unknown>;
	if ("ArticleTitle" in obj) {
		out.push(obj as EgovArticleLight);
		return;
	}
	for (const v of Object.values(obj)) walkArticles(v, out);
}

export function findArticleByTitle(
	articles: EgovArticleLight[],
	ref: ArticleRef,
): EgovArticleLight | undefined {
	const want = expectedArticleTitle(ref);
	for (const a of articles) {
		const title = textOf((a as Record<string, unknown>).ArticleTitle);
		if (title === want) return a;
	}
	return undefined;
}

export function findParagraph(
	paragraphs: EgovParagraphLight[],
	num: number,
): EgovParagraphLight | undefined {
	const want = String(num);
	for (const p of paragraphs) {
		if (numAttr(p) === want) return p;
	}
	return undefined;
}

export function findItemByTitle(
	items: EgovItemLight[],
	num: number,
): EgovItemLight | undefined {
	const want = arabicToKanjiNum(num);
	for (const it of items) {
		const title = textOf((it as Record<string, unknown>).ItemTitle);
		if (title === want) return it;
	}
	return undefined;
}

// Depth-first text collection. We skip the structural `*Title` and `Num`
// fields because they're administrative labels, not body text — surfacing them
// would inject "第百七条" / "1" / "２" markers into the middle of paragraphs.
// `ItemTitle` ("一", "二") is preserved because in a paragraph context the
// kanji label is what makes the list of items readable.
const SKIP_KEYS = new Set([
	"ArticleTitle",
	"Num",
	"ParagraphNum",
	"Delete",
	"Hide",
	"OldStyle",
	"OldNum",
]);

export function collectText(node: unknown): string {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (typeof node === "boolean") return "";
	if (node === null || node === undefined) return "";
	if (Array.isArray(node)) return node.map(collectText).join("");
	if (typeof node === "object") {
		const out: string[] = [];
		for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
			if (k.startsWith("@")) continue;
			if (SKIP_KEYS.has(k)) continue;
			if (k === "#text") {
				out.push(typeof v === "string" ? v : "");
				continue;
			}
			out.push(collectText(v));
		}
		return out.join("");
	}
	return "";
}

export interface ExtractedArticle {
	article_number: string;
	article_text: string;
	paragraph?: string;
	item?: string;
}

export function extractFromLawData(
	resp: EgovLawDataResponse,
	ref: ArticleRef,
): ExtractedArticle {
	const text = resp.law_full_text;
	if (!text || typeof text === "string") {
		throw new EgovApiError(
			0,
			"e-Gov returned no parseable law_full_text — try requesting json_format=light",
			false,
		);
	}
	const law = (text as { Law?: unknown }).Law;
	if (!law || typeof law !== "object") {
		throw new EgovApiError(0, "e-Gov law_full_text missing Law root", false);
	}
	const lawBody = (law as { LawBody?: unknown }).LawBody;
	if (!lawBody || typeof lawBody !== "object") {
		throw new EgovApiError(0, "e-Gov law_full_text missing LawBody", false);
	}

	// Walk MainProvision (and SupplProvision as a fallback for laws whose
	// articles are entirely in the appendix). Most v1 lookups land in
	// MainProvision; SupplProvision rarely carries top-level Articles but
	// when it does they're indexed the same way.
	const articles: EgovArticleLight[] = [];
	const main = (lawBody as { MainProvision?: unknown }).MainProvision;
	if (main) walkArticles(main, articles);
	if (articles.length === 0) {
		const suppl = (lawBody as { SupplProvision?: unknown }).SupplProvision;
		if (suppl) walkArticles(suppl, articles);
	}

	const article = findArticleByTitle(articles, ref);
	if (!article) {
		throw new EgovApiError(
			"article_not_found",
			`Article ${formatArticleRefJa(ref)} not found in this law`,
			false,
		);
	}

	const articleNumber = formatArticleRefJa({
		article: ref.article,
		article_branch: ref.article_branch,
	});
	const result: ExtractedArticle = {
		article_number: articleNumber,
		article_text: collectText(article),
	};

	if (ref.paragraph !== undefined) {
		const paragraphs = asArray<EgovParagraphLight>(article.Paragraph);
		const para = findParagraph(paragraphs, ref.paragraph);
		if (!para) {
			throw new EgovApiError(
				"paragraph_not_found",
				`Paragraph ${ref.paragraph} not found in ${articleNumber}`,
				false,
			);
		}
		result.paragraph = collectText(para);
		if (ref.item !== undefined) {
			const items = asArray<EgovItemLight>(
				(para as Record<string, unknown>).Item as EgovItemLight | EgovItemLight[] | undefined,
			);
			const item = findItemByTitle(items, ref.item);
			if (!item) {
				throw new EgovApiError(
					"item_not_found",
					`Item ${ref.item} not found in ${articleNumber} paragraph ${ref.paragraph}`,
					false,
				);
			}
			result.item = collectText(item);
		}
	}

	return result;
}

function readLawTitle(resp: EgovLawDataResponse): { ja: string; en: string } {
	const title =
		resp.revision_info?.law_title !== undefined ? String(resp.revision_info.law_title) : "";
	const text = resp.law_full_text;
	let inner = "";
	if (text && typeof text !== "string") {
		const law = (text as { Law?: unknown }).Law;
		if (law && typeof law === "object") {
			const body = (law as { LawBody?: unknown }).LawBody;
			if (body && typeof body === "object") {
				inner = textOf((body as { LawTitle?: unknown }).LawTitle);
			}
		}
	}
	const ja = title || inner;
	return { ja, en: ja };
}

export async function runGetArticle(
	client: EgovClient,
	input: GetArticleInput,
): Promise<GetArticleOutput> {
	const ref = parseArticleRef(input.article_ref);
	const resp = await client.getLawData(input.law_id, { json_format: "light" });
	const extracted = extractFromLawData(resp, ref);
	const { ja, en } = readLawTitle(resp);

	return {
		law_id: input.law_id,
		law_name: en,
		law_name_japanese: ja,
		article_number: extracted.article_number,
		article_text: extracted.article_text,
		...(extracted.paragraph !== undefined ? { paragraph: extracted.paragraph } : {}),
		...(extracted.item !== undefined ? { item: extracted.item } : {}),
		source_url: lawDetailUrl(input.law_id),
	};
}
