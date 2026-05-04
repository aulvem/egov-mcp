# Project memory — Japan Legal Corpus MCP Server

## Purpose

A production-ready Model Context Protocol (MCP) server that proxies Japan's
official e-Gov Hourei (Laws & Regulations) API v2 to AI agents. Runs on
Cloudflare Workers, exposed via Streamable HTTP at `/mcp`. Targets the
MCP-Hive marketplace as a follow-on to estat-mcp. v1 covers three high-
demand legal domains for international business research: corporate law,
labor law, and privacy / personal-information protection.

## Tech stack

- TypeScript on Cloudflare Workers
- `@modelcontextprotocol/sdk` 1.x with `McpAgent` from `agents/mcp` (Cloudflare
  Agents SDK), Durable-Object–backed
- `zod` for input validation
- Workers KV namespace `EGOV_CACHE` for response caching (24-hour TTL,
  sha256 cache keys)
- `vitest` 4 + `@cloudflare/vitest-pool-workers` for tests

## File layout

```
src/
  index.ts                   # Worker entry; routes /mcp to McpAgent (Bearer auth)
  mcp.ts                     # EgovMcp McpAgent class — registers all 5 tools
  env.d.ts                   # Env declaration-merge for MCP_HIVE_TOKEN
  egov/
    client.ts                # Thin e-Gov API client with caching + retries
    types.ts                 # JSON shapes for /laws, /law_data, /law_revisions
    domains.ts               # Hardcoded law_id constants + domain metadata
    article_parser.ts        # Parse "Article 107" / "第107条" / "第9条第2項第1号"
  tools/
    search_law.ts
    get_article.ts
    list_categories.ts
    get_law_metadata.ts
    compare_revisions.ts
  utils/
    cache.ts                 # KV cache helpers + canonical query key + sha256
    errors.ts                # EgovApiError, EgovRateLimitError, EgovNotFoundError
test/
  fixtures.ts                # Sample e-Gov response payloads + fetch mock
  article_parser.test.ts     # 17+ parser cases (English, Japanese, branch, edge)
  client.test.ts             # cache, retry, rate limit, 404 → not_found
  auth.test.ts               # Bearer pass/fail + /health unauthenticated
  search_law.test.ts
  get_article.test.ts
  list_categories.test.ts
  get_law_metadata.test.ts
  compare_revisions.test.ts
```

## Running

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Worker at `http://localhost:8787/mcp` (reads `.dev.vars`) |
| `npm test` | Run all vitest tests once |
| `npm run test:watch` | Watch-mode tests |
| `npm run type-check` | `tsc --noEmit` |
| `npm run deploy` | `wrangler deploy` |
| `npx wrangler kv namespace create EGOV_CACHE` | Provision the cache KV (one-time) |
| `npx wrangler secret put MCP_HIVE_TOKEN` | Provision / rotate the gateway bearer token |

Two wrangler configs:
- `wrangler.jsonc` — production config; KV id must be filled in after the
  one-time `kv namespace create` step (placeholder
  `REPLACE_AFTER_KV_NAMESPACE_CREATE` until then).
- `wrangler.test.jsonc` — minimal config used by `vitest-pool-workers`. It
  intentionally omits the KV binding because miniflare provides a fake one
  in `vitest.config.mts`.

## Key constraints

- The 5 tool `description` strings in the `*_DESCRIPTION` constants are the
  text that MCP-Hive scrapes and shows to AI agents. **Do not rewrite them.**
  Match them verbatim if forking. Every advice-adjacent tool description
  carries the "not legal advice — consult an attorney" caveat by design.
- `MCP_HIVE_TOKEN` must never appear in error messages, logs, or cache keys.
  The 401 body is the literal string `"Unauthorized"` with no diagnostic
  detail.
- The e-Gov client takes an injected `fetch` so tests don't need to monkey-
  patch globals. Always go through `EgovClient`; never call the e-Gov URL
  directly from a tool.
- e-Gov is open data and requires no application ID. The only secret in this
  project is `MCP_HIVE_TOKEN` for the gateway.
- Cache key pattern: `<endpoint>:<path>:<sha256(canonical sorted query string)>`.
  The path is included so `/law_data/A` vs `/law_data/B` don't collide.
- Cache TTL: 24 hours (86400 seconds). Laws change slowly; the same `asof`
  value produces the same key, so `compare_revisions` benefits as much as
  static lookups.
- Retry policy: 2 retries, delays 200 ms / 800 ms, on network errors and
  retryable HTTP statuses (408, 425, 5xx). 429s respect `Retry-After` if it
  fits in a 5-second budget; otherwise propagate as `EgovRateLimitError`.
  HTTP 404 is **not** retried — it surfaces as `EgovNotFoundError` for the
  path-param endpoints.
- Domain `law_id` values live in `src/egov/domains.ts` only — every caller
  imports from there.

## Article reference parser

The trickiest piece. Lives in `src/egov/article_parser.ts`. Supports:

- `Article 107`
- `第107条`
- `Article 9, Paragraph 2`
- `第9条第2項`
- `第9条第2項第1号`
- `第325条の3` (branch articles — output `article_branch: "の3"`)
- `Art. 107(2)(1)` (compact form)

Mixed-language inputs (`Article 9 第2項`) and zero/negative article numbers
are rejected. Branch articles round-trip through the canonical Japanese form
regardless of the input style. The parser throws `ArticleRefParseError` on
unrecognised input — Zod's `.regex()` is too coarse to encode this grammar,
so the parser runs *after* Zod's "non-empty" check.

e-Gov encodes branch articles in the JSON `Num` attribute as `<n>_<branch>`
(e.g. `325_3`). `expectedNum` in `get_article.ts` builds that string for
matching.

## Authentication (v1.1)

`/mcp` requires an `Authorization: Bearer <MCP_HIVE_TOKEN>` header. The check
lives in `src/index.ts` (`isAuthorized`) and runs before any McpAgent code,
so unauthenticated traffic never reaches a Durable Object. `/health` and `/`
are intentionally unauthenticated for uptime monitoring.

- **Production token:** stored as a Cloudflare secret. Set with
  `npx wrangler secret put MCP_HIVE_TOKEN`. The same value is configured in
  the MCP-Hive gateway as the upstream Header so paying calls flow through.
- **Dev token:** stored in `.dev.vars` (gitignored) with a `dev-only-` prefix
  to make the dev/prod split obvious in logs. Tests use yet another fixed
  value injected via `vitest.config.mts` bindings — they don't read `.dev.vars`.
- **Rotation:** rerun `wrangler secret put MCP_HIVE_TOKEN` with the new value
  (it overwrites), then update the MCP-Hive dashboard's Header Value to the
  same string. The next deploy is *not* required — secrets propagate on the
  next request.
- **Type:** `MCP_HIVE_TOKEN` is declared on `Cloudflare.Env` via
  `src/env.d.ts` (declaration-merging the auto-generated worker types).
- **Logging discipline:** never log the token value, the received header, or
  any length/prefix derived from it.
- **Timing:** v1.1 uses plain `===` comparison. Workers' edge response jitter
  dominates over a string-compare timing channel, so the practical attack
  surface is low; revisit with constant-time compare in v1.2 if a security
  review flags it.

## Roadmap

- **v1 (current):** 3 domains × 5 tools.
- **v2:** expand to tax (法人税法, 所得税法), IP (特許法, 著作権法), and
  immigration (出入国管理及び難民認定法). Cabinet orders / ministerial
  ordinances become first-class citizens (currently we only handle Acts).
- **Forking template:** like estat-mcp, the cache, error, and client layers
  are domain-agnostic. The article parser and the e-Gov request shapes are
  the only legal-corpus-specific pieces.
