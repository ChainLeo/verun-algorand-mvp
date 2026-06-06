const algosdk = require('algosdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const mnemonicRaw = process.env.ALGO_MNEMONIC || '';
  const algodUrl = process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud';
  const algodToken = process.env.ALGOD_TOKEN || '';
  const configuredAddress = process.env.ALGO_TESTNET_ADDR || process.env.ALGO_TESTNET_ADDRESS || null;

  let mnemonicValid = false;
  let derivedAddress = null;
  let mnemonicError = null;

  if (mnemonicRaw) {
    try {
      const acct = algosdk.mnemonicToSecretKey(mnemonicRaw.trim());
      mnemonicValid = true;
      derivedAddress = String(acct.addr);
    } catch (e) {
      mnemonicError = e.message || String(e);
    }
  }

  let algodReachable = false;
  let algodStatus = null;
  let algodError = null;
  try {
    const r = await fetch(`${algodUrl}/health`, {
      headers: algodToken ? { 'X-Algo-API-Token': algodToken } : {}
    });
    algodStatus = r.status;
    algodReachable = r.ok;
  } catch (e) {
    algodError = e.message || String(e);
  }

  return res.status(200).json({
    ok: true,
    checks: {
      mnemonic_present: Boolean(mnemonicRaw),
      mnemonic_valid: mnemonicValid,
      mnemonic_error: mnemonicError,
      derived_address: derivedAddress,
      configured_address: configuredAddress,
      address_match: Boolean(derivedAddress && configuredAddress && derivedAddress === configuredAddress),
      algod_url: algodUrl,
      algod_reachable: algodReachable,
      algod_status: algodStatus,
      algod_error: algodError
    },
    hints: [
      'If mnemonic_valid=false, re-save ALGO_MNEMONIC in Vercel exactly as 25 words separated by spaces.',
      'If address_match=false, update ALGO_TESTNET_ADDR/ALGO_TESTNET_ADDRESS to the mnemonic-derived address.',
      'After fixing env vars, redeploy and retest /api/evaluate + /api/mint-sbt.'
    ]
  });
};
