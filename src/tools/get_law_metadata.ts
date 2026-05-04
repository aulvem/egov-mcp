import { z } from "zod";
import type { EgovClient } from "../egov/client";
import { domainForLawId, DOMAINS, lawDetailUrl } from "../egov/domains";
import type { EgovLawsListItem } from "../egov/types";

export const GET_LAW_METADATA_DESCRIPTION =
	"Get full metadata for a Japan law: promulgation date, latest revision date, related ordinances, scope of application, and notes on major amendments. Essential for confirming which version of a law was in effect at a given time.";

export const getLawMetadataInputSchema = {
	law_id: z.string().min(1, "law_id is required"),
};

export type GetLawMetadataInput = { law_id: string };

export interface MajorRevision {
	revision_date: string;
	summary?: string;
}

export interface GetLawMetadataOutput {
	law_id: string;
	law_num: string;
	name: string;
	name_japanese: string;
	promulgation_date: string;
	current_revision_date: string;
	effective_date?: string;
	major_revisions: MajorRevision[];
	related_ordinances?: string[];
	scope?: string;
	source_url: string;
}

function englishNameForDomain(law_id: string): string | undefined {
	const dom = domainForLawId(law_id);
	if (!dom) return undefined;
	return DOMAINS[dom].primary_laws[0].replace(/\s*\([^)]*\)\s*$/, "");
}

export function shapeMetadataFromList(
	law_id: string,
	item: EgovLawsListItem | undefined,
	revisions: Array<{ amendment_promulgate_date?: string; amendment_law_title?: string }> = [],
): GetLawMetadataOutput {
	const law_num = String(item?.law_info?.law_num ?? "");
	const promulgation_date = String(item?.law_info?.promulgation_date ?? "");
	const rev = item?.current_revision_info ?? item?.revision_info;
	const titleJa = String(rev?.law_title ?? "");
	const enName = englishNameForDomain(law_id);

	const current_revision_date = String(
		rev?.amendment_promulgate_date ?? rev?.amendment_enforcement_date ?? "",
	);
	const effective_date = rev?.amendment_enforcement_date
		? String(rev.amendment_enforcement_date)
		: undefined;

	const major_revisions: MajorRevision[] = [];
	for (const r of revisions) {
		const date = String(r.amendment_promulgate_date ?? "");
		if (!date) continue;
		const title = r.amendment_law_title ? String(r.amendment_law_title) : undefined;
		major_revisions.push(title ? { revision_date: date, summary: title } : { revision_date: date });
	}
	// Most-recent first.
	major_revisions.sort((a, b) => (a.revision_date > b.revision_date ? -1 : 1));

	return {
		law_id,
		law_num,
		name: enName ?? titleJa,
		name_japanese: titleJa,
		promulgation_date,
		current_revision_date,
		...(effective_date ? { effective_date } : {}),
		major_revisions,
		source_url: lawDetailUrl(law_id),
	};
}

export async function runGetLawMetadata(
	client: EgovClient,
	input: GetLawMetadataInput,
): Promise<GetLawMetadataOutput> {
	// /laws?law_id=<id> gives us the headline metadata (title, num, dates) and
	// /law_revisions/<id> gives the amendment history. Run both in parallel.
	const [listResp, revsResp] = await Promise.all([
		client.searchLaws({ law_id: input.law_id, limit: 1 }),
		client.getLawRevisions(input.law_id).catch(() => ({ revisions: [] })),
	]);
	const item = listResp.laws?.[0];
	return shapeMetadataFromList(input.law_id, item, revsResp.revisions ?? []);
}
