// Hardcoded e-Gov law_id values for the v1 domain set.
//
// The law_id format is `<era><year><type><number>`:
//   - era:    1 digit (3=Showa, 4=Heisei, 5=Reiwa)
//   - year:   2 digits, era-year, zero-padded
//   - type:   2 letters (AC = Act / 法律, CO = Cabinet Order, etc.)
//   - number: 10 digits, zero-padded
//
// IDs below were confirmed by browsing the canonical e-Gov page for each law.
// The `source_url` points to the modern law-detail page on laws.e-gov.go.jp.

// Companies Act — 会社法 (平成17年法律第86号)
// Source: https://laws.e-gov.go.jp/law/417AC0000000086
export const COMPANIES_ACT_LAW_ID = "417AC0000000086";

// Labor Standards Act — 労働基準法 (昭和22年法律第49号)
// Source: https://laws.e-gov.go.jp/law/322AC0000000049
export const LABOR_STANDARDS_ACT_LAW_ID = "322AC0000000049";

// Act on the Protection of Personal Information / APPI — 個人情報保護法
// (平成15年法律第57号)
// Source: https://laws.e-gov.go.jp/law/415AC0000000057
export const APPI_LAW_ID = "415AC0000000057";

export type DomainId = "corporate" | "labor" | "privacy";

export interface DomainDefinition {
	domain_id: DomainId;
	name: string;
	name_japanese: string;
	description: string;
	primary_law_ids: string[];
	primary_laws: string[];
	source_url: string;
}

export const DOMAINS: Record<DomainId, DomainDefinition> = {
	corporate: {
		domain_id: "corporate",
		name: "Corporate Law",
		name_japanese: "会社法・商法",
		description:
			"Japan corporate-law domain (会社法). Covers incorporation, shareholder rights, directors' duties, mergers, and disclosure obligations. v1 indexes the Companies Act.",
		primary_law_ids: [COMPANIES_ACT_LAW_ID],
		primary_laws: ["Companies Act (会社法)"],
		source_url: "https://laws.e-gov.go.jp/law/417AC0000000086",
	},
	labor: {
		domain_id: "labor",
		name: "Labor Law",
		name_japanese: "労働法",
		description:
			"Japan labor-law domain (労働法). Covers working hours, wages, dismissal, and HR compliance for foreign subsidiaries. v1 indexes the Labor Standards Act.",
		primary_law_ids: [LABOR_STANDARDS_ACT_LAW_ID],
		primary_laws: ["Labor Standards Act (労働基準法)"],
		source_url: "https://laws.e-gov.go.jp/law/322AC0000000049",
	},
	privacy: {
		domain_id: "privacy",
		name: "Privacy / Personal Information Protection",
		name_japanese: "個人情報保護法",
		description:
			"Japan privacy / personal-information-protection domain. Covers handling of personal data, cross-border transfer, and GDPR-comparable obligations. v1 indexes APPI.",
		primary_law_ids: [APPI_LAW_ID],
		primary_laws: ["Act on the Protection of Personal Information (個人情報保護法)"],
		source_url: "https://laws.e-gov.go.jp/law/415AC0000000057",
	},
};

export const DOMAIN_IDS: DomainId[] = ["corporate", "labor", "privacy"];

export function isDomainId(value: string): value is DomainId {
	return value === "corporate" || value === "labor" || value === "privacy";
}

// Reverse lookup: given a law_id, return its domain (or undefined if it isn't
// in v1's whitelist). Used by search_law to label results.
export function domainForLawId(law_id: string): DomainId | undefined {
	for (const id of DOMAIN_IDS) {
		if (DOMAINS[id].primary_law_ids.includes(law_id)) return id;
	}
	return undefined;
}

export function lawDetailUrl(law_id: string): string {
	return `https://laws.e-gov.go.jp/law/${encodeURIComponent(law_id)}`;
}
