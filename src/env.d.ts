// Augments the auto-generated `Cloudflare.Env` (from worker-configuration.d.ts)
// with bindings wrangler can't infer — secrets set via `wrangler secret put`
// for production, or declared in .dev.vars for local dev. Keep this file as a
// global script (no imports/exports) so the declarations merge automatically.

declare namespace Cloudflare {
	interface Env {
		MCP_HIVE_TOKEN: string;
	}
}
