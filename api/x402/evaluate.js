/**
 * POST /api/x402/evaluate — x402-paid Verun Trust Evaluation
 * ──────────────────────────────────────────────────────────────────
 * The first regulated agentic-commerce endpoint on Algorand:
 *   pay 0.01 USDC → get consensus trust verdict → anchored on-chain.
 *
 * Without X-PAYMENT header → returns HTTP 402 + paymentRequirements
 * With    X-PAYMENT header → verifies + settles via GoPlausible facilitator
 *                              + runs Verun 2-of-3 validator consensus
 *                              + anchors verdict via Note-TX on Algorand testnet
 *                              + returns { verdict, anchor, settlement }
 */

const { evaluateAgent } = require('../../src/evaluate');
const { anchorEvaluation } = require('../../src/anchor');
const {
  buildPaymentRequirements,
  facilitatorVerify,
  facilitatorSettle,
  decodePaymentHeader,
  FACILITATOR_URL,
  PRICE_USDC
} = require('../../src/x402');

const safeJson = (o) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, x-payment');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Build paymentRequirements for this resource
  const paymentRequirements = buildPaymentRequirements({
    resource: '/api/x402/evaluate',
    description: `Verun Trust Evaluation · ${PRICE_USDC} USDC · 2-of-3 validator consensus + Algorand on-chain anchor.`
  });

  // ── Read X-PAYMENT header (case-insensitive, base64 JSON) ──────────
  const xPaymentHeader = req.headers['x-payment'] || req.headers['X-PAYMENT'];

  // ── GET (preview) or POST without X-PAYMENT → 402 ──────────────────
  if (!xPaymentHeader) {
    res.setHeader('X-402-Powered', `${FACILITATOR_URL} · USDC`);
    return res.status(402).json(paymentRequirements);
  }

  // ── POST with X-PAYMENT → verify + settle + evaluate + anchor ─────
  try {
    // Step 1 — verify payment payload via facilitator
    const verifyResult = await facilitatorVerify({ xPaymentHeader, paymentRequirements });
    if (verifyResult.httpStatus !== 200 || verifyResult.isValid === false) {
      return res.status(402).json({
        ok: false,
        stage: 'verify',
        facilitator: FACILITATOR_URL,
        invalidReason: verifyResult.invalidReason || verifyResult.invalidMessage || 'verify_failed',
        details: verifyResult
      });
    }

    // Step 2 — settle on-chain via facilitator (real Algorand TX)
    const settleResult = await facilitatorSettle({ xPaymentHeader, paymentRequirements });
    if (settleResult.httpStatus !== 200 || settleResult.success === false) {
      return res.status(402).json({
        ok: false,
        stage: 'settle',
        facilitator: FACILITATOR_URL,
        errorReason: settleResult.errorReason || settleResult.errorMessage || 'settle_failed',
        details: settleResult
      });
    }

    // Step 3 — run Verun trust evaluation (2-of-3 consensus)
    const decodedPayload = decodePaymentHeader(xPaymentHeader);
    const body = req.body || {};
    const {
      agentId = decodedPayload?.agentId || 'agt_x402',
      score = 820,
      operation = 'transfer',
      validatorIds = ['val-erster-01', 'val-tokenforge-02', 'val-test-03']
    } = body;

    const verdict = await evaluateAgent({
      agentId,
      score: Number(score),
      operation,
      validatorIds
    });

    // Step 4 — anchor verdict on Algorand (Note-TX)
    let anchor;
    try {
      anchor = await anchorEvaluation({
        type: 'verun-x402-evaluation',
        agentId,
        score: Number(score),
        operation,
        consensus: verdict.consensus,
        permitted: verdict.permitted,
        x402_settlement_txid: settleResult.transaction || settleResult.txid,
        ts: verdict.ts
      });
    } catch (anchorErr) {
      anchor = { error: anchorErr.message, status: 'anchor_failed' };
    }

    res.setHeader('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify({
      success: true,
      transaction: settleResult.transaction || settleResult.txid,
      network: paymentRequirements.accepts[0].network
    })).toString('base64'));

    return res.status(200).json(safeJson({
      success: true,
      x402: {
        powered_by: FACILITATOR_URL,
        scheme: 'exact',
        asset: 'USDC',
        amount_paid: paymentRequirements.accepts[0].maxAmountRequired,
        settlement_txid: settleResult.transaction || settleResult.txid,
        settlement_explorer: settleResult.transaction
          ? `https://lora.algokit.io/testnet/tx/${settleResult.transaction}`
          : null
      },
      verdict,
      anchor
    }));
  } catch (e) {
    return res.status(500).json({
      ok: false,
      stage: 'server_error',
      error: e.message || String(e)
    });
  }
};
