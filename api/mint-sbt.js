const { mintSBT } = require('../src/sbt');

const safeJson = (obj) => JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { agentId, score = 0 } = req.body || {};
    const out = await mintSBT({ agentId, score: Number(score) });
    res.status(200).json(safeJson({ success: true, ...out }));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
};
