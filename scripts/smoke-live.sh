#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://algorand.erster.fund}"

echo "== Verun Algorand MVP live smoke =="
echo "Base: $BASE_URL"

echo
printf "[1/4] health ... "
curl -sf "$BASE_URL/api/health" >/tmp/verun_health.json
jq -r '.ok // .success // "unknown"' /tmp/verun_health.json

echo
printf "[2/4] validators ... "
curl -sf "$BASE_URL/api/validators" >/tmp/verun_validators.json
jq -r '.total' /tmp/verun_validators.json

echo
printf "[3/5] funding status ... "
curl -sf "$BASE_URL/api/funding-status" >/tmp/verun_funding.json
jq -r '.balance.algo' /tmp/verun_funding.json

echo
printf "[4/5] config check ... "
curl -sf "$BASE_URL/api/config-check" >/tmp/verun_config.json
jq -r '.checks.mnemonic_present, .checks.mnemonic_valid, .checks.address_match' /tmp/verun_config.json

echo
printf "[5/5] evaluate ... "
curl -sf -X POST "$BASE_URL/api/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_demo","score":820,"operation":"transfer","validatorIds":["val-erster-01","val-tokenforge-02","val-test-03"]}' >/tmp/verun_eval.json
jq -r '.success' /tmp/verun_eval.json
jq -r '.verdict.consensus, .verdict.permitted' /tmp/verun_eval.json
jq -r '.anchor.txid // .anchor.status // "no_anchor"' /tmp/verun_eval.json

echo
echo "Smoke done."