require('dotenv').config();
const algosdk = require('algosdk');

(async () => {
  const algod = new algosdk.Algodv2(process.env.ALGOD_TOKEN || '', process.env.ALGOD_URL, '');
  const addr = process.env.ALGO_TESTNET_ADDR || process.env.ALGO_TESTNET_ADDRESS;
  const status = await algod.status().do();
  const acct = await algod.accountInformation(addr).do();
  console.log('lastRound:', status['last-round']);
  console.log('address:', addr);
  console.log('balance_microAlgos:', acct.amount);
})();
