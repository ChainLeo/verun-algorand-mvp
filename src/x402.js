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

// ── CAIP-2 network IDs ───────────────────────────────────────
const ALGORAND_MAINNET_CAIP2 = 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=';
const ALGORAND_TESTNET_CAIP2 = 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';

// ── USDC (GoPlausible facilitator route) ─────────────────────
const USDC_TESTNET_ASA_ID = '10458941';
const USDC_MAINNET_ASA_ID = '31566704';
const USDC_DECIMALS = 6;

// ── Quantoz EURD / EURQ (regulated EU stablecoins) ──────────
// Per Quantoz hackathon guide — EURD has 2 decimals (NOT 6).
const EURD_MAINNET_ASA_ID = '1221682136';
const EURQ_MAINNET_ASA_ID = '2768422954';
const EURD_DECIMALS = 2;

// ── Facilitators ─────────────────────────────────────────────
const GOPLAUSIBLE_FACILITATOR = 'https://facilitator.goplausible.xyz';
const QUANTOZ_X402_FACILITATOR = 'https://x402algo.ai.quantozpay.com';
const QUANTOZ_PAY_FACILITATOR = 'https://mcp.ai.quantozpay.com';

// ── Resolved config ──────────────────────────────────────────
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || GOPLAUSIBLE_FACILITATOR;
const PRICE_USDC = Number(process.env.X402_PRICE_USDC || '0.01');
const PRICE_EUR = Number(process.env.X402_PRICE_EUR || '0.01');
const NETWORK_CAIP2 = process.env.X402_NETWORK === 'mainnet' ? ALGORAND_MAINNET_CAIP2 : ALGORAND_TESTNET_CAIP2;
const USDC_ASA_ID = process.env.X402_NETWORK === 'mainnet' ? USDC_MAINNET_ASA_ID : USDC_TESTNET_ASA_ID;

function getPayToAddress() {
  return process.env.ALGO_TESTNET_ADDR || process.env.ALGO_TESTNET_ADDRESS;
}

/**
 * Build x402 paymentRequirements payload (returned with HTTP 402).
 * Spec: https://docs.x402.org
 */
function buildPaymentRequirements({ resource, description, amountUSDC = PRICE_USDC, amountEUR = PRICE_EUR } = {}) {
  const payTo = getPayToAddress();
  if (!payTo) throw new Error('ALGO_TESTNET_ADDR / ALGO_TESTNET_ADDRESS not configured');

  // Convert decimal amounts → smallest unit per asset.
  // USDC: 6 decimals → 0.01 USDC = 10,000 microUSDC
  // EURD: 2 decimals → 0.01 EUR  = 1 atomic unit (€0.01 minimum chargeable on this scheme)
  const microUSDC   = Math.round(amountUSDC * Math.pow(10, USDC_DECIMALS)).toString();
  const atomicEURD  = Math.max(1, Math.round(amountEUR * Math.pow(10, EURD_DECIMALS))).toString();
  const atomicEUR   = atomicEURD; // off-chain euro scheme uses same scale as EURD

  const res = resource || '/api/x402/evaluate';

  // Verun accepts multiple payment schemes — agents can pay in whichever they prefer.
  const accepts = [
    // ── Scheme 1: USDC on Algorand · via GoPlausible ────────────
    {
      scheme: 'exact',
      network: NETWORK_CAIP2,
      maxAmountRequired: microUSDC,
      resource: res,
      description: description || 'Verun Trust Evaluation — agent score + 2-of-3 consensus + Algorand anchor.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: USDC_ASA_ID,
      facilitator: GOPLAUSIBLE_FACILITATOR,
      extra: {
        name: 'USDC',
        decimals: USDC_DECIMALS,
        facilitator: GOPLAUSIBLE_FACILITATOR,
        protocol: 'verun-erster',
        chain: 'algorand-testnet'
      }
    },
    // ── Scheme 2: EURD direct on Algorand mainnet · via Quantoz x402 facilitator (Path B) ──
    {
      scheme: 'exact',
      network: 'algorand:mainnet', // Quantoz uses friendly form per their guide
      maxAmountRequired: atomicEURD,
      resource: res,
      description: 'Verun Trust Evaluation (EURD settlement on Algorand mainnet) — Quantoz regulated stablecoin.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 300,
      asset: EURD_MAINNET_ASA_ID,
      facilitator: QUANTOZ_X402_FACILITATOR,
      extra: {
        name: 'EURD',
        decimals: EURD_DECIMALS,
        provider: 'Quantoz',
        provider_docs: 'https://docs.ai.quantozpay.com',
        path: 'B · EURD direct on-chain',
        regulation: 'MiCA',
        whitelisting_required: true,
        protocol: 'verun-erster',
        chain: 'algorand-mainnet'
      }
    },
    // ── Scheme 3: EURQ alternative on Algorand mainnet (Quantoz) ────────
    {
      scheme: 'exact',
      network: 'algorand:mainnet',
      maxAmountRequired: atomicEURD,
      resource: res,
      description: 'Verun Trust Evaluation (EURQ settlement on Algorand mainnet) — Quantoz regulated stablecoin.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 300,
      asset: EURQ_MAINNET_ASA_ID,
      facilitator: QUANTOZ_X402_FACILITATOR,
      extra: {
        name: 'EURQ',
        decimals: EURD_DECIMALS,
        provider: 'Quantoz',
        path: 'B · EURQ direct on-chain',
        regulation: 'MiCA',
        whitelisting_required: true,
        protocol: 'verun-erster',
        chain: 'algorand-mainnet'
      }
    },
    // ── Scheme 4: EURO managed account · Quantoz off-chain (Path A) ────
    {
      scheme: 'euro',
      network: 'quantoz:euro',
      maxAmountRequired: atomicEUR,
      resource: res,
      description: 'Verun Trust Evaluation (instant EUR settlement) — Quantoz managed-account, off-chain.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 60,
      asset: 'EUR',
      facilitator: QUANTOZ_PAY_FACILITATOR,
      extra: {
        name: 'EUR',
        decimals: EURD_DECIMALS,
        provider: 'Quantoz',
        path: 'A · EUR off-chain managed account',
        regulation: 'MiCA',
        protocol: 'verun-erster'
      }
    },
    // ── Scheme 5: EURO → Algorand bridge · Quantoz (Path C, agent-friendly) ──
    {
      scheme: 'exact-bridge',
      network: 'algorand:mainnet',
      maxAmountRequired: atomicEURD,
      resource: res,
      description: 'Verun Trust Evaluation (EUR pay → EURD settle on Algorand) — Quantoz bridge, no Algorand wallet needed on the agent side.',
      mimeType: 'application/json',
      payTo,
      maxTimeoutSeconds: 300,
      asset: EURD_MAINNET_ASA_ID,
      facilitator: QUANTOZ_PAY_FACILITATOR,
      extra: {
        name: 'EUR→EURD',
        decimals: EURD_DECIMALS,
        provider: 'Quantoz',
        path: 'C · EURO→Algorand bridge',
        regulation: 'MiCA',
        agent_needs: 'Quantoz EUR account only',
        merchant_needs: 'whitelisted Algorand address',
        protocol: 'verun-erster'
      }
    }
  ];

  return {
    x402Version: 1, // GoPlausible USDC path
    quantoz_x402Version: 2, // Quantoz paths use v2 per their spec
    accepts,
    error: 'Payment required',
    metadata: {
      brand: 'ERSTER',
      product: 'Verun Trust Evaluation',
      validators: ['val-erster-01', 'val-tokenforge-02', 'val-test-03'],
      docs: 'https://algorand.erster.fund/docs.html',
      bonus_integrations: {
        quantoz: {
          paths: ['A · EUR managed-account', 'B · EURD/EURQ on Algorand', 'C · EUR→Algorand bridge'],
          facilitators: {
            x402: QUANTOZ_X402_FACILITATOR,
            mcp_pay: QUANTOZ_PAY_FACILITATOR
          },
          assets: {
            EURD: { asa_id: EURD_MAINNET_ASA_ID, decimals: EURD_DECIMALS, regulation: 'MiCA' },
            EURQ: { asa_id: EURQ_MAINNET_ASA_ID, decimals: EURD_DECIMALS, regulation: 'MiCA' }
          },
          docs: 'https://docs.ai.quantozpay.com/hackathon/guide/'
        },
        folks_finance: {
          description: 'Protocol fees staked in xALGO for native yield',
          asa_id: 730430089,
          docs: 'https://docs.folks.finance/functionalities/xalgo-liquid-staking',
          treasury_endpoint: '/api/treasury'
        }
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
  GOPLAUSIBLE_FACILITATOR,
  QUANTOZ_X402_FACILITATOR,
  QUANTOZ_PAY_FACILITATOR,
  PRICE_USDC,
  PRICE_EUR,
  USDC_ASA_ID,
  USDC_DECIMALS,
  EURD_MAINNET_ASA_ID,
  EURQ_MAINNET_ASA_ID,
  EURD_DECIMALS,
  NETWORK_CAIP2,
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_TESTNET_CAIP2
};
