const fs = require('fs');
const path = require('path');
const { callValidator } = require('./validatorAdapters');

const ALL_VALIDATORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'validators.json'), 'utf8'));

function scoreToTier(score) {
  if (score >= 800) return 'LOW';
  if (score >= 600) return 'MED';
  if (score >= 300) return 'HIGH';
  return 'BLOCK';
}

function permittedByOperation(score, operation = 'read') {
  const req = { read: 300, transfer: 500, mint: 500, order: 600 };
  return score >= (req[operation] ?? 300);
}

function kickbackRate(score) {
  if (score >= 800) return 10;
  if (score >= 500) return 5;
  return 0;
}

/**
 * evaluateAgent
 * @param {string} agentId
 * @param {number} score
 * @param {string} operation - read | transfer | mint | order
 * @param {string[]} validatorIds - optional subset of validator IDs to use (min 2 for consensus)
 */
async function evaluateAgent({ agentId, score, operation = 'read', validatorIds = null }) {
  // Select validators — default: all three (ERSTER + tokenforge + Test Validator)
  let selected;
  if (validatorIds && validatorIds.length >= 2) {
    selected = ALL_VALIDATORS.filter(v => validatorIds.includes(v.id));
  } else {
    selected = ALL_VALIDATORS; // default: all validators
  }

  if (selected.length < 2) {
    selected = ALL_VALIDATORS;
  }

  // Call all selected validators in parallel
  const results = await Promise.all(
    selected.map(async v => {
      const result = await callValidator(v, agentId, score, operation);
      return {
        validatorId: v.id,
        validatorName: v.name,
        type: v.type,
        status: v.status,
        ...result
      };
    })
  );

  // Filter out UNAVAILABLE votes for consensus
  const validVotes = results.filter(r => r.vote !== 'UNAVAILABLE');

  // Tally
  const tally = validVotes.reduce((acc, r) => {
    acc[r.vote] = (acc[r.vote] || 0) + 1;
    return acc;
  }, {});

  // 2-of-N consensus
  const required = Math.ceil(selected.length / 2);
  let consensus = 'BLOCK';
  for (const t of ['LOW', 'MED', 'HIGH', 'BLOCK']) {
    if ((tally[t] || 0) >= required) {
      consensus = t;
      break;
    }
  }

  return {
    agentId,
    score,
    operation,
    validators_used: selected.map(v => ({ id: v.id, name: v.name, type: v.type, status: v.status })),
    votes: results,
    tally,
    consensus,
    permitted: consensus !== 'BLOCK',
    kickback_rate: kickbackRate(score),
    ts: new Date().toISOString()
  };
}

// List all available validators (for the /api/validators endpoint)
function listValidators() {
  return ALL_VALIDATORS.map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    description: v.description,
    status: v.status,
    policy: v.policy,
    api: v.api ? { type: v.api.type, network: v.api.network, docs: v.api.docs } : null
  }));
}

if (require.main === module) {
  evaluateAgent({ agentId: 'agent-demo', score: 820, operation: 'transfer' })
    .then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { evaluateAgent, scoreToTier, permittedByOperation, kickbackRate, listValidators };
