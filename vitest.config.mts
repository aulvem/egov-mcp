import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const workersOptions = {
	main: "./src/index.ts",
	wrangler: { configPath: "./wrangler.test.jsonc" },
	miniflare: {
		compatibilityFlags: ["nodejs_compat"],
		kvNamespaces: ["EGOV_CACHE"],
		bindings: {
			MCP_HIVE_TOKEN: "test-mcp-hive-token",
		},
	},
};

export default defineConfig({
	plugins: [cloudflareTest(workersOptions)],
	test: {
		pool: cloudflarePool(workersOptions),
	},
});
