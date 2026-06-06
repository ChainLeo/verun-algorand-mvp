/**
 * Verun · x402 Payment Layer (Algorand / AVM, "Exact" scheme)
 * ──────────────────────────────────────────────────────────────────────────
 * Implements the x402 spec for the Algorand Virtual Machine using USDC (ASA).
 * Facilitator: GoPlausible (https://facilitator.goplausible.xyz)
 *
 * Flow:
 *   1. Client GET  /api/x402/evaluate           → 402 + paymentRequirements
 *   2. Client signs PaymentTxn (USDC transfer) + groups with facilitator fee-payer
 *   3. Client POST /api/x402/evaluate + X-PAYMENT header (base64 atomic group)
 *   4. Server forwards X-PAYMENT to facilitator /verify
 *   5. On success → facilitator /settle (submits on-chain)
 *   6. Server runs Verun trust evaluation + Note-TX anchor
 *   7. Returns 200 + verdict + anchor txid + settlement txid
 */

const ALGORAND_MAINNET_CAIP2 = 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=';
const ALGORAND_TESTNET_CAIP2 = 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';
const USDC_TESTNET_ASA_ID = '10458941';
const USDC_MAINNET_ASA_ID = '31566704';
const USDC_DECIMALS = 6;

const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://facilitator.goplausible.xyz';
const PRICE_USDC = Number(process.env.X402_PRICE_USDC || '0.01');
const NETWORK_CAIP2 = process.env.X402_NETWORK === 'mainnet' ? ALGORAND_MAINNET_CAIP2 : ALGORAND_TESTNET_CAIP2;
const USDC_ASA_ID = process.env.X402_NETWORK === 'mainnet' ? USDC_MAINNET_ASA_ID : USDC_TESTNET_ASA_ID;

function getPayToAddress() {
  return process.env.ALGO_TESTNET_ADDR || process.env.ALGO_TESTNET_ADDRESS;
}

/**
 * Build x402 paymentRequirements payload (returned with HTTP 402).
 * Spec: https://docs.x402.org
 */
function buildPaymentRequirements({ resource, description, amountUSDC = PRICE_USDC } = {}) {
  const payTo = getPayToAddress();
  if (!payTo) throw new Error('ALGO_TESTNET_ADDR / ALGO_TESTNET_ADDRESS not configured');

  // Convert decimal USDC → integer microUSDC (6 decimals)
  const microUSDC = Math.round(amountUSDC * Math.pow(10, USDC_DECIMALS)).toString();
  // EURD shares 6 decimals with USDC; quote roughly at parity for evaluation pricing
  const microEURD = Math.round(amountUSDC * Math.pow(10, USDC_DECIMALS)).toString();

  // Verun accepts multiple payment schemes — agents can pay in whichever they prefer.
  const accepts = [
    // Scheme 1: USDC on Algorand via GoPlausible facilitator
    {
      scheme: 'exact',
      network: NETWORK_CAIP2,
      maxAmountRequired: microUSDC,
      resource: resource || '/api/x402/evaluate',
      description: description || 'Verun Trust Evaluation — agent score + 2-of-3 consensus + Algorand anchor.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: USDC_ASA_ID,
      extra: {
        name: 'USDC',
        decimals: USDC_DECIMALS,
        facilitator: FACILITATOR_URL,
        protocol: 'verun-erster',
        chain: 'algorand-testnet'
      }
    },
    // Scheme 2: EURD on Algorand mainnet (Quantoz bridge) — EU stablecoin
    {
      scheme: 'exact',
      network: ALGORAND_MAINNET_CAIP2,
      maxAmountRequired: microEURD,
      resource: resource || '/api/x402/evaluate',
      description: 'Verun Trust Evaluation (EUR settlement) — Quantoz EURD via Algorand bridge.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: 'EURD',
      extra: {
        name: 'EURD',
        decimals: USDC_DECIMALS,
        provider: 'Quantoz',
        provider_docs: 'https://docs.ai.quantozpay.com',
        protocol: 'verun-erster',
        chain: 'algorand-mainnet'
      }
    },
    // Scheme 3: Quantoz euro (off-chain instant) — EU bonus track
    {
      scheme: 'euro',
      network: 'quantoz:euro',
      maxAmountRequired: microEURD,
      resource: resource || '/api/x402/evaluate',
      description: 'Verun Trust Evaluation (instant EUR) — Quantoz managed-account euro scheme.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: 'EUR',
      extra: {
        name: 'EUR',
        decimals: USDC_DECIMALS,
        provider: 'Quantoz',
        protocol: 'verun-erster'
      }
    }
  ];

  return {
    x402Version: 1,
    accepts,
    error: 'Payment required',
    metadata: {
      brand: 'ERSTER',
      product: 'Verun Trust Evaluation',
      validators: ['val-erster-01', 'val-tokenforge-02', 'val-test-03'],
      docs: 'https://algorand.erster.fund/docs.html',
      bonus_integrations: {
        quantoz: 'EURD + Euro schemes accepted',
        folks_finance: 'protocol fees staked in xALGO for yield'
      }
    }
  };
}

/**
 * Call GoPlausible facilitator /verify endpoint.
 * Returns { isValid: boolean, invalidReason?: string, ...details }
 */
async function facilitatorVerify({ xPaymentHeader, paymentRequirements }) {
  const r = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 1,
      paymentPayload: xPaymentHeader,
      paymentRequirements: paymentRequirements.accepts[0]
    })
  });
  const body = await r.json().catch(() => ({ raw: r.statusText }));
  return { httpStatus: r.status, ...body };
}

/**
 * Call GoPlausible facilitator /settle endpoint (broadcasts on-chain).
 * Returns { success, transaction (txid), network, ... }
 */
async function facilitatorSettle({ xPaymentHeader, paymentRequirements }) {
  const r = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x402Version: 1,
      paymentPayload: xPaymentHeader,
      paymentRequirements: paymentRequirements.accepts[0]
    })
  });
  const body = await r.json().catch(() => ({ raw: r.statusText }));
  return { httpStatus: r.status, ...body };
}

/**
 * Decode X-PAYMENT header (base64-encoded JSON payment payload).
 */
function decodePaymentHeader(header) {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = {
  buildPaymentRequirements,
  facilitatorVerify,
  facilitatorSettle,
  decodePaymentHeader,
  // Constants for downstream use
  FACILITATOR_URL,
  PRICE_USDC,
  USDC_ASA_ID,
  NETWORK_CAIP2,
  USDC_DECIMALS
};
