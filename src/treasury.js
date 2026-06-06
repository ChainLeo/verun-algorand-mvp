/**
 * Verun · Treasury Module (Folks Finance xALGO yield)
 * ──────────────────────────────────────────────────────────────────────────
 * Stakes protocol fees collected via x402 evaluations into xALGO
 * (Folks Finance Algorand liquid staking ASA) for passive yield.
 *
 * Design intent:
 *   x402 USDC fees    → protocol wallet
 *   periodic sweep    → ALGO purchase → xALGO mint (Folks Finance contract)
 *   yield accrues     → permissionless redemption back to ALGO whenever
 *
 * SDK reference: https://github.com/Folks-Finance/algorand-js-sdk
 * xALGO docs:    https://docs.folks.finance/functionalities/xalgo-liquid-staking
 *
 * MVP exposes a read-only treasury view (live ALGO balance + xALGO position).
 * Staking transactions can be triggered manually via scripts/stake-xalgo.js.
 */

require('dotenv').config();
const algosdk = require('algosdk');

// Folks Finance xALGO ASA IDs
const XALGO_ASA_ID_MAINNET = 1134696561; // canonical xALGO on mainnet
const XALGO_ASA_ID_TESTNET = 730430089;  // xALGO test deployment (Folks docs)

const ALGOD_URL = process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud';
const NETWORK = process.env.X402_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const XALGO_ASA_ID = NETWORK === 'mainnet' ? XALGO_ASA_ID_MAINNET : XALGO_ASA_ID_TESTNET;

async function getTreasurySnapshot() {
  const address = process.env.ALGO_TESTNET_ADDR || process.env.ALGO_TESTNET_ADDRESS;
  if (!address) throw new Error('Protocol wallet address not configured');

  const algod = new algosdk.Algodv2(process.env.ALGOD_TOKEN || '', ALGOD_URL, '');
  const acct = await algod.accountInformation(address).do();

  const algo_microAlgos = Number(acct.amount || 0);
  const algo = algo_microAlgos / 1e6;

  // Scan ASA balances for xALGO position
  const assets = acct.assets || [];
  const xalgoHolding = assets.find((a) => Number(a['asset-id'] ?? a.assetId) === XALGO_ASA_ID);
  const xalgo_micro = xalgoHolding ? Number(xalgoHolding.amount || 0) : 0;
  const xalgo = xalgo_micro / 1e6;

  return {
    ok: true,
    network: `algorand-${NETWORK}`,
    address,
    balances: {
      ALGO: { microAlgos: algo_microAlgos, algo, opted_in: true },
      xALGO: {
        asa_id: XALGO_ASA_ID,
        micro: xalgo_micro,
        xalgo,
        opted_in: !!xalgoHolding,
        yield_provider: 'Folks Finance',
        docs: 'https://docs.folks.finance/functionalities/xalgo-liquid-staking'
      }
    },
    revenue_routing: {
      x402_usdc_fees: 'Protocol wallet (this address) — collected per evaluation',
      stake_sweep: 'Periodic ALGO → xALGO mint (Folks Finance contract)',
      yield: 'Accrues automatically via xALGO appreciation vs ALGO'
    }
  };
}

module.exports = { getTreasurySnapshot, XALGO_ASA_ID_MAINNET, XALGO_ASA_ID_TESTNET };
