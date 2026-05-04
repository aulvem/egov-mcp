/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// The token below MUST stay in sync with vitest.config.mts → bindings →
// MCP_HIVE_TOKEN. We don't read it from `env` because that would let a
// regression in the binding wiring silently make these tests false-pass.
const TEST_TOKEN = "test-mcp-hive-token";

const INIT_BODY = JSON.stringify({
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "auth-test", version: "0" },
	},
});

const MCP_HEADERS_NO_AUTH = {
	"content-type": "application/json",
	accept: "application/json, text/event-stream",
};

describe("Bearer auth on /mcp", () => {
	it("returns 401 when Authorization header is missing", async () => {
		const resp = await SELF.fetch("https://worker/mcp", {
			method: "POST",
			headers: MCP_HEADERS_NO_AUTH,
			body: INIT_BODY,
		});
		expect(resp.status).toBe(401);
		expect(await resp.text()).toBe("Unauthorized");
		expect(resp.headers.get("www-authenticate")).toBe("Bearer");
	});

	it("returns 401 when the token is wrong", async () => {
		const resp = await SELF.fetch("https://worker/mcp", {
			method: "POST",
			headers: {
				...MCP_HEADERS_NO_AUTH,
				authorization: "Bearer this-is-not-the-token",
			},
			body: INIT_BODY,
		});
		expect(resp.status).toBe(401);
		expect(await resp.text()).toBe("Unauthorized");
	});

	it("returns 401 when scheme is not 'Bearer' even with the right value", async () => {
		const resp = await SELF.fetch("https://worker/mcp", {
			method: "POST",
			headers: {
				...MCP_HEADERS_NO_AUTH,
				authorization: `Token ${TEST_TOKEN}`,
			},
			body: INIT_BODY,
		});
		expect(resp.status).toBe(401);
	});

	it("returns 401 on GET as well (auth gate covers all methods)", async () => {
		const resp = await SELF.fetch("https://worker/mcp", { method: "GET" });
		expect(resp.status).toBe(401);
	});

	it("passes through to McpAgent when the token matches", async () => {
		const resp = await SELF.fetch("https://worker/mcp", {
			method: "POST",
			headers: {
				...MCP_HEADERS_NO_AUTH,
				authorization: `Bearer ${TEST_TOKEN}`,
			},
			body: INIT_BODY,
		});
		expect(resp.status).toBe(200);
		const text = await resp.text();
		expect(text).toContain('"protocolVersion"');
		expect(text).toContain('"japan-legal-mcp"');
	});
});

describe("/health is intentionally unauthenticated", () => {
	it("returns 200 with no Authorization header", async () => {
		const resp = await SELF.fetch("https://worker/health");
		expect(resp.status).toBe(200);
		const body = await resp.json();
		expect(body).toMatchObject({
			name: "japan-legal-mcp",
			mcp_endpoint: "/mcp",
		});
	});

	it("returns 200 even with a deliberately bad token (header is ignored)", async () => {
		const resp = await SELF.fetch("https://worker/health", {
			headers: { authorization: "Bearer not-the-token" },
		});
		expect(resp.status).toBe(200);
	});

	it("root '/' is also unauthenticated and returns the same payload", async () => {
		const resp = await SELF.fetch("https://worker/");
		expect(resp.status).toBe(200);
	});
});
