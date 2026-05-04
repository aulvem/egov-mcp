import type { EgovClient } from "../egov/client";
import { DOMAINS, DOMAIN_IDS, type DomainId } from "../egov/domains";

export const LIST_CATEGORIES_DESCRIPTION =
	"List all top-level legal domains available in this MCP server (currently corporate, labor, and privacy law). Call this first when you don't know what's available, then use search_law within a chosen domain.";

export interface ListCategoriesCategory {
	domain_id: DomainId;
	name: string;
	description: string;
	primary_laws: string[];
	last_updated: string;
}

export interface ListCategoriesOutput {
	categories: ListCategoriesCategory[];
}

// Pull the most recent revision date for the canonical law of each domain so
// callers can tell whether their cached snapshot is stale. A failure on any
// single domain falls back to an empty string rather than failing the whole
// call — list_categories is the discovery entry point and must stay reliable.
export async function runListCategories(client: EgovClient): Promise<ListCategoriesOutput> {
	const categories: ListCategoriesCategory[] = [];
	for (const id of DOMAIN_IDS) {
		const def = DOMAINS[id];
		let last_updated = "";
		try {
			const primary = def.primary_law_ids[0];
			if (primary) {
				const resp = await client.searchLaws({ law_id: primary, limit: 1 });
				const item = resp.laws?.[0];
				const rev = item?.current_revision_info ?? item?.revision_info;
				last_updated = String(
					rev?.amendment_promulgate_date ?? rev?.amendment_enforcement_date ?? rev?.updated ?? "",
				);
			}
		} catch {
			last_updated = "";
		}
		categories.push({
			domain_id: id,
			name: def.name,
			description: def.description,
			primary_laws: def.primary_laws,
			last_updated,
		});
	}
	return { categories };
}
