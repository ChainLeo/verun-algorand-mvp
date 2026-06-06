/**
 * Verun · Quantoz integration helpers
 * ───────────────────────────────────────────────────────────────────────
 * Implements all three Quantoz payment paths per their hackathon guide:
 *   Path A — EURO managed-account (off-chain, instant)
 *   Path B — EURD/EURQ direct on Algorand mainnet (via x402algo.ai.quantozpay.com)
 *   Path C — EURO → Algorand bridge (agent has EUR, merchant gets EURD)
 *
 * Docs: https://docs.ai.quantozpay.com/hackathon/guide/
 */

const {
  QUANTOZ_X402_FACILITATOR,
  QUANTOZ_PAY_FACILITATOR,
  EURD_MAINNET_ASA_ID,
  EURQ_MAINNET_ASA_ID,
  EURD_DECIMALS
} = require('./x402');

// Indexer for verifying mainnet EURD/EURQ asset transfers (Path C bridge proof)
const ALGORAND_MAINNET_INDEXER = 'https://mainnet-idx.algonode.cloud';

/**
 * Path A — call Quantoz MCP-pay facilitator to mint a euro payment request.
 * Used when merchant wants to advertise an off-chain managed-account scheme.
 *
 * Returns the `accepts` array fragment Quantoz returns, ready to splice into
 * a 402 paymentRequirements response.
 */
async function quantozPayCreate({ apiKey, accountCode, amount = 0.01, message = 'Verun evaluation' }) {
  const r = await fetch(`${QUANTOZ_PAY_FACILITATOR}/x402/pay`, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountCode, amount, message })
  });
  const body = await r.json().catch(() => ({ raw: r.statusText }));
  return { httpStatus: r.status, ...body };
}

/**
 * Path A — verify a euro X-PAYMENT proof via Quantoz MCP-pay facilitator.
 */
async function quantozPayVerify({ apiKey, xPaymentHeader }) {
  const r = await fetch(`${QUANTOZ_PAY_FACILITATOR}/x402/verify`, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof: xPaymentHeader })
  });
  const body = await r.json().catch(() => ({ raw: r.statusText }));
  return { httpStatus: r.status, ...body };
}

/**
 * Path B — verify a signed EURD/EURQ atomic group via the Quantoz x402 facilitator.
 * Does NOT submit on-chain (use settle for that).
 */
async function quantozX402Verify({ xPaymentHeader, paymentRequirements }) {
  const r = await fetch(`${QUANTOZ_X402_FACILITATOR}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: xPaymentHeader,
      paymentRequirements
    })
  });
  const body = await r.json().catch(() => ({ raw: r.statusText }));
  return { httpStatus: r.status, ...body };
}

/**
 * Path B — submit a signed EURD/EURQ atomic group on Algorand mainnet via Quantoz facilitator.
 * Returns the on-chain TX hash on success.
 */
async function quantozX402Settle({ xPaymentHeader, paymentRequirements }) {
  const r = await fetch(`${QUANTOZ_X402_FACILITATOR}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: xPaymentHeader,
      paymentRequirements
    })
  });
  const body = await r.json().catch(() => ({ raw: r.statusText }));
  return { httpStatus: r.status, ...body };
}

/**
 * Path C — verify a bridge proof by querying Algorand mainnet indexer.
 * The agent paid in EUR via Quantoz, Quantoz minted EURD on-chain to our address,
 * and the bridge proof contains the resulting Algorand txID.
 *
 * Per Quantoz docs:
 *   proof.payload = { transactionCode, blockchainTxId, payTo, asset }
 * Returns: { ok, txid, asset, receiver, amount, atomicAmount, error? }
 */
async function quantozBridgeVerify({ xPaymentHeader, expectedPayTo, expectedAsset, expectedAtomicAmount }) {
  let proof;
  try {
    proof = JSON.parse(Buffer.from(xPaymentHeader, 'base64url').toString('utf8'));
  } catch (e) {
    return { ok: false, error: 'invalid_bridge_proof_encoding', detail: e.message };
  }

  const payload = proof?.payload || {};
  const txid = payload.blockchainTxId;
  if (!txid) return { ok: false, error: 'no_blockchain_tx_id_in_proof' };

  // Query Algonode mainnet indexer for the EURD transfer
  let tx;
  try {
    const r = await fetch(`${ALGORAND_MAINNET_INDEXER}/v2/transactions/${txid}`);
    if (!r.ok) return { ok: false, error: 'indexer_lookup_failed', http: r.status };
    tx = await r.json();
  } catch (e) {
    return { ok: false, error: 'indexer_unreachable', detail: e.message };
  }

  const axfer = tx.transaction?.['asset-transfer-transaction'];
  if (!axfer) return { ok: false, error: 'not_asset_transfer_transaction' };

  const assetMatch    = String(axfer['asset-id']) === String(expectedAsset);
  const receiverMatch = axfer.receiver === expectedPayTo;
  const amountOk      = Number(axfer.amount || 0) >= Number(expectedAtomicAmount || 0);

  if (!assetMatch)    return { ok: false, error: 'asset_mismatch',    expected: expectedAsset, got: axfer['asset-id'] };
  if (!receiverMatch) return { ok: false, error: 'receiver_mismatch', expected: expectedPayTo, got: axfer.receiver };
  if (!amountOk)      return { ok: false, error: 'amount_short',      expected: expectedAtomicAmount, got: axfer.amount };

  return {
    ok: true,
    txid,
    asset: axfer['asset-id'],
    receiver: axfer.receiver,
    atomicAmount: axfer.amount,
    amountEUR: (Number(axfer.amount) / Math.pow(10, EURD_DECIMALS)).toFixed(2)
  };
}

module.exports = {
  // Path A
  quantozPayCreate,
  quantozPayVerify,
  // Path B
  quantozX402Verify,
  quantozX402Settle,
  // Path C
  quantozBridgeVerify,
  // Constants
  EURD_MAINNET_ASA_ID,
  EURQ_MAINNET_ASA_ID,
  EURD_DECIMALS,
  ALGORAND_MAINNET_INDEXER
};
