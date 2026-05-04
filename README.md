# Japan Legal Corpus MCP Server (e-Gov narrow-v1)

A Model Context Protocol (MCP) server that proxies Japan's official law and
regulation API ([e-Gov Hourei API v2](https://laws.e-gov.go.jp/api/2/swagger-ui))
to AI agents. It runs on Cloudflare Workers and exposes 5 narrowly-scoped
tools that cover three high-demand legal domains for international business
research: **corporate law**, **labor law**, and **privacy / personal-information
protection**.

> ⚠️ **Not legal advice.** This server provides information retrieval over
> Japan's official legal database. It does **NOT** provide legal advice.
> Always consult a qualified Japanese attorney (弁護士) for case-specific
> matters. This is an unofficial server, not affiliated with the Digital
> Agency or Ministry of Justice of Japan.

## Who is this for?

AI agents (Claude, ChatGPT, Cursor, etc.) and assistant developers who need
quick access to the canonical text of Japanese laws and their revision
history without writing custom e-Gov client code. The narrow tool surface is
optimised for agent-driven retrieval — every response includes an official
citation URL that links back to the law-detail page on `laws.e-gov.go.jp`.

## Pricing

Listed on the MCP-Hive marketplace under the **Pay per Call $0.018** tier.
The higher unit price relative to a generic data MCP reflects the legal-
domain value: every retrieval is a citable, dated reference into the
authoritative Japanese statute book.

## Authentication

This server requires Bearer token authentication via the MCP-Hive gateway.
Direct calls to `/mcp` without the correct `Authorization: Bearer <token>`
header return **401 Unauthorized**. Only the `/health` and `/` endpoints are
unauthenticated, so external uptime monitors keep working.

The source code in this repository is open (MIT) but the production
deployment is gated by a token held only in the MCP-Hive marketplace gateway
and as a Cloudflare Worker secret — publishing the code does **not** expose
the running endpoint. To call the server you must go through MCP-Hive (paid),
or run your own copy locally as described under *Local development*.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_law` | Search Japan laws and regulations by keyword or name. Returns IDs, names, promulgation date, and current revision date. Supports a `domain` filter (`corporate` / `labor` / `privacy`). |
| `get_article` | Retrieve a specific article from a Japan law. Accepts both English (`Article 107`) and Japanese (`第107条`, `第9条第2項第1号`) reference formats. |
| `list_categories` | List the top-level legal domains supported by this server. Use as a starting point. |
| `get_law_metadata` | Full metadata for a law: promulgation date, latest revision date, major amendments, related ordinances, scope of application. |
| `compare_revisions` | Compare two revisions of a specific Japan law article side-by-side. Useful for tracking how a regulation has evolved. |

The exact tool descriptions are surfaced verbatim to AI agents and to the
MCP-Hive marketplace; do not rephrase them when forking. Every tool that
touches advice-territory carries the "not legal advice — consult an attorney"
caveat in its description.

## Domains in v1

- **Corporate law** — Companies Act / 会社法 — `law_id` `417AC0000000086` — https://laws.e-gov.go.jp/law/417AC0000000086
- **Labor law** — Labor Standards Act / 労働基準法 — `law_id` `322AC0000000049` — https://laws.e-gov.go.jp/law/322AC0000000049
- **Privacy / APPI** — Act on the Protection of Personal Information / 個人情報の保護に関する法律 — `law_id` `415AC0000000057` — https://laws.e-gov.go.jp/law/415AC0000000057

## Source attribution

Data is provided by the **Digital Agency** and the **Ministry of Justice** of
Japan through the official e-Gov Laws & Regulations API. e-Gov data is open
data and may be reused under the terms of the e-Gov usage policy, which
**requires attribution** to the source. Every tool response includes a
`source_url` field that links back to the official record on `laws.e-gov.go.jp`.

## Disclaimer

This is an **unofficial** MCP server and is **not affiliated** with the
Digital Agency, the Ministry of Justice, or any Japanese government agency.
The server is offered as-is and provides **information retrieval only**.

It does **not** provide legal advice. Statutory text is reproduced
unmodified from the official e-Gov API, but the act of retrieving and
displaying it through an AI agent is no substitute for professional legal
counsel. For any matter involving rights, obligations, liabilities, or
litigation under Japanese law, always consult a qualified Japanese attorney
(弁護士).

Verify retrieved text against the official e-Gov website before using it for
high-stakes decisions; the API and this server may temporarily diverge
during e-Gov scheduled updates or cache propagation.

## License

Code is MIT-licensed (see `LICENSE`). Data retrieved through this server
remains governed by the e-Gov usage policy.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and fill in:
   ```
   MCP_HIVE_TOKEN="dev-only-anything-you-want"
   ```
   Use a `dev-only-` prefix on the token so it's distinguishable from the
   production secret.
2. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
3. The MCP endpoint is at `http://localhost:8787/mcp` (Streamable HTTP).
   Authenticated calls require the dev token:
   ```bash
   curl -H "Authorization: Bearer dev-only-anything-you-want" \
        http://localhost:8787/mcp -X POST \
        -H "Content-Type: application/json" \
        -H "Accept: application/json, text/event-stream" \
        -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"x","version":"0"}}}'
   ```
   For an interactive session, the MCP Inspector lets you set a custom
   Authorization header before connecting:
   ```bash
   npx @modelcontextprotocol/inspector@latest
   ```
   Health check (no token):
   ```bash
   curl http://localhost:8787/health
   ```

## Testing

```bash
npm test           # run once
npm run test:watch # watch mode
npm run type-check # tsc --noEmit
```

Tests use `vitest` with `@cloudflare/vitest-pool-workers` so each test runs
inside a real Workers runtime.

## Deployment

```bash
# Create the KV namespace and copy the printed ID into wrangler.jsonc.
npx wrangler kv namespace create EGOV_CACHE

# Set the production bearer token (interactive — paste the value at the prompt).
npx wrangler secret put MCP_HIVE_TOKEN

# Deploy.
npm run deploy
```

After deploy, your server is reachable at
`https://egov-mcp.<your-subdomain>.workers.dev/mcp`. Configure the MCP-Hive
gateway with the same `MCP_HIVE_TOKEN` value as the upstream `Authorization`
header so paying calls flow through.

To rotate the token: rerun `wrangler secret put MCP_HIVE_TOKEN` with a new
value (overwrites in place — no redeploy needed) and update the same value in
the MCP-Hive dashboard.

## Roadmap

- v1 (current): 3 domains × 5 tools.
- v2: expand to 6+ domains (tax, IP, immigration, civil procedure, antitrust).
