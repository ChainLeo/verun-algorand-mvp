/**
 * GET /api/treasury — Verun treasury snapshot
 * ──────────────────────────────────────────────────────────────────
 * Live view of the protocol wallet's ALGO balance + Folks Finance
 * xALGO yield position. Demonstrates the revenue-routing model for
 * x402 evaluation fees → xALGO liquid staking.
 *
 * Bonus integration: Folks Finance xALGO (https://docs.folks.finance)
 */

const { getTreasurySnapshot } = require('../src/treasury');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const snapshot = await getTreasurySnapshot();
    return res.status(200).json(snapshot);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};
