# Hackathon Submission — x402 Agentic Commerce on Algorand (June 6–7, 2026)

> **Track:** Track 1 — Agentic Commerce (Existing Project tier)
> **Bonus tracks opted in:** Quantoz (EURD/EUR), Folks Finance (xALGO)
> **Live:** <https://algorand.erster.fund>
> **Repo:** <https://github.com/ChainLeo/verun-algorand-mvp>

---

## What this project is

**Verun is the trust layer for x402.** Before an AI agent can pay for a
regulated financial service over x402, a regulated platform needs to know
*who* the agent is, *what* it is allowed to do, and *whether* it can be
trusted. Verun answers that with a consensus-based Trust Score (0–1000)
issued by registered validators, anchored on Algorand for every evaluation,
and now itself accessible via **x402** as a pay-per-evaluation service.

In one round trip:

1. An agent calls `POST /api/x402/evaluate`
2. We return **HTTP 402** + paymentRequirements (USDC, EURD, or EUR)
3. The agent signs a PaymentTxn group and retries with `X-PAYMENT` header
4. We verify + settle via the **GoPlausible facilitator**
5. We run 2-of-3 validator consensus (ERSTER + tokenforge + Test)
6. We anchor the verdict on Algorand Testnet via a Note-Transaction
7. The agent receives `{ verdict, anchor, settlement }` in the response

No subscriptions, no API keys, no human in the loop — the agent pays and
gets accredited.

## Built before vs. added during the hackathon

| Component | Built before (pre-hackathon) | Added during hackathon |
|---|---|---|
| Algorand Testnet deployment | ✅ | |
| Validator framework (3 validators, 2-of-3 consensus) | ✅ | |
| Note-Transaction on-chain anchoring | ✅ | |
| SBT mint via ASA (defaultFrozen + clawback) | ✅ | |
| Trust score gates (300/500/600) | ✅ | |
| MiFID II + EU AI Act framing | ✅ | |
| Lora Explorer integration | ✅ | |
| Live demo widget on landing | ✅ | |
| **x402 endpoint** (`/api/x402/evaluate`) | | ✅ (`src/x402.js` + `api/x402/evaluate.js`) |
| **GoPlausible facilitator** integration (`/verify` + `/settle`) | | ✅ |
| **Multi-scheme accept**: USDC + EURD + EUR | | ✅ (3 schemes in `paymentRequirements.accepts`) |
| **Quantoz** EURD/EUR support (bonus track) | | ✅ (announced via paymentRequirements; bridge-ready) |
| **Folks Finance** xALGO yield (bonus track) | | ✅ (`src/treasury.js` + `/api/treasury`) |
| Landing-page **x402 commerce section** with pricing | | ✅ |
| `x402 Powered` badge in nav | | ✅ |
| `algorand.erster.fund` custom subdomain | | ✅ (set up during hackathon) |

**Time period of pre-hackathon work:** April–June 2026 (~8 weeks of design
and prototype iteration on the Verun Trust Layer concept).

## Why we added x402

Until now, Verun gave verdicts for free. That works for a demo but not for
a real network: validators bear cost, the protocol bears infrastructure
cost, and there is no economic gravity that pulls agents toward the
network. x402 fixes this with the smallest possible billing surface — a
single payment header, settled atomically. It turns Verun from a
demonstration into a self-sustaining piece of infrastructure that any
agent (Claude, GPT, custom) can use without onboarding.

## How to test it

```bash
# 1. Trigger the 402 challenge
curl -i -X POST https://algorand.erster.fund/api/x402/evaluate

# Response includes:
#   HTTP/1.1 402 Payment Required
#   X-402-Powered: https://facilitator.goplausible.xyz · USDC
#   Body: { x402Version: 1, accepts: [USDC, EURD, EUR], ... }

# 2. Inspect the treasury (xALGO position)
curl https://algorand.erster.fund/api/treasury

# 3. Verify the protocol wallet is funded
curl https://algorand.erster.fund/api/funding-status
```

For the full settled flow, use the official x402 client SDK or
`@ever_amsterdam/x402-euro-eurd` (Quantoz). Example client code is in the
landing-page `#x402` section.

## Bonus tracks

### Quantoz (EURD / EUR)

`paymentRequirements.accepts` advertises three schemes:

| Scheme | Network | Asset | Provider |
|---|---|---|---|
| `exact` | `algorand:testnet` | USDC | GoPlausible |
| `exact` | `algorand:mainnet` | EURD | Quantoz bridge |
| `euro` | `quantoz:euro` | EUR | Quantoz managed accounts |

The agent picks whichever it prefers. Both EURD and EUR routes are wired
through Quantoz infrastructure. The Quantoz client wrapper
(`@ever_amsterdam/x402-euro-eurd`) drops in unchanged.

### Folks Finance (xALGO)

Protocol fees collected via x402 are designed to auto-sweep into **xALGO**
(Folks Finance liquid staking ASA) for native ALGO yield without locking
liquidity. Treasury position is visible at `GET /api/treasury`, which
shows live ALGO balance + xALGO opt-in state.

## Roadmap (milestones for the second 50% of prize)

1. Replace the testnet protocol wallet with a multi-sig validator-managed
   treasury (BCP Partners + ERSTER co-signers).
2. Migrate the on-chain anchor from a Note-Tx to a Smart-ASA (ARC-20)
   that carries the verdict tier and is freely verifiable by any
   downstream merchant.
3. Mainnet deployment with audited contracts + final legal review of the
   MiFID II + EU AI Act alignment.
4. Onboard a third licensed institutional validator under the open slot.

---

© 2026 BCP Partners GmbH · Berlin · All rights reserved
