Implementation Spec: Japan Legal Corpus MCP Server (e-Gov narrow-v1)
Context
This is the second MCP server in a series of Japan-public-data MCPs. The first (estat-mcp) shipped successfully with Bearer authentication, KV caching, 5 typed tools, and is now in MCP-Hive review as a Founding Provider candidate. This server applies the same proven pattern to Japan's legal corpus.
The reference implementation is c:\Users\Hiro\OneDrive\Desktop\dev\project\estat-mcp. Read its src/ structure before designing — this server should mirror it for consistency, except for the data domain and tool semantics.
Goal
Ship a production-ready MCP server that proxies Japan's official e-Gov Hourei (Laws & Regulations) API to AI agents, deploy to Cloudflare Workers with Bearer authentication, and prepare for submission to MCP-Hive, Apify Store, and 4 directories. Reviewers manually evaluate on accuracy, latency, and coverage.
Tech stack (mirror estat-mcp)

TypeScript + Cloudflare Workers
@modelcontextprotocol/sdk
McpAgent from agents/mcp (Cloudflare Agents SDK)
Streamable HTTP transport at /mcp
zod for input validation
Workers KV for caching e-Gov API responses (TTL 24 hours — laws are static)
vitest + @cloudflare/vitest-pool-workers for tests
Bearer token authentication on /mcp (matches estat-mcp v1.1)

e-Gov API basics

Base URL: https://laws.e-gov.go.jp/api/2/
Auth: none (this is open-data, no appId required — simpler than e-Stat)
Format: ?response_format=json for JSON responses
Key endpoints:

GET /law_data/{law_id_or_num} — fetch full law text
GET /laws (list endpoint, see swagger) — search laws
GET /law_revisions/{law_revision_id} — fetch a specific historical revision


Swagger UI: https://laws.e-gov.go.jp/api/2/swagger-ui
OpenAPI YAML: https://laws.e-gov.go.jp/api/2/swagger-ui/lawapi-v2.yaml
Recent additions (March 2026): wildcard search (? characters), all-time search, JSON-simplified responses

Verify exact parameter names and response shapes against the official Swagger UI before implementing. Don't trust my parameter names blindly.
Domain scope (v1)
Three high-demand legal domains for international business research:

Companies Act (会社法) — corporate governance, M&A
Labor Standards Act (労働基準法) — HR compliance for foreign subsidiaries
Act on the Protection of Personal Information / APPI (個人情報保護法) — global privacy research, GDPR comparison

Look up the canonical law_num or law_id for each via the e-Gov API's law list endpoint, then hardcode them in src/egov/domains.ts as named constants with comments citing the source URL.
Configuration

Secret: MCP_HIVE_TOKEN

Production: wrangler secret put MCP_HIVE_TOKEN
Dev: .dev.vars file (gitignored, dev-specific value)
This is the Bearer token. Same pattern as estat-mcp.


KV namespace: EGOV_CACHE

wrangler kv namespace create EGOV_CACHE → bind in wrangler.jsonc
Cache TTL: 86400 seconds (24 hours — laws change slowly)
Cache key pattern: <endpoint>:<sha256-of-sorted-query-params>



The 5 Tools
For each tool, the description is automatically scraped by MCP-Hive and shown to AI agents to decide whether to call it. Use the exact text below verbatim. Important regulatory caveat embedded in every tool that touches advice-territory.
Tool 1: search_law
description:
Search Japan laws and regulations by keyword or name. Returns matching laws with their IDs, names, promulgation date, and current revision date. Covers companies, labor, and privacy law domains in v1. Wildcard searches supported (use ? for single character). Information retrieval only — not legal advice. Consult a qualified attorney for case-specific guidance.
Input (Zod):

query: string, required, min 1 char
domain: enum ["corporate", "labor", "privacy"], optional
limit: number, 1–30, default 10

Output:
ts{
  laws: Array<{
    law_id: string;
    law_num: string;          // 法令番号 (e.g. "平成十七年法律第八十六号")
    name: string;             // English transliteration if available, else Japanese
    name_japanese: string;
    promulgation_date: string;
    current_revision_date: string;
    domain: "corporate" | "labor" | "privacy" | "other";
    source_url: string;
  }>;
  total_count: number;
}
Tool 2: get_article
description:
Retrieve a specific article from a Japan law. Provide the law_id (from search_law) and the article reference (e.g. "Article 107", "第107条", "第9条第2項第1号"). Returns the article text in Japanese with metadata. For research and reference only — not legal advice.
Input:

law_id: string, required
article_ref: string, required (accepts both English "Article 107" and Japanese "第107条" formats)

Output:
ts{
  law_id: string;
  law_name: string;
  law_name_japanese: string;
  article_number: string;
  article_text: string;          // raw Japanese text of the article
  paragraph?: string;             // if a specific paragraph was requested
  item?: string;                  // if a specific item was requested
  source_url: string;             // direct link to e-Gov page for this article
}
Tool 3: list_categories
description:
List all top-level legal domains available in this MCP server (currently corporate, labor, and privacy law). Call this first when you don't know what's available, then use search_law within a chosen domain.
Input: none
Output:
ts{
  categories: Array<{
    domain_id: "corporate" | "labor" | "privacy";
    name: string;
    description: string;
    primary_laws: string[];        // e.g. ["Companies Act", "Commercial Code"]
    last_updated: string;
  }>;
}
Tool 4: get_law_metadata
description:
Get full metadata for a Japan law: promulgation date, latest revision date, related ordinances, scope of application, and notes on major amendments. Essential for confirming which version of a law was in effect at a given time.
Input:

law_id: string, required

Output:
ts{
  law_id: string;
  law_num: string;
  name: string;
  name_japanese: string;
  promulgation_date: string;
  current_revision_date: string;
  effective_date?: string;
  major_revisions: Array<{
    revision_date: string;
    summary?: string;
  }>;
  related_ordinances?: string[];
  scope?: string;
  source_url: string;
}
Tool 5: compare_revisions
description:
Compare two revisions of a specific Japan law article. Returns the text from each revision side-by-side, with the publication dates of each version. Useful for tracking how a regulation has evolved. For research and reference only — not legal advice.
Input:

law_id: string, required
article_ref: string, required
revision_a_date: string, required (YYYY-MM-DD or YYYY)
revision_b_date: string, required

Output:
ts{
  law_id: string;
  article_number: string;
  revision_a: { date: string; text: string };
  revision_b: { date: string; text: string };
  text_changed: boolean;
  source_url: string;
}
If the e-Gov API doesn't expose revision-specific lookup for the requested date, return a clear error indicating that historical revision data isn't available for this article (some articles only have current text).
Error handling rules

e-Gov API errors → MCP error with structured message: { code, message, retryable }
Network failures → 2 retries, exponential backoff (200ms, 800ms)
Rate limit (HTTP 429) → respect Retry-After, return clean error if wait > 5s
Zod validation errors → return MCP error before any API call
404 from e-Gov (law not found) → return { error: "law_not_found", law_id }
Never include MCP_HIVE_TOKEN in any error message or log

Code organization (mirror estat-mcp)
src/
  index.ts                   # Worker entry, McpAgent registration, /mcp + /health, Bearer auth gate
  mcp.ts                     # McpAgent class with tool registrations
  egov/
    client.ts                # Thin wrapper around e-Gov API with caching
    types.ts                 # TypeScript types for e-Gov responses
    domains.ts               # Hardcoded law_id constants per domain
    article_parser.ts        # Parse "Article 107" / "第107条" / "第9条第2項第1号"
  tools/
    search_law.ts
    get_article.ts
    list_categories.ts
    get_law_metadata.ts
    compare_revisions.ts
  utils/
    cache.ts                 # KV cache helpers
    errors.ts                # Error types
    auth.ts                  # Bearer token check (mirror estat-mcp)
test/
  search_law.test.ts
  get_article.test.ts
  list_categories.test.ts
  get_law_metadata.test.ts
  compare_revisions.test.ts
  client.test.ts
  auth.test.ts               # Bearer auth pass/fail (mirror estat-mcp)
  article_parser.test.ts     # Article reference parsing edge cases
The e-Gov client should accept an injected fetch function so tests can mock without monkey-patching globals.
Article reference parser (src/egov/article_parser.ts)
This is the trickiest part. Parse all of these forms into a normalized structure:

"Article 107"
"第107条"
"Article 9, Paragraph 2"
"第9条第2項"
"第9条第2項第1号"
"第325条の3"
"Art. 107(2)(1)"

Output structure:
ts{
  article: number;            // 107
  article_branch?: string;    // "の3" for 第325条の3
  paragraph?: number;         // 2
  item?: number;              // 1
}
Test extensively. This will get edge cases that break naively-built regex.
Testing requirements
Each tool: minimum 4 tests

Happy path with mocked e-Gov response
Invalid input (Zod)
e-Gov API error / 404
Cache hit / cache miss interaction

Plus: 8+ tests for article_parser.ts covering all formats above.
Local dev workflow

Create .dev.vars with MCP_HIVE_TOKEN="dev-only-...", ensure .gitignore covers it
npm run dev → http://localhost:8787/mcp
Smoke test with MCP Inspector: npx @modelcontextprotocol/inspector@latest, connect via Streamable HTTP
Verify all 5 tools appear with exact descriptions
Run each tool against real e-Gov API end-to-end

Deployment
Stop and ask the user before running these:

wrangler kv namespace create EGOV_CACHE and update wrangler.jsonc with the returned ID
wrangler secret put MCP_HIVE_TOKEN (interactive — user pastes value, generate fresh 64-char token same pattern as estat-mcp)
wrangler deploy
Verify production URL https://<your-subdomain>.workers.dev/mcp responds with auth (200 with valid Bearer, 401 without)
Verify /health returns 200 without auth

README.md (English)
Sections:

What this is, who it's for
Pricing tier (Pay per Call $0.018 on MCP-Hive — higher than e-Stat due to legal-domain value)
The 5 tools with brief descriptions
Source attribution: data from Digital Agency / Ministry of Justice via e-Gov (open data, attribution required)
License: MIT for the code
Disclaimer (prominent): "This server provides information retrieval over Japan's official legal database. It does NOT provide legal advice. Always consult a qualified Japanese attorney (弁護士) for case-specific matters. This is an unofficial server, not affiliated with the Digital Agency or Ministry of Justice of Japan."

CLAUDE.md (project memory)
Capture:

Project purpose
Tech stack
File layout
How to run dev / tests / deploy
Key constraints (5 tool descriptions are fixed, MCP_HIVE_TOKEN never logged, "not legal advice" disclaimer in every advice-adjacent context)
Roadmap (v1 = 3 domains, v2 = expand to tax, IP, immigration)

Performance targets

p50: < 300ms warm (KV-cached, 24-hour TTL)
p95 cold: bounded by e-Gov API upstream
Capacity: same as estat-mcp (Cloudflare Workers free tier)

Deliverables checklist

 All 5 tools implemented with the exact descriptions above
 Article reference parser passes 8+ edge cases
 Zod validation on every input
 KV caching with 24-hour TTL, sha256 cache keys
 Bearer auth on /mcp (mirrors estat-mcp v1.1)
 Error handling per the rules above
 e-Gov client accepts injected fetch for testability
 4+ tests per tool, 8+ tests for parser, all passing
 .dev.vars.example committed, .dev.vars gitignored
 README.md with prominent legal disclaimer
 CLAUDE.md captures project context
 Deployed to production workers.dev
 MCP Inspector confirms all 5 tools work against production URL
 Bench: 5 tools × 3 calls, p95 measured

Stop and ask before:

Running wrangler kv namespace create (creates Cloudflare resources)
Running wrangler secret put (needs interactive input)
Running wrangler deploy (production deploy)
Modifying any file outside this project root
Installing packages outside the listed ones (zod, vitest, @cloudflare/vitest-pool-workers)

Start by:

Reading estat-mcp's src/ to internalize the pattern (copy its structural choices, just swap data domain)
Reading e-Gov Swagger UI / OpenAPI spec to verify endpoint shapes
Then plan the implementation in stages

Build incrementally: client + parser → first tool → all tools → auth → tests → deploy.
After each major stage, summarize and run a smoke check.
