require('dotenv').config();
const algosdk = require('algosdk');

function tierFromScore(score) {
  if (score >= 800) return 'LOW';
  if (score >= 600) return 'MED';
  if (score >= 300) return 'HIGH';
  return 'BLOCK';
}

function zeroAddress() {
  return algosdk.encodeAddress(new Uint8Array(32));
}

function normalizeMnemonic(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ');
}

async function mintSBT({ agentId, score }) {
  if (!agentId) throw new Error('agentId required');

  const algod = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN || '',
    process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud',
    ''
  );

  const mnemonic = normalizeMnemonic(process.env.ALGO_MNEMONIC);
  const acct = algosdk.mnemonicToSecretKey(mnemonic);
  const sender = String(acct.addr);
  const params = await algod.getTransactionParams().do();

  const metadata = {
    agentId,
    score: Number(score),
    tier: tierFromScore(Number(score)),
    ts: new Date().toISOString()
  };

  const note = new Uint8Array(Buffer.from(JSON.stringify(metadata)).slice(0, 900));

  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    sender,
    suggestedParams: params,
    total: 1,
    decimals: 0,
    defaultFrozen: true,
    unitName: 'VSBT',
    assetName: `Verun SBT ${agentId}`.slice(0, 32),
    manager: undefined,
    reserve: undefined,
    freeze: undefined,
    clawback: sender,
    note
  });

  const signed = txn.signTxn(acct.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const conf = await algosdk.waitForConfirmation(algod, txid, 10);
  const assetId = conf['asset-index'] ?? conf.assetIndex;

  return {
    assetId,
    txid,
    explorer: `https://lora.algokit.io/testnet/tx/${txid}`,
    metadata,
    roles: {
      manager: null,
      reserve: null,
      freeze: null,
      clawback: sender
    }
  };
}

module.exports = { mintSBT, tierFromScore, zeroAddress };
