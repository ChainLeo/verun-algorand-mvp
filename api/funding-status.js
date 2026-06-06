module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const address = process.env.ALGO_TESTNET_ADDR || process.env.ALGO_TESTNET_ADDRESS;
    if (!address) return res.status(500).json({ ok: false, error: 'ALGO_TESTNET_ADDR not configured' });

    const algodUrl = process.env.ALGOD_URL || 'https://testnet-api.algonode.cloud';
    const token = process.env.ALGOD_TOKEN || '';

    const r = await fetch(`${algodUrl}/v2/accounts/${address}`, {
      headers: token ? { 'X-Algo-API-Token': token } : {}
    });

    if (!r.ok) {
      const body = await r.text();
      return res.status(500).json({ ok: false, error: `algod ${r.status}: ${body.slice(0,200)}` });
    }

    const account = await r.json();
    const microAlgos = Number(account.amount || 0);
    const algo = microAlgos / 1e6;

    res.status(200).json({
      ok: true,
      network: 'algorand-testnet',
      address,
      balance: {
        microAlgos,
        algo,
        funded: algo >= 1,
        recommendedMinAlgo: 1
      },
      faucet: 'https://lora.algokit.io/testnet/fund'
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};
