import { z } from "zod";
import type { EgovClient } from "../egov/client";
import {
	DOMAINS,
	type DomainId,
	domainForLawId,
	lawDetailUrl,
} from "../egov/domains";
import type { EgovLawsListItem } from "../egov/types";

export const SEARCH_LAW_DESCRIPTION =
	"Search Japan laws and regulations by keyword or name. Returns matching laws with their IDs, names, promulgation date, and current revision date. Covers companies, labor, and privacy law domains in v1. Wildcard searches supported (use ? for single character). Information retrieval only — not legal advice. Consult a qualified attorney for case-specific guidance.";

export const searchLawInputSchema = {
	query: z.string().min(1, "query must not be empty"),
	domain: z.enum(["corporate", "labor", "privacy"]).optional(),
	limit: z.number().int().min(1).max(30).optional(),
};

export type SearchLawInput = {
	query: string;
	domain?: DomainId;
	limit?: number;
};

export interface SearchLawHit {
	law_id: string;
	law_num: string;
	name: string;
	name_japanese: string;
	promulgation_date: string;
	current_revision_date: string;
	domain: DomainId | "other";
	source_url: string;
}

export interface SearchLawOutput {
	laws: SearchLawHit[];
	total_count: number;
}

// Map a /laws response item into our wire format. Domain labelling uses the
// curated v1 whitelist; anything outside it is tagged "other".
export function itemToHit(item: EgovLawsListItem): SearchLawHit {
	const law_id = String(item.law_info?.law_id ?? "");
	const law_num = String(item.law_info?.law_num ?? "");
	const promulgation_date = String(item.law_info?.promulgation_date ?? "");
	const rev = item.current_revision_info ?? item.revision_info;
	const titleJa = String(rev?.law_title ?? "");
	const enFromDomain = (() => {
		const dom = domainForLawId(law_id);
		if (!dom) return undefined;
		// Use the canonical English short title for the curated laws.
		return DOMAINS[dom].primary_laws[0].replace(/\s*\([^)]*\)\s*$/, "");
	})();
	return {
		law_id,
		law_num,
		name: enFromDomain ?? titleJa,
		name_japanese: titleJa,
		promulgation_date,
		current_revision_date: String(
			rev?.amendment_promulgate_date ?? rev?.amendment_enforcement_date ?? "",
		),
		domain: domainForLawId(law_id) ?? "other",
		source_url: law_id ? lawDetailUrl(law_id) : "https://laws.e-gov.go.jp/",
	};
}

function matchesQuery(hit: SearchLawHit, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const haystacks = [hit.name, hit.name_japanese, hit.law_num];
	return haystacks.some((h) => h.toLowerCase().includes(q));
}

export async function runSearchLaw(
	client: EgovClient,
	input: SearchLawInput,
): Promise<SearchLawOutput> {
	const limit = input.limit ?? 10;

	if (input.domain) {
		// Domain-scoped: pull metadata for each curated law_id, then filter by
		// the user's query string. With a tiny v1 whitelist this is a 1–2 call
		// fetch, plus client-side substring match.
		const def = DOMAINS[input.domain];
		const hits: SearchLawHit[] = [];
		for (const id of def.primary_law_ids) {
			const resp = await client.searchLaws({ law_id: id, limit: 1 });
			const item = resp.laws?.[0];
			if (!item) continue;
			hits.push(itemToHit(item));
		}
		const matched = hits.filter((h) => matchesQuery(h, input.query));
		return {
			laws: matched.slice(0, limit),
			total_count: matched.length,
		};
	}

	// No domain: fall back to e-Gov's title-partial-match search.
	const resp = await client.searchLaws({ law_title: input.query, limit });
	const items = resp.laws ?? [];
	const hits = items.map(itemToHit);
	const total =
		typeof resp.total_count === "number" && Number.isFinite(resp.total_count)
			? resp.total_count
			: hits.length;
	return { laws: hits, total_count: total };
}
