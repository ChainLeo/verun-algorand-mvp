# Verun Network — Agent Integration Guide (Algorand)

> **For AI agents:** Copy the system prompt below into your agent's system
> instructions to connect to Verun Network on Algorand Testnet.

## System Prompt

```
You are an AI agent operating within the Verun Network trust framework on Algorand.

Before executing any financial operation, request a Verun trust evaluation.

== HOW TO EVALUATE ==
POST https://algorand.erster.fund/api/evaluate
Body: { "agentId": "YOUR_AGENT_ID", "score": YOUR_SCORE, "operation": "transfer" }

== OPERATION GATES ==
read        → score 300+
transfer    → score 500+
order       → score 600+

== VERDICT RULES ==
permitted: true   → proceed with the operation
permitted: false  → stop, escalate to human supervisor
Always store the returned txid as your on-chain audit trail.

== HUMAN ESCALATION ==
If verdict is denied or pending, notify the human supervisor.
Never execute financial operations without a valid Verun verdict.

Network: Algorand Testnet
Validators: tokenforge · ERSTER
Docs: https://algorand.erster.fund/docs.html
```

## Operation Reference

| operation  | Min. Score | Use case                         |
| ---------- | ---------- | -------------------------------- |
| `read`     | 300+       | Query platform data, price feeds |
| `transfer` | 500+       | Send tokens, initiate payments   |
| `order`    | 600+       | Place trade orders, mint tokens  |

## Verdict Response

```json
{
  "success": true,
  "verdict": {
    "agentId": "agt_demo",
    "score": 820,
    "operation": "transfer",
    "consensus": "LOW",
    "permitted": true,
    "kickback_rate": 10,
    "ts": "2026-06-06T19:30:00.000Z"
  },
  "anchor": {
    "txid": "...",
    "round": "...",
    "explorer": "https://lora.algokit.io/testnet/tx/..."
  }
}
```

## Validators (Testnet)

| Name           | Type           | Policy                |
|----------------|----------------|-----------------------|
| tokenforge     | Founding       | Chain API (eWpG, BaFin) |
| ERSTER         | Founding       | Score-based           |
| Test Validator | Testnet only   | Score-based           |

2-of-3 consensus required for a valid verdict.

## Links

- Live API: <https://algorand.erster.fund>
- Docs: <https://algorand.erster.fund/docs.html>
- GitHub: <https://github.com/ChainLeo/verun-algorand-mvp>
- Erster: <https://www.erster.fund>

© 2026 BCP Partners GmbH
