#!/usr/bin/env bash
# ============================================================
#  Verun · ERSTER on Algorand · A-Z End-to-End Test
# ============================================================
#  Single self-contained script for the whole stack.
#  Share with teammates — they just need curl + jq installed.
#
#  Usage:
#    ./scripts/e2e.sh                       # default: https://algorand.erster.fund
#    ./scripts/e2e.sh https://my-preview…   # against any URL
#
#  Exits non-zero if ANY block fails.  Each block prints PASS/FAIL.
# ============================================================
set -u

BASE_URL="${1:-https://algorand.erster.fund}"
FACILITATOR="https://facilitator.goplausible.xyz"
ALGOD_TESTNET="https://testnet-api.algonode.cloud"
INDEXER_TESTNET="https://testnet-idx.algonode.cloud"
LORA="https://lora.algokit.io/testnet"
GITHUB_REPO="https://github.com/ChainLeo/verun-algorand-mvp"

PASS=0
FAIL=0
START=$(date +%s)

# ── pretty printers ─────────────────────────────────────────
hdr()  { printf "\n\033[1;36m╔══ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$*"; FAIL=$((FAIL+1)); }
info() { printf "    \033[2m%s\033[0m\n" "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing prerequisite: $1"; exit 127; }; }

need curl
need jq

echo "============================================================"
echo "  Verun · ERSTER on Algorand · A-Z End-to-End Test"
echo "  Target: $BASE_URL"
echo "  Time:   $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo "============================================================"

# ════════════════════════════════════════════════════════════
# [A] INFRASTRUCTURE
# ════════════════════════════════════════════════════════════
hdr "A · Infrastructure (DNS · HTTPS · HTTP/2)"

# A1 — DNS resolves
HOST=$(echo "$BASE_URL" | sed -E 's|https?://([^/]+).*|\1|')
if host "$HOST" >/dev/null 2>&1 || nslookup "$HOST" >/dev/null 2>&1; then
  ok  "DNS resolves: $HOST"
else
  bad "DNS does NOT resolve: $HOST"
fi

# A2 — HTTPS + SSL valid (certificate not expired)
SSL_INFO=$(curl -sI -o /dev/null -w "%{http_code} %{ssl_verify_result}" "$BASE_URL" || echo "0 ?")
HTTP_CODE=$(echo "$SSL_INFO" | awk '{print $1}')
SSL_OK=$(echo "$SSL_INFO" | awk '{print $2}')
if [ "$HTTP_CODE" = "200" ] && [ "$SSL_OK" = "0" ]; then
  ok  "HTTPS + valid SSL certificate"
else
  bad "HTTPS/SSL check failed (status=$HTTP_CODE ssl=$SSL_OK)"
fi

# A3 — Vercel headers present
HDRS=$(curl -sI "$BASE_URL")
if echo "$HDRS" | grep -qi "x-vercel"; then
  ok  "Vercel serving the site"
  info "$(echo "$HDRS" | grep -i x-vercel-id | head -1 | tr -d '\r')"
else
  bad "no Vercel headers"
fi

# ════════════════════════════════════════════════════════════
# [B] STATIC ASSETS (landing + docs)
# ════════════════════════════════════════════════════════════
hdr "B · Static Assets (landing + docs)"

curl -sf "$BASE_URL" -o /tmp/verun_index.html || { bad "index.html not reachable"; exit 1; }
SIZE=$(wc -c </tmp/verun_index.html | tr -d ' ')
ok  "index.html served ($SIZE bytes)"

# B1 — Title contains ERSTER + Algorand
if grep -q "Erster.*Algorand\|ERSTER" /tmp/verun_index.html; then ok "title / brand: ERSTER"; else bad "brand ERSTER missing"; fi

# B2 — x402 Powered badge in nav
if grep -q "x402 Powered" /tmp/verun_index.html; then ok "nav badge: x402 Powered"; else bad "x402 Powered badge missing"; fi

# B3 — Step 1 + Step 2 demo buttons exist
if grep -q "Step 1 · Trigger HTTP 402" /tmp/verun_index.html && grep -q "Step 2 · Run Paid Evaluation" /tmp/verun_index.html; then
  ok  "interactive demo buttons (Step 1 + Step 2)"
else
  bad "demo buttons missing"
fi

# B4 — 3 payment scheme cards visible
SCHEMES=$(grep -oE "USDC|EURD|EUR" /tmp/verun_index.html | sort -u | wc -l | tr -d ' ')
if [ "$SCHEMES" -ge 3 ]; then ok "3 payment schemes advertised on landing (USDC + EURD + EUR)"; else bad "payment schemes incomplete"; fi

# B5 — docs reachable (vercel cleanUrls redirects /docs.html → /docs)
curl -sLf "$BASE_URL/docs" -o /tmp/verun_docs.html || { bad "docs not reachable"; }
DSIZE=$(wc -c </tmp/verun_docs.html 2>/dev/null | tr -d ' ')
[ -n "$DSIZE" ] && [ "$DSIZE" -gt 1000 ] && ok "docs served ($DSIZE bytes)" || bad "docs too small or missing"

# ════════════════════════════════════════════════════════════
# [C] CORE API ENDPOINTS
# ════════════════════════════════════════════════════════════
hdr "C · Core API endpoints"

# C1 — /api/health
HEALTH=$(curl -sf "$BASE_URL/api/health" || echo '{}')
[ "$(echo "$HEALTH" | jq -r '.ok // false')" = "true" ] && ok "/api/health  ok=true  network=$(echo "$HEALTH" | jq -r .network)" || bad "/api/health failed"

# C2 — /api/validators (3 expected: ERSTER + tokenforge + Test)
V=$(curl -sf "$BASE_URL/api/validators" || echo '{}')
TOTAL=$(echo "$V" | jq -r '.total // 0')
NAMES=$(echo "$V" | jq -r '[.validators[].name] | join(" · ")')
[ "$TOTAL" -ge 3 ] && ok "/api/validators  total=$TOTAL" || bad "/api/validators total=$TOTAL (want 3)"
info "$NAMES"
echo "$NAMES" | grep -q "ERSTER" && ok "validator: ERSTER (val-erster-01)" || bad "ERSTER validator missing"
echo "$NAMES" | grep -q "tokenforge" && ok "validator: tokenforge" || bad "tokenforge validator missing"

# C3 — /api/funding-status
F=$(curl -sf "$BASE_URL/api/funding-status" || echo '{}')
ALGO=$(echo "$F" | jq -r '.balance.algo // 0')
FUNDED=$(echo "$F" | jq -r '.balance.funded // false')
[ "$FUNDED" = "true" ] && ok "/api/funding-status  ALGO=$ALGO  funded=true" || bad "wallet UNFUNDED (ALGO=$ALGO)"

# C4 — /api/config-check
C=$(curl -sf "$BASE_URL/api/config-check" || echo '{}')
MV=$(echo "$C" | jq -r '.checks.mnemonic_valid // false')
AM=$(echo "$C" | jq -r '.checks.address_match // false')
AR=$(echo "$C" | jq -r '.checks.algod_reachable // false')
[ "$MV" = "true" ] && ok "config: mnemonic_valid"  || bad "mnemonic INVALID"
[ "$AM" = "true" ] && ok "config: address_match"   || bad "address mismatch"
[ "$AR" = "true" ] && ok "config: algod reachable" || bad "algod unreachable"

# C5 — /api/treasury (Folks Finance)
T=$(curl -sf "$BASE_URL/api/treasury" || echo '{}')
YP=$(echo "$T" | jq -r '.balances.xALGO.yield_provider // "—"')
[ "$YP" = "Folks Finance" ] && ok "/api/treasury  yield_provider=Folks Finance" || bad "treasury yield provider wrong: $YP"

# ════════════════════════════════════════════════════════════
# [D] x402 PAYMENT REQUIREMENTS (deep)
# ════════════════════════════════════════════════════════════
hdr "D · x402 payment requirements"

HTTP_CODE=$(curl -s -o /tmp/verun_x402.json -w "%{http_code}" -X POST "$BASE_URL/api/x402/evaluate")
[ "$HTTP_CODE" = "402" ] && ok "HTTP $HTTP_CODE (expect 402)" || bad "got HTTP $HTTP_CODE (want 402)"

# D1 — x402Version
X402V=$(jq -r '.x402Version // 0' /tmp/verun_x402.json)
[ "$X402V" = "1" ] && ok "x402Version = 1" || bad "x402Version = $X402V"

# D2 — schemes present (expect 5: USDC + EURD + EURQ + EURO + EUR-bridge)
N_ACCEPTS=$(jq '.accepts | length' /tmp/verun_x402.json)
[ "$N_ACCEPTS" -ge 5 ] && ok "$N_ACCEPTS payment schemes advertised (expect 5)" || bad "only $N_ACCEPTS scheme(s) advertised (expect 5)"

# D3 — USDC scheme (GoPlausible)
USDC_ASSET=$(jq -r '.accepts[] | select(.extra.name=="USDC") | .asset' /tmp/verun_x402.json)
USDC_AMT=$(jq -r '.accepts[] | select(.extra.name=="USDC") | (.maxAmountRequired | tonumber) / 1000000' /tmp/verun_x402.json)
[ "$USDC_ASSET" = "10458941" ] && ok "USDC · ASA $USDC_ASSET · $USDC_AMT USDC · via GoPlausible" || bad "USDC scheme wrong (asset=$USDC_ASSET)"

# D4 — EURD (Quantoz, real ASA 1221682136, 2 decimals)
EURD_ASSET=$(jq -r '.accepts[] | select(.extra.name=="EURD") | .asset' /tmp/verun_x402.json)
EURD_DEC=$(jq -r '.accepts[] | select(.extra.name=="EURD") | .extra.decimals' /tmp/verun_x402.json)
[ "$EURD_ASSET" = "1221682136" ] && ok "EURD · ASA 1221682136 · MiCA-regulated · via Quantoz" || bad "EURD ASA wrong: $EURD_ASSET (want 1221682136)"
[ "$EURD_DEC" = "2" ] && ok "EURD · correct 2-decimal precision" || bad "EURD decimals wrong: $EURD_DEC (want 2)"

# D5 — EURQ (Quantoz, ASA 2768422954)
EURQ_ASSET=$(jq -r '.accepts[] | select(.extra.name=="EURQ") | .asset' /tmp/verun_x402.json)
[ "$EURQ_ASSET" = "2768422954" ] && ok "EURQ · ASA 2768422954 · MiCA-regulated · via Quantoz" || bad "EURQ ASA wrong: $EURQ_ASSET (want 2768422954)"

# D6 — EURO off-chain managed-account (Path A)
EUR_PROV=$(jq -r '.accepts[] | select(.scheme=="euro") | .extra.provider' /tmp/verun_x402.json)
[ "$EUR_PROV" = "Quantoz" ] && ok "EUR off-chain managed-account (Path A) · Quantoz" || bad "Path A missing"

# D7 — EUR→Algorand bridge (Path C)
BRIDGE=$(jq -r '.accepts[] | select(.scheme=="exact-bridge") | .extra.path' /tmp/verun_x402.json)
[ -n "$BRIDGE" ] && [ "$BRIDGE" != "null" ] && ok "EUR→Algorand bridge (Path C) advertised" || bad "Path C bridge missing"

# D8 — Facilitator URLs present
GOPL=$(jq -r '.accepts[] | select(.extra.name=="USDC") | .extra.facilitator' /tmp/verun_x402.json)
QFAC=$(jq -r '.accepts[] | select(.extra.name=="EURD") | .facilitator' /tmp/verun_x402.json)
[ "$GOPL" = "$FACILITATOR" ] && ok "GoPlausible facilitator URL correct" || bad "GoPlausible URL wrong"
[ "$QFAC" = "https://x402algo.ai.quantozpay.com" ] && ok "Quantoz x402 facilitator URL correct" || bad "Quantoz facilitator URL wrong: $QFAC"

# D9 — Bonus integrations
QPATHS=$(jq -r '.metadata.bonus_integrations.quantoz.paths | join(", ")' /tmp/verun_x402.json)
[ -n "$QPATHS" ] && echo "$QPATHS" | grep -qi "Path A" && echo "$QPATHS" | grep -qi "Path B" && echo "$QPATHS" | grep -qi "Path C" \
  && ok "Quantoz bonus · 3 paths advertised: $QPATHS" || bad "Quantoz paths metadata incomplete"
FOLKS=$(jq -r '.metadata.bonus_integrations.folks_finance.asa_id // empty' /tmp/verun_x402.json)
[ "$FOLKS" = "730430089" ] && ok "Folks Finance xALGO bonus · ASA $FOLKS" || bad "Folks Finance metadata incomplete"

# ════════════════════════════════════════════════════════════
# [E] CONSENSUS — MULTIPLE SCORE TIERS
# ════════════════════════════════════════════════════════════
hdr "E · Consensus engine across score tiers"

run_eval() {
  local label="$1" score="$2" op="$3" expect="$4"
  local body
  body=$(curl -sf -X POST "$BASE_URL/api/evaluate" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"agt_e2e\",\"score\":$score,\"operation\":\"$op\",\"validatorIds\":[\"val-erster-01\",\"val-tokenforge-02\",\"val-test-03\"]}" || echo '{}')
  local c
  c=$(echo "$body" | jq -r '.verdict.consensus // "ERR"')
  if [ "$c" = "$expect" ]; then
    ok  "$label  score=$score op=$op → consensus=$c"
  else
    bad "$label  score=$score op=$op → consensus=$c (want $expect)"
  fi
}

run_eval "LOW   tier"  820 "transfer" "LOW"
run_eval "MED   tier"  720 "transfer" "MED"
run_eval "HIGH  tier"  450 "read"     "HIGH"   # transfer needs 500+, read needs only 300+
run_eval "BLOCK tier"  250 "read"     "BLOCK"  # below read gate (300)
run_eval "GATE  fail" 450 "transfer" "BLOCK"   # 450 below 500 transfer gate → all validators BLOCK

# E5 — Last call produced an anchor we can save for [F]
ANCHOR=$(curl -sf -X POST "$BASE_URL/api/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_e2e_final","score":820,"operation":"transfer","validatorIds":["val-erster-01","val-tokenforge-02","val-test-03"]}')
TXID=$(echo "$ANCHOR" | jq -r '.anchor.txid // empty')
ROUND=$(echo "$ANCHOR" | jq -r '.anchor.round // empty')
if [ -n "$TXID" ]; then
  ok  "anchor written  txid=$TXID  round=$ROUND"
  info "Lora: $LORA/tx/$TXID"
else
  bad "no anchor txid returned"
fi

# ════════════════════════════════════════════════════════════
# [F] ON-CHAIN VERIFICATION (independent of our backend)
# ════════════════════════════════════════════════════════════
hdr "F · On-chain verification via Algonode Indexer"

if [ -n "${TXID:-}" ]; then
  IDX=$(curl -sf "$INDEXER_TESTNET/v2/transactions/$TXID" || echo '{}')
  CONFIRMED_ROUND=$(echo "$IDX" | jq -r '.transaction["confirmed-round"] // .transaction.confirmedRound // empty')
  if [ -n "$CONFIRMED_ROUND" ]; then
    ok  "Algonode indexer confirms tx  round=$CONFIRMED_ROUND"
    SENDER=$(echo "$IDX" | jq -r '.transaction.sender // empty')
    info "sender: $SENDER"
  else
    bad "Algonode indexer cannot find txid (yet?) — $TXID"
  fi
else
  bad "no txid to verify"
fi

# ════════════════════════════════════════════════════════════
# [G] EXTERNAL DEPENDENCIES
# ════════════════════════════════════════════════════════════
hdr "G · External dependencies"

# G1 — Algonode testnet algod
S=$(curl -sf -o /dev/null -w "%{http_code}" "$ALGOD_TESTNET/health" || echo 0)
[ "$S" = "200" ] && ok "Algonode algod testnet reachable" || bad "Algonode algod unreachable (http $S)"

# G2 — Algonode indexer
S=$(curl -sf -o /dev/null -w "%{http_code}" "$INDEXER_TESTNET/health" || echo 0)
[ "$S" = "200" ] && ok "Algonode indexer testnet reachable" || bad "Algonode indexer unreachable (http $S)"

# G3 — GoPlausible facilitator alive (any HTTP response < 500)
S=$(curl -sf -o /dev/null -w "%{http_code}" "$FACILITATOR" || curl -s -o /dev/null -w "%{http_code}" "$FACILITATOR")
[ "$S" -lt 500 ] 2>/dev/null && ok "GoPlausible facilitator reachable (http $S)" || bad "GoPlausible unreachable"

# G4 — Lora reachable
S=$(curl -s -o /dev/null -w "%{http_code}" "$LORA" )
[ "$S" -lt 500 ] && ok "Lora explorer reachable (http $S)" || bad "Lora unreachable"

# G5 — GitHub repo reachable
S=$(curl -s -o /dev/null -w "%{http_code}" "$GITHUB_REPO")
[ "$S" = "200" ] && ok "GitHub repo public + reachable" || bad "GitHub repo HTTP $S"

# ════════════════════════════════════════════════════════════
# [H] SUBDOMAIN + DOCS ROUTING
# ════════════════════════════════════════════════════════════
hdr "H · Subdomain + secondary routes"

# H1 — root → 200
S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
[ "$S" = "200" ] && ok "GET /                → 200" || bad "GET / → $S"

# H2 — /docs.html → 308 (cleanUrls redirect, then 200 with -L)
S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/docs.html")
[ "$S" = "308" ] && ok "GET /docs.html       → 308 (cleanUrls redirect to /docs)" || bad "GET /docs.html → $S (want 308)"

S=$(curl -sL -o /dev/null -w "%{http_code}" "$BASE_URL/docs.html")
[ "$S" = "200" ] && ok "GET /docs.html       → 200 after following redirect" || bad "GET /docs.html with -L → $S"

# H3 — /docs (cleanUrls) → 200
S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/docs")
[ "$S" = "200" ] && ok "GET /docs            → 200 (cleanUrls)" || bad "GET /docs → $S"

# ════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════
END=$(date +%s)
DURATION=$((END - START))
TOTAL=$((PASS + FAIL))
echo
echo "============================================================"
printf "  Result:  \033[32m%d PASS\033[0m  ·  \033[31m%d FAIL\033[0m  ·  %d total  ·  %ds\n" "$PASS" "$FAIL" "$TOTAL" "$DURATION"
echo "============================================================"

if [ "$FAIL" -eq 0 ]; then
  printf "\n  \033[1;32m✓ ALL CHECKS PASSED — system is hackathon-ready\033[0m\n\n"
  exit 0
else
  printf "\n  \033[1;31m✗ %d check(s) failed — see above\033[0m\n\n" "$FAIL"
  exit 1
fi
