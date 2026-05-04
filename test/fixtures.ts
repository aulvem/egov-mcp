/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { FetchLike } from "../src/egov/client";
import type { CacheLike } from "../src/utils/cache";

export function jsonResponse(body: object, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export function plainResponse(text: string, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(text, { status, headers });
}

export interface FetchCall {
	url: string;
	init?: RequestInit;
}

export function makeFetchMock(responses: Array<Response | (() => Response)>): {
	fetch: FetchLike;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	let i = 0;
	const fetchImpl: FetchLike = async (input, init) => {
		calls.push({ url: String(input), init });
		const next = responses[Math.min(i, responses.length - 1)];
		i++;
		if (typeof next === "function") return next();
		return next;
	};
	return { fetch: fetchImpl, calls };
}

export class MemoryCache implements CacheLike {
	private store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value);
	}

	size(): number {
		return this.store.size;
	}

	has(key: string): boolean {
		return this.store.has(key);
	}
}

// ---------------------------------------------------------------------------
// Sample /laws response — Companies Act (会社法), trimmed to just the fields
// the v1 tools actually read.
// ---------------------------------------------------------------------------
export const SAMPLE_LAWS_LIST_COMPANIES = {
	total_count: 1,
	count: 1,
	next_offset: null,
	laws: [
		{
			law_info: {
				law_type: "Act",
				law_id: "417AC0000000086",
				law_num: "平成十七年法律第八十六号",
				law_num_era: "Heisei",
				law_num_year: 17,
				law_num_type: "Act",
				law_num_num: "086",
				promulgation_date: "2005-07-26",
			},
			revision_info: {
				law_revision_id: "417AC0000000086_20240701_xxxxxxxxxx",
				law_title: "会社法",
				law_title_kana: "かいしゃほう",
				updated: "2024-07-01T00:00:00+09:00",
				amendment_promulgate_date: "2024-06-15",
				amendment_enforcement_date: "2024-07-01",
				current_revision_status: "CurrentEnforced",
			},
			current_revision_info: {
				law_revision_id: "417AC0000000086_20240701_xxxxxxxxxx",
				law_title: "会社法",
				law_title_kana: "かいしゃほう",
				updated: "2024-07-01T00:00:00+09:00",
				amendment_promulgate_date: "2024-06-15",
				amendment_enforcement_date: "2024-07-01",
				current_revision_status: "CurrentEnforced",
			},
		},
	],
};

export const SAMPLE_LAWS_LIST_LABOR = {
	total_count: 1,
	count: 1,
	next_offset: null,
	laws: [
		{
			law_info: {
				law_type: "Act",
				law_id: "322AC0000000049",
				law_num: "昭和二十二年法律第四十九号",
				promulgation_date: "1947-04-07",
			},
			current_revision_info: {
				law_title: "労働基準法",
				law_title_kana: "ろうどうきじゅんほう",
				amendment_promulgate_date: "2023-04-01",
				amendment_enforcement_date: "2023-04-01",
				current_revision_status: "CurrentEnforced",
			},
		},
	],
};

export const SAMPLE_LAWS_LIST_PRIVACY = {
	total_count: 1,
	count: 1,
	next_offset: null,
	laws: [
		{
			law_info: {
				law_type: "Act",
				law_id: "415AC0000000057",
				law_num: "平成十五年法律第五十七号",
				promulgation_date: "2003-05-30",
			},
			current_revision_info: {
				law_title: "個人情報の保護に関する法律",
				law_title_kana: "こじんじょうほうのほごにかんするほうりつ",
				amendment_promulgate_date: "2022-04-01",
				amendment_enforcement_date: "2022-04-01",
				current_revision_status: "CurrentEnforced",
			},
		},
	],
};

export const SAMPLE_LAWS_LIST_EMPTY = {
	total_count: 0,
	count: 0,
	next_offset: null,
	laws: [],
};

// ---------------------------------------------------------------------------
// Sample /law_data (json_format=light) response. Mirrors the real e-Gov v2
// shape: Article identity carried in `ArticleTitle` (kanji like "第百七条"),
// items in `ItemTitle` (kanji like "一"), Sentence as a string array. Articles
// are nested inside Part → Chapter to exercise the recursive walkArticles path.
// ---------------------------------------------------------------------------
export const SAMPLE_LAW_DATA_COMPANIES = {
	law_info: {
		law_id: "417AC0000000086",
		law_num: "平成十七年法律第八十六号",
		promulgation_date: "2005-07-26",
	},
	revision_info: {
		law_title: "会社法",
		amendment_promulgate_date: "2024-06-15",
	},
	law_full_text: {
		Law: {
			LawNum: "平成十七年法律第八十六号",
			LawBody: {
				LawTitle: "会社法",
				MainProvision: {
					Part: [
						{
							PartTitle: ["第一編　総則"],
							Chapter: [
								{
									ChapterTitle: ["第二章　会社の商号"],
									Article: [
										{
											ArticleCaption: "（会社の商号）",
											ArticleTitle: "第九条",
											Paragraph: [
												{
													ParagraphNum: null,
													Num: "1",
													ParagraphSentence: { Sentence: ["第九条第一項の本文。"] },
												},
												{
													ParagraphNum: "２",
													Num: "2",
													ParagraphSentence: { Sentence: ["第九条第二項の柱書。"] },
													Item: [
														{ ItemTitle: "一", ItemSentence: { Sentence: ["第一号の文言。"] } },
														{ ItemTitle: "二", ItemSentence: { Sentence: ["第二号の文言。"] } },
													],
												},
											],
										},
									],
								},
							],
						},
						{
							PartTitle: ["第二編　株式会社"],
							Chapter: [
								{
									ChapterTitle: ["第二章　株式"],
									Article: [
										{
											ArticleCaption: "（株式の内容についての特別の定め）",
											ArticleTitle: "第百七条",
											Paragraph: [
												{
													ParagraphNum: null,
													Num: "1",
													ParagraphSentence: { Sentence: ["第百七条の本文。"] },
												},
											],
										},
										{
											ArticleTitle: "第三百二十五条の三",
											Paragraph: [
												{
													ParagraphNum: null,
													Num: "1",
													ParagraphSentence: { Sentence: ["枝条文の本文。"] },
												},
											],
										},
									],
								},
							],
						},
					],
				},
			},
		},
	},
};

// Same law, simulated older revision — Article 9 paragraph 1 text is different.
export const SAMPLE_LAW_DATA_COMPANIES_OLD = {
	law_info: {
		law_id: "417AC0000000086",
		law_num: "平成十七年法律第八十六号",
		promulgation_date: "2005-07-26",
	},
	revision_info: {
		law_title: "会社法",
		amendment_promulgate_date: "2015-05-01",
	},
	law_full_text: {
		Law: {
			LawNum: "平成十七年法律第八十六号",
			LawBody: {
				LawTitle: "会社法",
				MainProvision: {
					Part: [
						{
							PartTitle: ["第一編　総則"],
							Chapter: [
								{
									ChapterTitle: ["第二章　会社の商号"],
									Article: [
										{
											ArticleTitle: "第九条",
											Paragraph: [
												{
													ParagraphNum: null,
													Num: "1",
													ParagraphSentence: { Sentence: ["第九条第一項の旧本文。"] },
												},
											],
										},
										{
											ArticleTitle: "第百七条",
											Paragraph: [
												{
													ParagraphNum: null,
													Num: "1",
													ParagraphSentence: { Sentence: ["第百七条の本文。"] },
												},
											],
										},
									],
								},
							],
						},
					],
				},
			},
		},
	},
};

export const SAMPLE_REVISIONS = {
	law_info: {
		law_id: "417AC0000000086",
		law_num: "平成十七年法律第八十六号",
	},
	revisions: [
		{
			law_revision_id: "417AC0000000086_20150501_xxx",
			law_title: "会社法",
			amendment_promulgate_date: "2015-05-01",
			amendment_enforcement_date: "2015-05-01",
			amendment_law_title: "会社法の一部を改正する法律",
			amendment_type: "3",
			current_revision_status: "PreviousEnforced",
		},
		{
			law_revision_id: "417AC0000000086_20240701_xxx",
			law_title: "会社法",
			amendment_promulgate_date: "2024-06-15",
			amendment_enforcement_date: "2024-07-01",
			amendment_law_title: "会社法の一部を改正する法律(令和六年)",
			amendment_type: "3",
			current_revision_status: "CurrentEnforced",
		},
	],
};

export const SAMPLE_EGOV_ERROR = {
	code: "400001",
	message: "指定された法令IDの形式が不正です。",
};
