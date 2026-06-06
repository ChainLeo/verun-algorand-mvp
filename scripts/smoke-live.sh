#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://algorand.erster.fund}"

echo "========================================================"
echo "  Verun · ERSTER on Algorand — live smoke test"
echo "  Base: $BASE_URL"
echo "========================================================"

# ── 1. health ─────────────────────────────────────────────
echo
printf "[1/7] /api/health             → "
curl -sf "$BASE_URL/api/health" >/tmp/verun_health.json
jq -r '"ok=\(.ok)  network=\(.network)"' /tmp/verun_health.json

# ── 2. validators ─────────────────────────────────────────
echo
printf "[2/7] /api/validators         → "
curl -sf "$BASE_URL/api/validators" >/tmp/verun_validators.json
jq -r '"\(.total) validators · consensus=\(.consensus_required)-of-N"' /tmp/verun_validators.json
echo "       Validators: $(jq -r '[.validators[] | .name] | join(" · ")' /tmp/verun_validators.json)"

# ── 3. funding status ─────────────────────────────────────
echo
printf "[3/7] /api/funding-status     → "
curl -sf "$BASE_URL/api/funding-status" >/tmp/verun_funding.json
jq -r '"\(.balance.algo) ALGO  funded=\(.balance.funded)"' /tmp/verun_funding.json
echo "       Address: $(jq -r '.address' /tmp/verun_funding.json)"

# ── 4. config check ───────────────────────────────────────
echo
printf "[4/7] /api/config-check       → "
curl -sf "$BASE_URL/api/config-check" >/tmp/verun_config.json
jq -r '"mnemonic_valid=\(.checks.mnemonic_valid)  address_match=\(.checks.address_match)  algod=\(.checks.algod_reachable)"' /tmp/verun_config.json

# ── 5. treasury (Folks Finance xALGO position) ────────────
echo
printf "[5/7] /api/treasury           → "
curl -sf "$BASE_URL/api/treasury" >/tmp/verun_treasury.json
jq -r '"ALGO=\(.balances.ALGO.algo)  xALGO=\(.balances.xALGO.xalgo) (opted_in=\(.balances.xALGO.opted_in))"' /tmp/verun_treasury.json
echo "       Yield provider: $(jq -r '.balances.xALGO.yield_provider' /tmp/verun_treasury.json)"

# ── 6. x402 (HTTP 402 challenge) ──────────────────────────
echo
printf "[6/7] /api/x402/evaluate      → "
# capture both status + body
HTTP_CODE=$(curl -s -o /tmp/verun_x402.json -w "%{http_code}" -X POST "$BASE_URL/api/x402/evaluate")
echo "HTTP $HTTP_CODE  (expect 402)"
echo "       Schemes accepted:"
jq -r '.accepts[] | "         • \(.scheme | ascii_upcase) · \(.extra.name // .asset // "—") · \((.maxAmountRequired | tonumber) / 1000000) · network=\(.network | split(":")[0])"' /tmp/verun_x402.json 2>/dev/null || echo "         (unable to parse)"
echo "       Facilitator: $(jq -r '.accepts[0].extra.facilitator // "—"' /tmp/verun_x402.json)"
echo "       Bonus: $(jq -r '.metadata.bonus_integrations | to_entries | map("\(.key)=\(.value)") | join(" · ")' /tmp/verun_x402.json)"

# ── 7. evaluate (real consensus + Algorand anchor) ────────
echo
printf "[7/7] /api/evaluate (POST)    → "
curl -sf -X POST "$BASE_URL/api/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_smoke","score":820,"operation":"transfer","validatorIds":["val-erster-01","val-tokenforge-02","val-test-03"]}' >/tmp/verun_eval.json
jq -r '"consensus=\(.verdict.consensus)  permitted=\(.verdict.permitted)  validators=\((.verdict.validators_used | length))/3"' /tmp/verun_eval.json
TXID=$(jq -r '.anchor.txid // empty' /tmp/verun_eval.json)
if [ -n "$TXID" ]; then
  ROUND=$(jq -r '.anchor.round // ""' /tmp/verun_eval.json)
  echo "       Algorand TX:  $TXID"
  echo "       Round:        $ROUND"
  echo "       Explorer:     https://lora.algokit.io/testnet/tx/$TXID"
else
  echo "       Anchor status: $(jq -r '.anchor.status // .anchor.error // "no_anchor"' /tmp/verun_eval.json)"
fi

echo
echo "========================================================"
echo "  All 7 endpoints responded ✓"
echo "========================================================"
