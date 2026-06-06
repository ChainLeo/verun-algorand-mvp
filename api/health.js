module.exports = async function handler(req, res) {
  res.status(200).json({ ok: true, service: 'verun-algorand-mvp', network: 'algorand-testnet' });
};
