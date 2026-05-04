import { EgovMcp } from "./mcp";

export { EgovMcp };

// Authorization check for /mcp.
//
// We deliberately:
//   - Reject when MCP_HIVE_TOKEN is unset (fail closed; never authless).
//   - Use plain `===` for now. Workers' edge response time jitter dwarfs the
//     timing channel of a string compare, so the practical attack surface is
//     low. TODO(v1.2): switch to a constant-time compare if a security review
//     flags it.
//   - Return only "Unauthorized" with no diagnostic detail. Never log the
//     token, the received header, or any length/prefix hint that could help
//     guess the secret.
function isAuthorized(request: Request, env: Env): boolean {
	const expected = env.MCP_HIVE_TOKEN;
	if (!expected) return false;
	const header = request.headers.get("authorization");
	if (!header) return false;
	return header === `Bearer ${expected}`;
}

function unauthorized(): Response {
	return new Response("Unauthorized", {
		status: 401,
		headers: { "WWW-Authenticate": "Bearer" },
	});
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			if (!isAuthorized(request, env)) {
				return unauthorized();
			}
			return EgovMcp.serve("/mcp").fetch(request, env, ctx);
		}

		if (url.pathname === "/" || url.pathname === "/health") {
			return new Response(
				JSON.stringify({
					name: "japan-legal-mcp",
					version: "1.0.0",
					mcp_endpoint: "/mcp",
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}

		return new Response("Not found", { status: 404 });
	},
};
