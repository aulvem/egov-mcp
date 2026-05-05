#!/usr/bin/env bash
# Quick p95 latency benchmark for the deployed MCP server.
# Usage: bash scripts/bench.sh
#
# IMPORTANT: this script writes JSON request bodies to disk first and uses
# `curl --data-binary @file`, because passing Japanese characters via curl -d
# on Windows gets re-encoded and arrives at the server as U+FFFD replacement
# characters. Always send via file when the body contains non-ASCII.
set -uo pipefail

MCP_URL="${MCP_URL:-https://your-subdomain.workers.dev/mcp}"
ITERS="${ITERS:-3}"
TMP="${TMP:-tmp/bench}"
mkdir -p "$TMP"

# Companies Act — used for end-to-end smoke through every tool.
LAW_ID="${LAW_ID:-417AC0000000086}"

HEADERS=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
if [[ -n "${MCP_HIVE_TOKEN:-}" ]]; then
  HEADERS+=(-H "Authorization: Bearer ${MCP_HIVE_TOKEN}")
fi

# 1. Initialize and capture session id.
cat > "$TMP/init.json" <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"bench","version":"0"}}}
EOF
INIT_RESP=$(curl -sS -i -X POST "$MCP_URL" "${HEADERS[@]}" --data-binary @"$TMP/init.json")
SID=$(printf '%s' "$INIT_RESP" | grep -i '^mcp-session-id:' | awk '{print $2}' | tr -d '\r\n')
if [[ -z "$SID" ]]; then
  echo "ERROR: no session id (auth?)" >&2
  exit 1
fi
echo "session=$SID"
SH=(-H "Mcp-Session-Id: $SID")

# 2. notifications/initialized.
cat > "$TMP/notif.json" <<'EOF'
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
EOF
curl -sS -X POST "$MCP_URL" "${HEADERS[@]}" "${SH[@]}" --data-binary @"$TMP/notif.json" >/dev/null

# Helper: write body to file, time the call, print "<seconds>\t<http_code>\t<body>"
call_tool_file() {
  local file="$1"
  local out
  out=$(curl -sS -X POST "$MCP_URL" "${HEADERS[@]}" "${SH[@]}" --data-binary @"$file" \
    -w $'\n__TIME__%{time_total}\n__CODE__%{http_code}\n')
  local time
  time=$(printf '%s' "$out" | awk -F'__TIME__' '/__TIME__/ {print $2}' | head -1)
  local code
  code=$(printf '%s' "$out" | awk -F'__CODE__' '/__CODE__/ {print $2}' | head -1)
  local resp
  resp=$(printf '%s' "$out" | sed '/^__TIME__/,$d' | tr -d '\n' | head -c 400)
  printf '%s\t%s\t%s\n' "$time" "$code" "$resp"
}

write_call() {
  local file="$1" name="$2" args="$3"
  cat > "$file" <<EOF
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"$name","arguments":$args}}
EOF
}

# 3. Build the 5-tool plan.
write_call "$TMP/list_categories.json"   list_categories   '{}'
write_call "$TMP/search_law.json"        search_law        '{"query":"会社","domain":"corporate","limit":3}'
write_call "$TMP/get_law_metadata.json"  get_law_metadata  "{\"law_id\":\"$LAW_ID\"}"
write_call "$TMP/get_article.json"       get_article       "{\"law_id\":\"$LAW_ID\",\"article_ref\":\"Article 107\"}"
write_call "$TMP/compare_revisions.json" compare_revisions "{\"law_id\":\"$LAW_ID\",\"article_ref\":\"Article 107\",\"revision_a_date\":\"2020\",\"revision_b_date\":\"2024\"}"

declare -a TOOLS=(
  "list_categories|$TMP/list_categories.json"
  "search_law|$TMP/search_law.json"
  "get_law_metadata|$TMP/get_law_metadata.json"
  "get_article|$TMP/get_article.json"
  "compare_revisions|$TMP/compare_revisions.json"
)

echo
echo "--- benchmark (iter=$ITERS each) ---"
ALL_TIMES=()
declare -A FIRST_TIME
declare -A CACHED_TIMES_CSV

for entry in "${TOOLS[@]}"; do
  name="${entry%%|*}"
  file="${entry#*|}"
  printf '\n[%s]\n' "$name"
  cached=()
  first=""
  for ((i=1; i<=ITERS; i++)); do
    line=$(call_tool_file "$file")
    t=$(echo "$line" | cut -f1)
    code=$(echo "$line" | cut -f2)
    err=""
    if echo "$line" | grep -q '"isError":true'; then err=" ERROR"; fi
    printf '  iter %d: %ss  http=%s%s\n' "$i" "$t" "$code" "$err"
    ALL_TIMES+=("$t")
    if [[ $i -eq 1 ]]; then first="$t"; else cached+=("$t"); fi
  done
  FIRST_TIME[$name]="$first"
  CACHED_TIMES_CSV[$name]=$(IFS=,; echo "${cached[*]}")
done

echo
echo "--- summary ---"
sorted=$(printf '%s\n' "${ALL_TIMES[@]}" | sort -g)
n=$(printf '%s\n' "${ALL_TIMES[@]}" | wc -l | tr -d ' ')
idx=$(awk -v n="$n" 'BEGIN { v=0.95*n; i=int(v); if (i<v) i++; if (i<1) i=1; if (i>n) i=n; print i }')
p95=$(printf '%s\n' "$sorted" | awk -v idx="$idx" 'NR==idx{print; exit}')
p50_idx=$(awk -v n="$n" 'BEGIN { v=0.5*n; i=int(v); if (i<v) i++; if (i<1) i=1; print i }')
p50=$(printf '%s\n' "$sorted" | awk -v idx="$p50_idx" 'NR==idx{print; exit}')
min=$(printf '%s\n' "$sorted" | head -1)
max=$(printf '%s\n' "$sorted" | tail -1)
echo "n=$n  min=${min}s  p50=${p50}s  p95=${p95}s  max=${max}s"

echo
echo "--- per-tool first vs cached ---"
for entry in "${TOOLS[@]}"; do
  name="${entry%%|*}"
  printf '  %-20s first=%ss  cached=[%s]\n' "$name" "${FIRST_TIME[$name]}" "${CACHED_TIMES_CSV[$name]}"
done
