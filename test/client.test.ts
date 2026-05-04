import { describe, expect, it } from "vitest";
import { EgovClient } from "../src/egov/client";
import {
	EgovApiError,
	EgovNetworkError,
	EgovNotFoundError,
	EgovRateLimitError,
} from "../src/utils/errors";
import {
	jsonResponse,
	makeFetchMock,
	MemoryCache,
	plainResponse,
	SAMPLE_EGOV_ERROR,
	SAMPLE_LAWS_LIST_COMPANIES,
	SAMPLE_LAW_DATA_COMPANIES,
} from "./fixtures";

describe("EgovClient", () => {
	it("hits the cache on a second identical request", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAWS_LIST_COMPANIES)]);
		const client = new EgovClient({ cache, fetch });

		const a = await client.searchLaws({ law_id: "417AC0000000086" });
		const b = await client.searchLaws({ law_id: "417AC0000000086" });

		expect(a).toEqual(SAMPLE_LAWS_LIST_COMPANIES);
		expect(b).toEqual(SAMPLE_LAWS_LIST_COMPANIES);
		expect(calls).toHaveLength(1);
		expect(cache.size()).toBe(1);
	});

	it("uses different cache keys for different params", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
		]);
		const client = new EgovClient({ cache, fetch });
		await client.searchLaws({ law_title: "会社" });
		await client.searchLaws({ law_title: "労働" });
		expect(calls).toHaveLength(2);
		expect(cache.size()).toBe(2);
	});

	it("retries on network failure with exponential backoff", async () => {
		const sleeps: number[] = [];
		let n = 0;
		const fetchImpl = async () => {
			n++;
			if (n < 3) throw new Error("ECONNRESET");
			return jsonResponse(SAMPLE_LAWS_LIST_COMPANIES);
		};
		const client = new EgovClient({
			fetch: fetchImpl,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		const result = await client.searchLaws({ law_title: "会社" });
		expect(result).toEqual(SAMPLE_LAWS_LIST_COMPANIES);
		expect(n).toBe(3);
		expect(sleeps).toEqual([200, 800]);
	});

	it("gives up as EgovNetworkError after exhausting retries", async () => {
		const sleeps: number[] = [];
		const client = new EgovClient({
			fetch: async () => {
				throw new Error("offline");
			},
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		await expect(client.searchLaws({ law_title: "x" })).rejects.toBeInstanceOf(EgovNetworkError);
		expect(sleeps).toEqual([200, 800]);
	});

	it("turns 404 from /law_data into EgovNotFoundError carrying the law_id", async () => {
		const { fetch } = makeFetchMock([plainResponse("not found", 404)]);
		const client = new EgovClient({ fetch });
		try {
			await client.getLawData("999AC0000000999");
			throw new Error("expected error");
		} catch (err) {
			expect(err).toBeInstanceOf(EgovNotFoundError);
			expect((err as EgovNotFoundError).law_id).toBe("999AC0000000999");
		}
	});

	it("surfaces e-Gov 400-class JSON errors as EgovApiError with code/message", async () => {
		const { fetch } = makeFetchMock([jsonResponse(SAMPLE_EGOV_ERROR, 400)]);
		const client = new EgovClient({ fetch, retryDelaysMs: [], maxRetries: 0 });
		try {
			await client.searchLaws({ law_id: "bad" });
			throw new Error("expected error");
		} catch (err) {
			expect(err).toBeInstanceOf(EgovApiError);
			expect((err as EgovApiError).code).toBe("400001");
			expect((err as EgovApiError).message).toContain("指定された法令ID");
			expect((err as EgovApiError).retryable).toBe(false);
		}
	});

	it("rejects 429 as EgovRateLimitError when wait exceeds budget", async () => {
		const { fetch } = makeFetchMock([
			plainResponse("rate limited", 429, { "Retry-After": "30" }),
		]);
		const client = new EgovClient({
			fetch,
			maxRateLimitWaitMs: 5000,
			sleep: async () => {},
		});
		await expect(client.searchLaws({ law_title: "x" })).rejects.toBeInstanceOf(
			EgovRateLimitError,
		);
	});

	it("retries 429 when Retry-After fits within the wait budget", async () => {
		let n = 0;
		const fetchImpl = async () => {
			n++;
			if (n === 1) return plainResponse("rate limited", 429, { "Retry-After": "1" });
			return jsonResponse(SAMPLE_LAWS_LIST_COMPANIES);
		};
		const sleeps: number[] = [];
		const client = new EgovClient({
			fetch: fetchImpl,
			sleep: async (ms) => {
				sleeps.push(ms);
			},
		});
		const result = await client.searchLaws({ law_title: "x" });
		expect(result).toEqual(SAMPLE_LAWS_LIST_COMPANIES);
		expect(sleeps).toEqual([1000]);
	});

	it("requests json_format=light by default on /law_data", async () => {
		const { fetch, calls } = makeFetchMock([jsonResponse(SAMPLE_LAW_DATA_COMPANIES)]);
		const client = new EgovClient({ fetch });
		await client.getLawData("417AC0000000086");
		expect(calls[0].url).toContain("json_format=light");
		expect(calls[0].url).toContain("response_format=json");
		expect(calls[0].url).toContain("law_full_text_format=json");
	});
});
