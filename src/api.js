require('dotenv').config();
const express = require('express');
const { evaluateAgent } = require('./evaluate');
const { anchorEvaluation } = require('./anchor');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'verun-algorand-mvp' }));

app.post('/score', (req, res) => {
  const { agentId = 'agent', score = 0, operation = 'read' } = req.body || {};
  const out = evaluateAgent({ agentId, score: Number(score), operation });
  res.json(out);
});

app.post('/evaluate', async (req, res) => {
  try {
    const { agentId = 'agent', score = 0, operation = 'read' } = req.body || {};
    const verdict = evaluateAgent({ agentId, score: Number(score), operation });
    const anchor = await anchorEvaluation({
      type: 'verun-evaluation',
      agentId,
      score: Number(score),
      operation,
      consensus: verdict.consensus,
      ts: verdict.ts
    });
    res.json({ success: true, verdict, anchor });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => console.log(`verun-algorand-mvp API on :${PORT}`));
