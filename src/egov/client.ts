import {
	type CacheLike,
	DEFAULT_CACHE_TTL_SECONDS,
	buildCacheKey,
	readCache,
	writeCache,
} from "../utils/cache";
import {
	EgovApiError,
	EgovNetworkError,
	EgovNotFoundError,
	EgovRateLimitError,
	isRetryableHttpStatus,
} from "../utils/errors";
import type {
	EgovLawDataResponse,
	EgovLawsListResponse,
} from "./types";

export const EGOV_BASE_URL = "https://laws.e-gov.go.jp/api/2";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface EgovClientOptions {
	cache?: CacheLike;
	fetch?: FetchLike;
	cacheTtlSeconds?: number;
	maxRetries?: number;
	retryDelaysMs?: number[];
	maxRateLimitWaitMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY_DELAYS_MS = [200, 800];
const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 5000;

// Common /laws query parameters. The OpenAPI spec defines many more, but v1
// only uses these. `[key: string]` is open so callers can pass extras without
// type widening (e.g. wildcard tweaks added in March 2026).
export interface SearchLawsParams {
	law_id?: string;
	law_num?: string;
	law_title?: string;
	law_title_kana?: string;
	limit?: number;
	offset?: number;
	asof?: string;
	[key: string]: string | number | undefined;
}

export interface GetLawDataParams {
	asof?: string;
	json_format?: "full" | "light";
	law_full_text_format?: "json" | "xml";
	omit_amendment_suppl_provision?: boolean | string;
	include_attached_file_content?: boolean | string;
	[key: string]: string | number | boolean | undefined;
}

export interface GetLawRevisionsParams {
	law_title?: string;
	amendment_date_from?: string;
	amendment_date_to?: string;
	[key: string]: string | number | undefined;
}

// Loose typing for the /law_revisions response — only the fields the v1 tools
// touch are pinned. Other fields pass through as `unknown`.
export interface EgovLawRevisionsResponse {
	law_info?: { law_id?: string; law_num?: string; [key: string]: unknown };
	revisions?: Array<{
		law_revision_id?: string;
		law_title?: string;
		amendment_promulgate_date?: string;
		amendment_enforcement_date?: string;
		amendment_law_title?: string;
		amendment_type?: string;
		current_revision_status?: string;
		[key: string]: unknown;
	}>;
}

export class EgovClient {
	private readonly cache: CacheLike | undefined;
	private readonly fetchImpl: FetchLike;
	private readonly cacheTtlSeconds: number;
	private readonly maxRetries: number;
	private readonly retryDelaysMs: number[];
	private readonly maxRateLimitWaitMs: number;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(options: EgovClientOptions = {}) {
		this.cache = options.cache;
		this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
		this.cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
		this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
		this.maxRetries = options.maxRetries ?? this.retryDelaysMs.length;
		this.maxRateLimitWaitMs = options.maxRateLimitWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS;
		this.sleep =
			options.sleep ??
			((ms: number) =>
				new Promise<void>((resolve) => {
					setTimeout(resolve, ms);
				}));
	}

	searchLaws(params: SearchLawsParams = {}): Promise<EgovLawsListResponse> {
		return this.request<EgovLawsListResponse>(
			"laws",
			"laws",
			{ ...params, response_format: "json" },
			null,
		);
	}

	getLawData(law_id: string, params: GetLawDataParams = {}): Promise<EgovLawDataResponse> {
		const merged: Record<string, string | number | undefined> = {
			response_format: "json",
			law_full_text_format: params.law_full_text_format ?? "json",
			json_format: params.json_format ?? "light",
		};
		for (const [k, v] of Object.entries(params)) {
			if (v === undefined) continue;
			merged[k] = typeof v === "boolean" ? String(v) : v;
		}
		return this.request<EgovLawDataResponse>(
			`law_data/${encodeURIComponent(law_id)}`,
			"law_data",
			merged,
			law_id,
		);
	}

	getLawRevisions(
		law_id: string,
		params: GetLawRevisionsParams = {},
	): Promise<EgovLawRevisionsResponse> {
		return this.request<EgovLawRevisionsResponse>(
			`law_revisions/${encodeURIComponent(law_id)}`,
			"law_revisions",
			{ ...params, response_format: "json" },
			law_id,
		);
	}

	// `path` is the URL suffix relative to the base (path params already
	// inlined). `cacheNamespace` is the static endpoint family name that all
	// instances of this call share — keeps cache keys readable. `lawIdForNotFound`
	// turns a 404 into an EgovNotFoundError carrying the law_id, when the
	// endpoint takes a law_id as a path param.
	private async request<T>(
		path: string,
		cacheNamespace: string,
		params: Record<string, string | number | undefined>,
		lawIdForNotFound: string | null,
	): Promise<T> {
		const cleanParams: Record<string, string | number | undefined> = {};
		for (const [k, v] of Object.entries(params)) {
			if (v === undefined || v === null || v === "") continue;
			cleanParams[k] = v;
		}

		// Cache key includes the path so /law_data/A vs /law_data/B don't collide.
		const cacheKey = await buildCacheKey(`${cacheNamespace}:${path}`, cleanParams);
		const cached = await readCache<T>(this.cache, cacheKey);
		if (cached) return cached;

		const url = this.buildUrl(path, cleanParams);
		const response = await this.fetchWithRetry(url, lawIdForNotFound);
		const text = await response.text();

		if (!response.ok) {
			this.throwForHttpError(response, text, lawIdForNotFound);
		}

		let payload: unknown;
		try {
			payload = JSON.parse(text);
		} catch {
			throw new EgovApiError(0, "e-Gov returned invalid JSON", true);
		}

		await writeCache(this.cache, cacheKey, payload, this.cacheTtlSeconds);
		return payload as T;
	}

	private buildUrl(path: string, params: Record<string, string | number | undefined>): string {
		const url = new URL(`${EGOV_BASE_URL}/${path}`);
		for (const [k, v] of Object.entries(params)) {
			if (v === undefined || v === null || v === "") continue;
			url.searchParams.set(k, String(v));
		}
		return url.toString();
	}

	private async fetchWithRetry(url: string, lawIdForNotFound: string | null): Promise<Response> {
		let attempt = 0;
		while (true) {
			let response: Response;
			try {
				response = await this.fetchImpl(url);
			} catch (err) {
				if (attempt >= this.maxRetries) {
					const msg = err instanceof Error ? err.message : "fetch failed";
					throw new EgovNetworkError(msg);
				}
				await this.sleep(this.delayForAttempt(attempt));
				attempt++;
				continue;
			}

			if (response.status === 429) {
				const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
				const waitMs = retryAfter !== null ? retryAfter * 1000 : this.delayForAttempt(attempt);
				if (waitMs <= this.maxRateLimitWaitMs && attempt < this.maxRetries) {
					await this.sleep(waitMs);
					attempt++;
					continue;
				}
				throw new EgovRateLimitError(retryAfter);
			}

			// Don't retry on 404 — it's a domain "not found", not a transient
			// failure. Let the response fall through so throwForHttpError can
			// raise EgovNotFoundError.
			if (response.status === 404) return response;

			if (isRetryableHttpStatus(response.status) && attempt < this.maxRetries) {
				await this.sleep(this.delayForAttempt(attempt));
				attempt++;
				continue;
			}

			return response;
		}
	}

	private delayForAttempt(attempt: number): number {
		if (this.retryDelaysMs.length === 0) return 0;
		const idx = Math.min(attempt, this.retryDelaysMs.length - 1);
		return this.retryDelaysMs[idx];
	}

	private throwForHttpError(
		response: Response,
		body: string,
		lawIdForNotFound: string | null,
	): never {
		if (response.status === 404 && lawIdForNotFound) {
			throw new EgovNotFoundError(lawIdForNotFound);
		}
		// e-Gov errors come back as { code: string, message: string } per the
		// OpenAPI spec. Surface the upstream code/message when present.
		let code: number | string = response.status;
		let message = `e-Gov HTTP ${response.status}`;
		try {
			const parsed = JSON.parse(body);
			if (parsed && typeof parsed === "object") {
				const c = (parsed as Record<string, unknown>).code;
				const m = (parsed as Record<string, unknown>).message;
				if (typeof c === "string" || typeof c === "number") code = c;
				if (typeof m === "string") message = `e-Gov ${response.status}: ${m}`;
			}
		} catch {
			// Body wasn't JSON — keep the default message.
			const trimmed = body.trim();
			if (trimmed) message = `e-Gov HTTP ${response.status}: ${trimmed.slice(0, 200)}`;
		}
		throw new EgovApiError(code, message, isRetryableHttpStatus(response.status));
	}
}

function parseRetryAfter(value: string | null): number | null {
	if (!value) return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds;
	const date = Date.parse(value);
	if (!Number.isNaN(date)) {
		const delta = Math.ceil((date - Date.now()) / 1000);
		return delta > 0 ? delta : 0;
	}
	return null;
}
