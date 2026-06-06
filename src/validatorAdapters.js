/**
 * Verun Validator Adapters
 * Each adapter calls the validator's API and returns a normalized vote.
 * All external calls are wrapped in try/catch — on failure, validator is marked UNAVAILABLE.
 */

// ─── Score-based vote (ERSTER, Test Validator) ───────────────────────────────
// Enforces Verun score tiers and operation gates.
function scoreBasedVote(validator, score, operation) {
  const gates = { read: 300, transfer: 500, mint: 500, order: 600 };
  const required = gates[operation] ?? 300;
  const permitted = score >= required;
  if (!permitted) return { vote: 'BLOCK', reason: `score_${score}_below_gate_${required}`, source: validator.id };
  if (score >= 800) return { vote: 'LOW',  reason: 'score_800+', source: validator.id };
  if (score >= 600) return { vote: 'MED',  reason: 'score_600+', source: validator.id };
  return                   { vote: 'HIGH', reason: 'score_300+', source: validator.id };
}

// ─── tokenforge Chain API adapter ─────────────────────────────────────────────
// Enforces tokenforge Chain API gates: read 300+, transfer/mint 500+, order 600+.
// Testnet: gate logic is applied locally based on score.
// Mainnet: will call api.tokensuite.io Chain API directly.
async function tokenforgeVote(validator, agentId, score, operation) {
  try {
    const gates = { read: 300, transfer: 500, mint: 500, order: 600 };
    const required = gates[operation] ?? 300;
    const permitted = score >= required;

    return {
      vote: permitted
        ? (score >= 800 ? 'LOW' : score >= 600 ? 'MED' : 'HIGH')
        : 'BLOCK',
      reason: permitted
        ? `chain_api_gate_passed_${operation}:${score}>=${required}`
        : `chain_api_gate_blocked_${operation}:${score}<${required}`,
      source: 'tokenforge_chain_api',
      status: 'testnet',
      gate: { operation, required, score, permitted }
    };
  } catch (e) {
    return { vote: 'UNAVAILABLE', reason: `tokenforge_error: ${e.message}`, source: 'tokenforge_chain_api' };
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
async function callValidator(validator, agentId, score, operation) {
  switch (validator.id) {
    case 'val-erster-01':
    case 'val-test-03':
      return scoreBasedVote(validator, score, operation);
    case 'val-tokenforge-02':
      return tokenforgeVote(validator, agentId, score, operation);
    default:
      return { vote: 'UNAVAILABLE', reason: 'unknown_validator', source: validator.id };
  }
}

module.exports = { callValidator };
