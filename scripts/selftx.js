require('dotenv').config();
const algosdk = require('algosdk');

(async () => {
  const mnemonic = process.env.ALGO_MNEMONIC;
  const envAddr = process.env.ALGO_TESTNET_ADDRESS;
  const algodUrl = process.env.ALGOD_URL;
  const algodToken = process.env.ALGOD_TOKEN || '';

  const missing = [];
  if (!mnemonic) missing.push('ALGO_MNEMONIC');
  if (!envAddr) missing.push('ALGO_TESTNET_ADDRESS');
  if (!algodUrl) missing.push('ALGOD_URL');
  if (missing.length) throw new Error('Missing env vars: ' + missing.join(', '));

  const algod = new algosdk.Algodv2(algodToken, algodUrl, '');
  const acct = algosdk.mnemonicToSecretKey(mnemonic);
  const addr = String(acct.addr);

  if (addr !== envAddr) {
    throw new Error(`Address mismatch: env=${envAddr} mnemonic=${addr}`);
  }

  const sp = await algod.getTransactionParams().do();
  const tx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: addr,
    receiver: addr,
    amount: 1000,
    suggestedParams: sp,
    note: new Uint8Array(Buffer.from(`verun-selftest-${Date.now()}`))
  });

  const signed = tx.signTxn(acct.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const conf = await algosdk.waitForConfirmation(algod, txid, 10);

  console.log('txid:', txid);
  console.log('confirmed-round:', conf['confirmed-round'] ?? conf.confirmedRound);
})();
