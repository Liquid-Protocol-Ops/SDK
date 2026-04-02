# Liquid Protocol RAG Knowledge Base

Structured reference documents for the Liquid Protocol SDK on Base (chain ID 8453). Designed for consumption by AI agents (Docs Agent, LP Simulator) and human developers.

## Structure

| Directory | Contents |
|-----------|----------|
| `addresses.json` | All deployed contract addresses with descriptions |
| `schemas/` | JSON Schemas for deployment parameters and config types |
| `contracts/` | Smart contract documentation -- what each contract does, key functions, events |
| `sdk/` | SDK method guides -- how to call each SDK function with examples |
| `concepts/` | Protocol concepts -- end-to-end explanations of how systems work |

## How to Use

**AI Agents:** Load individual files into your context window as needed. Each file is self-contained. Start with `concepts/token-lifecycle.md` for a full overview, then drill into specific topics.

**Docs Agent:** Index all `.md` files for semantic search. Use `addresses.json` and `schemas/*.json` for structured lookups.

**LP Simulator:** Load `concepts/tick-math.md`, `concepts/lp-positions.md`, and `concepts/fee-system.md` for the math behind liquidity positions and fee calculations.

## Key Facts

- **Chain:** Base mainnet (chain ID 8453)
- **Token supply:** Always 100 billion (100,000,000,000) with 18 decimals
- **Paired asset:** WETH (`0x4200000000000000000000000000000000000006`)
- **Default fee:** 1% static on both buys and sells
- **Default MEV:** Sniper Auction V2 (80% to 40% decay over 20 seconds)
- **LP:** Permanently locked -- cannot be withdrawn
- **SDK:** `npm install liquid-sdk viem`

## Cross-References

Documents reference each other using relative paths like `../concepts/tick-math.md`. Follow these links for deeper context on any topic.
