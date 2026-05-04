// Minimal typings for the e-Gov Hourei (Laws & Regulations) API v2 JSON
// responses. Reference:
//   Swagger UI:    https://laws.e-gov.go.jp/api/2/swagger-ui
//   OpenAPI YAML:  https://laws.e-gov.go.jp/api/2/swagger-ui/lawapi-v2.yaml
//
// Many fields are optional or returned as either an array or a single object
// depending on how many results matched, so most of these types are loose on
// purpose. Use `asArray` to normalise array-or-singleton fields before reading.

export interface EgovLawInfo {
	law_type?: string;
	law_id?: string;
	law_num?: string;
	law_num_era?: string;
	law_num_year?: number;
	law_num_type?: string;
	law_num_num?: string;
	promulgation_date?: string;
	[key: string]: unknown;
}

export interface EgovRevisionInfo {
	law_revision_id?: string;
	law_type?: string;
	law_title?: string;
	law_title_kana?: string;
	abbrev?: string;
	category?: string;
	updated?: string;
	amendment_promulgate_date?: string;
	amendment_enforcement_date?: string;
	amendment_enforcement_comment?: string;
	amendment_scheduled_enforcement_date?: string;
	amendment_law_id?: string;
	amendment_law_title?: string;
	amendment_law_title_kana?: string;
	amendment_law_num?: string;
	amendment_type?: string;
	repeal_status?: string;
	repeal_date?: string;
	remain_in_force?: boolean;
	mission?: string;
	current_revision_status?: string;
	[key: string]: unknown;
}

export interface EgovLawsListItem {
	law_info: EgovLawInfo;
	revision_info?: EgovRevisionInfo;
	current_revision_info?: EgovRevisionInfo;
}

export interface EgovLawsListResponse {
	total_count?: number;
	count?: number;
	next_offset?: number | null;
	laws?: EgovLawsListItem[];
}

// /law_data response. The `law_full_text` shape varies by `json_format`:
//   - "light" → simplified shape under Law.LawBody.MainProvision.Article[]
//   - "full"  → tag/attr/children tree
// We target "light" for article extraction.
export interface EgovLawDataResponse {
	attached_files_info?: unknown;
	law_info: EgovLawInfo;
	revision_info?: EgovRevisionInfo;
	law_full_text?: EgovLawFullTextLight | EgovLawFullTextFull | string;
}

// ---- Simplified ("light") full-text shape ----------------------------------

export interface EgovLawFullTextLight {
	Law?: EgovLawLight;
}

export interface EgovLawLight {
	LawNum?: string;
	LawBody?: EgovLawBodyLight;
}

export interface EgovLawBodyLight {
	LawTitle?: string | { "#text"?: string; [key: string]: unknown };
	MainProvision?: EgovMainProvisionLight;
	SupplProvision?: EgovSupplProvisionLight | EgovSupplProvisionLight[];
}

export interface EgovMainProvisionLight {
	Article?: EgovArticleLight | EgovArticleLight[];
	Part?: unknown;
	Chapter?: unknown;
}

export interface EgovSupplProvisionLight {
	Paragraph?: EgovParagraphLight | EgovParagraphLight[];
	[key: string]: unknown;
}

// In the simplified format, structural elements use a hybrid shape: they may
// carry attributes inline (e.g. `Num`) or nested under an `@attr`/`#text` key.
// We treat all string-valued sub-fields as text and rely on consumers to
// handle either form.
export interface EgovArticleLight {
	Num?: string | number;
	"@Num"?: string | number;
	ArticleTitle?: string;
	ArticleCaption?: string;
	Paragraph?: EgovParagraphLight | EgovParagraphLight[];
	[key: string]: unknown;
}

export interface EgovParagraphLight {
	Num?: string | number;
	"@Num"?: string | number;
	ParagraphSentence?: EgovSentenceContainerLight;
	Item?: EgovItemLight | EgovItemLight[];
	[key: string]: unknown;
}

export interface EgovItemLight {
	Num?: string | number;
	"@Num"?: string | number;
	ItemSentence?: EgovSentenceContainerLight;
	[key: string]: unknown;
}

export interface EgovSentenceContainerLight {
	Sentence?: EgovSentenceLight | EgovSentenceLight[] | string | string[];
	[key: string]: unknown;
}

export type EgovSentenceLight =
	| string
	| {
			"#text"?: string;
			[key: string]: unknown;
	  };

// ---- Detailed ("full") full-text shape -------------------------------------
//
// The detailed format wraps every element as { tag, attr, children }. We
// preserve it as `unknown`-shaped because we rarely need to walk it; tools
// should request `json_format=light` whenever possible.

export interface EgovLawFullTextFull {
	tag?: string;
	attr?: Record<string, string | undefined>;
	children?: unknown[];
}

// ---- Helpers ---------------------------------------------------------------

export function asArray<T>(value: T | T[] | undefined | null): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

// Read a string out of a value that might be a bare string or a `{#text}`
// wrapper produced by JSON-from-XML conversion.
export function textOf(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number") return String(value);
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const text = obj["#text"];
		if (typeof text === "string") return text;
		if (typeof text === "number") return String(text);
	}
	return "";
}

// Read a numeric/string `Num` attribute, tolerant of either inline-attribute
// (`Num`) or `@Num` styles. e-Gov's simplified JSON has historically used both.
export function numAttr(node: { Num?: string | number; "@Num"?: string | number }): string {
	if (node === null || node === undefined) return "";
	const direct = node.Num;
	if (direct !== undefined) return String(direct);
	const attr = node["@Num"];
	if (attr !== undefined) return String(attr);
	return "";
}
