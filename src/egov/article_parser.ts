// Parse article-reference strings into a normalised structure.
//
// Supported input forms:
//   "Article 107"
//   "第107条"
//   "Article 9, Paragraph 2"
//   "第9条第2項"
//   "第9条第2項第1号"
//   "第325条の3"
//   "Art. 107(2)(1)"
//
// Mixed forms (e.g. "Article 9 第2項") are intentionally rejected — accepting
// them would make the grammar ambiguous and hide caller mistakes.

export interface ArticleRef {
	article: number;
	// e-Gov branch articles like 第325条の3 ("Article 325-3"). We store the
	// branch in the canonical Japanese form so the article identity round-trips
	// regardless of which input style the caller used.
	article_branch?: string;
	paragraph?: number;
	item?: number;
}

export class ArticleRefParseError extends Error {
	constructor(input: string) {
		super(`Could not parse article reference: ${JSON.stringify(input)}`);
		this.name = "ArticleRefParseError";
	}
}

const JAPANESE_RE =
	/^第\s*(\d+)\s*条(?:\s*の\s*(\d+))?(?:\s*第\s*(\d+)\s*項)?(?:\s*第\s*(\d+)\s*号)?$/;

const ENGLISH_LONG_RE =
	/^article\s+(\d+)(?:\s*-\s*(\d+))?(?:\s*,\s*paragraph\s+(\d+))?(?:\s*,\s*item\s+(\d+))?$/i;

const ENGLISH_COMPACT_RE =
	/^art\.?\s*(\d+)(?:\s*-\s*(\d+))?(?:\s*\(\s*(\d+)\s*\))?(?:\s*\(\s*(\d+)\s*\))?$/i;

function toInt(s: string | undefined): number | undefined {
	if (s === undefined) return undefined;
	const n = Number(s);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

function buildBranch(branch: string | undefined): string | undefined {
	if (branch === undefined) return undefined;
	const n = Number(branch);
	if (!Number.isFinite(n) || n <= 0) return undefined;
	return `の${n}`;
}

export function parseArticleRef(input: string): ArticleRef {
	if (typeof input !== "string") throw new ArticleRefParseError(String(input));
	const trimmed = input.trim();
	if (!trimmed) throw new ArticleRefParseError(input);

	// Try Japanese form first — has the most expressive grammar.
	const ja = trimmed.match(JAPANESE_RE);
	if (ja) {
		const article = toInt(ja[1]);
		if (article === undefined) throw new ArticleRefParseError(input);
		const ref: ArticleRef = { article };
		const branch = buildBranch(ja[2]);
		if (branch) ref.article_branch = branch;
		const paragraph = toInt(ja[3]);
		if (paragraph !== undefined) ref.paragraph = paragraph;
		const item = toInt(ja[4]);
		if (item !== undefined) ref.item = item;
		return ref;
	}

	// English compact "Art. 107(2)(1)" — try before the long form so the more
	// specific pattern wins.
	const compact = trimmed.match(ENGLISH_COMPACT_RE);
	if (compact && /^art\.?/i.test(trimmed) && !/^article/i.test(trimmed)) {
		const article = toInt(compact[1]);
		if (article === undefined) throw new ArticleRefParseError(input);
		const ref: ArticleRef = { article };
		const branch = buildBranch(compact[2]);
		if (branch) ref.article_branch = branch;
		const paragraph = toInt(compact[3]);
		if (paragraph !== undefined) ref.paragraph = paragraph;
		const item = toInt(compact[4]);
		if (item !== undefined) ref.item = item;
		return ref;
	}

	// English long form: "Article 9, Paragraph 2".
	const en = trimmed.match(ENGLISH_LONG_RE);
	if (en) {
		const article = toInt(en[1]);
		if (article === undefined) throw new ArticleRefParseError(input);
		const ref: ArticleRef = { article };
		const branch = buildBranch(en[2]);
		if (branch) ref.article_branch = branch;
		const paragraph = toInt(en[3]);
		if (paragraph !== undefined) ref.paragraph = paragraph;
		const item = toInt(en[4]);
		if (item !== undefined) ref.item = item;
		return ref;
	}

	throw new ArticleRefParseError(input);
}

// Format a parsed reference as a human-readable Japanese string. Used for
// labelling responses regardless of the input style the caller provided.
export function formatArticleRefJa(ref: ArticleRef): string {
	let out = `第${ref.article}条`;
	if (ref.article_branch) out += ref.article_branch;
	if (ref.paragraph !== undefined) out += `第${ref.paragraph}項`;
	if (ref.item !== undefined) out += `第${ref.item}号`;
	return out;
}

// e-Gov's "light" JSON renders article and item numbers as kanji strings
// (e.g. ArticleTitle "第百七条", ItemTitle "一"). To match these against a
// numeric ArticleRef we convert in the forward direction (arabic → kanji).
//
// Supports 1..99999 — well above the largest article counts we'd ever see in
// a Japanese statute (the longest, 民法, has under 1100 articles).
const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function arabicToKanjiNum(n: number): string {
	if (!Number.isInteger(n) || n < 0) return String(n);
	if (n === 0) return "〇";
	let out = "";
	let rem = n;
	if (rem >= 10000) {
		const d = Math.floor(rem / 10000);
		out += arabicToKanjiNum(d) + "万";
		rem %= 10000;
		if (rem === 0) return out;
	}
	if (rem >= 1000) {
		const d = Math.floor(rem / 1000);
		out += (d === 1 ? "" : KANJI_DIGITS[d]) + "千";
		rem %= 1000;
	}
	if (rem >= 100) {
		const d = Math.floor(rem / 100);
		out += (d === 1 ? "" : KANJI_DIGITS[d]) + "百";
		rem %= 100;
	}
	if (rem >= 10) {
		const d = Math.floor(rem / 10);
		out += (d === 1 ? "" : KANJI_DIGITS[d]) + "十";
		rem %= 10;
	}
	if (rem > 0) {
		out += KANJI_DIGITS[rem];
	}
	return out;
}

// Build the canonical kanji ArticleTitle e-Gov uses to label this article.
// Examples:
//   { article: 107 }                        → "第百七条"
//   { article: 325, article_branch: "の3" } → "第三百二十五条の三"
export function expectedArticleTitle(ref: ArticleRef): string {
	const branch = ref.article_branch
		? ref.article_branch.replace(/(\d+)/, (_, d) => arabicToKanjiNum(Number(d)))
		: "";
	return `第${arabicToKanjiNum(ref.article)}条${branch}`;
}
