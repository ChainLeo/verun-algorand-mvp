# Verun Protocol — Algorand

> The agentic trust layer by **Erster**, on Algorand Testnet.

Verun issues consensus-based Trust Scores (0–1000) that gate access to regulated
financial operations. Every evaluation is anchored as a Note Transaction on
Algorand — immutable, timestamped, auditable. Designed to complement
MiFID II Art. 17 + EU AI Act Art. 14 obligations, subject to independent
legal review.

- Live demo: <https://algorand.erster.fund>
- Technical docs: <https://algorand.erster.fund/docs.html>
- Erster: <https://www.erster.fund>

## Architecture

```
Agent (Claude · MCP)
   ↓
Verun  — Score + 2-of-3 consensus  (val-erster-01, val-tokenforge-02, val-test-03)
   ↓
Algorand Testnet — Note Transaction anchor
   ↓
tokenforge Chain API — operation gate (read 300+, transfer/mint 500+, order 600+)
```

## API Endpoints (live on Vercel)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health`         | Service status + network |
| GET  | `/api/validators`     | List registered validators |
| GET  | `/api/funding-status` | Protocol wallet balance |
| GET  | `/api/config-check`   | Env + mnemonic + algod diagnostics |
| POST | `/api/score`          | Evaluate agent (no anchor) |
| POST | `/api/evaluate`       | Evaluate + Algorand on-chain anchor |
| POST | `/api/mint-sbt`       | Mint Verun SBT (ASA + defaultFrozen + clawback) |

### Example

```bash
curl -X POST https://algorand.erster.fund/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agt_demo","score":820,"operation":"transfer"}'
```

## Local Development

```bash
cp .env.example .env
# fill in ALGO_MNEMONIC + ALGO_TESTNET_ADDRESS
npm install
npm run check     # verify wallet balance
npm run selftx    # send a test note-transaction
npm run api       # local express server on :3010
```

## Repo Layout

```
api/        Vercel serverless handlers
src/        Core protocol logic (evaluate, anchor, sbt, validators)
scripts/    Wallet check + smoke tests
index.html  Landing page (Erster brand)
docs.html   Technical documentation
```

## Disclosure

Testnet prototype · design intent · not legally certified · not investment
advice. Statements about partner integrations and regulatory alignment
(MiFID II, EU AI Act, tokenforge) are exploratory and subject to
independent legal review.

© 2026 BCP Partners GmbH · Berlin · All rights reserved
