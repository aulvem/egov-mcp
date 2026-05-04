import { z } from "zod";
import { parseArticleRef } from "../egov/article_parser";
import type { EgovClient } from "../egov/client";
import { lawDetailUrl } from "../egov/domains";
import { extractFromLawData } from "./get_article";

export const COMPARE_REVISIONS_DESCRIPTION =
	"Compare two revisions of a specific Japan law article. Returns the text from each revision side-by-side, with the publication dates of each version. Useful for tracking how a regulation has evolved. For research and reference only — not legal advice.";

// Accept YYYY or YYYY-MM-DD. e-Gov's `asof` parameter takes ISO dates; for a
// bare year we pad to YYYY-12-31 so callers asking about "the 2020 revision"
// get the most recent in-force version of that year.
export const REVISION_DATE_REGEX = /^\d{4}(?:-\d{2}-\d{2})?$/;

export const compareRevisionsInputSchema = {
	law_id: z.string().min(1, "law_id is required"),
	article_ref: z.string().min(1, "article_ref is required"),
	revision_a_date: z
		.string()
		.regex(REVISION_DATE_REGEX, "revision_a_date must be YYYY or YYYY-MM-DD"),
	revision_b_date: z
		.string()
		.regex(REVISION_DATE_REGEX, "revision_b_date must be YYYY or YYYY-MM-DD"),
};

export type CompareRevisionsInput = {
	law_id: string;
	article_ref: string;
	revision_a_date: string;
	revision_b_date: string;
};

export interface CompareRevisionsOutput {
	law_id: string;
	article_number: string;
	revision_a: { date: string; text: string };
	revision_b: { date: string; text: string };
	text_changed: boolean;
	source_url: string;
}

export function expandDate(input: string): string {
	if (/^\d{4}$/.test(input)) return `${input}-12-31`;
	return input;
}

export async function runCompareRevisions(
	client: EgovClient,
	input: CompareRevisionsInput,
): Promise<CompareRevisionsOutput> {
	const ref = parseArticleRef(input.article_ref);
	const asofA = expandDate(input.revision_a_date);
	const asofB = expandDate(input.revision_b_date);

	const [respA, respB] = await Promise.all([
		client.getLawData(input.law_id, { json_format: "light", asof: asofA }),
		client.getLawData(input.law_id, { json_format: "light", asof: asofB }),
	]);

	const a = extractFromLawData(respA, ref);
	const b = extractFromLawData(respB, ref);

	return {
		law_id: input.law_id,
		article_number: a.article_number,
		revision_a: { date: input.revision_a_date, text: a.article_text },
		revision_b: { date: input.revision_b_date, text: b.article_text },
		text_changed: a.article_text !== b.article_text,
		source_url: lawDetailUrl(input.law_id),
	};
}
