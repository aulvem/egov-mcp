import { describe, expect, it } from "vitest";
import { EgovClient } from "../src/egov/client";
import { runListCategories } from "../src/tools/list_categories";
import {
	jsonResponse,
	makeFetchMock,
	MemoryCache,
	SAMPLE_EGOV_ERROR,
	SAMPLE_LAWS_LIST_COMPANIES,
	SAMPLE_LAWS_LIST_LABOR,
	SAMPLE_LAWS_LIST_PRIVACY,
} from "./fixtures";

describe("list_categories", () => {
	it("returns the 3 v1 domains in order", async () => {
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_LAWS_LIST_LABOR),
			jsonResponse(SAMPLE_LAWS_LIST_PRIVACY),
		]);
		const client = new EgovClient({ fetch });
		const out = await runListCategories(client);
		expect(out.categories.map((c) => c.domain_id)).toEqual([
			"corporate",
			"labor",
			"privacy",
		]);
		expect(out.categories[0].primary_laws[0]).toContain("Companies Act");
		expect(out.categories[1].primary_laws[0]).toContain("Labor Standards");
		expect(out.categories[2].primary_laws[0]).toContain("Personal Information");
		expect(calls).toHaveLength(3);
	});

	it("populates last_updated from current_revision_info when present", async () => {
		const { fetch } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_LAWS_LIST_LABOR),
			jsonResponse(SAMPLE_LAWS_LIST_PRIVACY),
		]);
		const client = new EgovClient({ fetch });
		const out = await runListCategories(client);
		expect(out.categories[0].last_updated).toBe("2024-06-15");
		expect(out.categories[1].last_updated).toBe("2023-04-01");
		expect(out.categories[2].last_updated).toBe("2022-04-01");
	});

	it("falls back to empty last_updated when one domain errors", async () => {
		const { fetch } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_EGOV_ERROR, 500),
			jsonResponse(SAMPLE_LAWS_LIST_PRIVACY),
		]);
		const client = new EgovClient({
			fetch,
			retryDelaysMs: [],
			maxRetries: 0,
		});
		const out = await runListCategories(client);
		expect(out.categories).toHaveLength(3);
		expect(out.categories[0].last_updated).toBe("2024-06-15");
		expect(out.categories[1].last_updated).toBe("");
		expect(out.categories[2].last_updated).toBe("2022-04-01");
	});

	it("hits the cache for repeat calls", async () => {
		const cache = new MemoryCache();
		const { fetch, calls } = makeFetchMock([
			jsonResponse(SAMPLE_LAWS_LIST_COMPANIES),
			jsonResponse(SAMPLE_LAWS_LIST_LABOR),
			jsonResponse(SAMPLE_LAWS_LIST_PRIVACY),
		]);
		const client = new EgovClient({ cache, fetch });
		await runListCategories(client);
		await runListCategories(client);
		expect(calls).toHaveLength(3);
	});
});
