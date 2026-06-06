require('dotenv').config();
const algosdk = require('algosdk');

function normalizeMnemonic(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, ' ');
}

async function anchorEvaluation(payload) {
  // algosdk v3: positional args (token, baseServer, port)
  const algod = new algosdk.Algodv2(
    process.env.ALGOD_TOKEN || '',
    process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud',
    ''
  );

  const mnemonic = normalizeMnemonic(process.env.ALGO_MNEMONIC);
  const acct = algosdk.mnemonicToSecretKey(mnemonic);
  const addr = acct.addr.toString();

  const sp = await algod.getTransactionParams().do();

  const note = new Uint8Array(Buffer.from(JSON.stringify(payload)).slice(0, 900));
  const tx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: addr,
    receiver: addr,
    amount: 1000,
    suggestedParams: sp,
    note
  });

  const signed = tx.signTxn(acct.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const conf = await algosdk.waitForConfirmation(algod, txid, 10);
  return {
    txid,
    round: String(conf['confirmed-round'] ?? conf.confirmedRound ?? ''),
    explorer: `https://lora.algokit.io/testnet/tx/${txid}`
  };
}

module.exports = { anchorEvaluation };
