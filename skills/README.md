# Liquid SDK — Agent Skills

Drop these files into your AI agent's context to give it the ability to interact with Liquid Protocol on Base.

## Available Skills

| Skill | File | Description |
|-------|------|-------------|
| **Deploy Token** | [`deploy-token.md`](./deploy-token.md) | Deploy ERC-20 tokens with Uniswap V4 liquidity, custom fees, dev buys, and reward splits |
| **Bid in Auction** | [`bid-in-auction.md`](./bid-in-auction.md) | Participate in sniper auctions for early access to newly launched tokens |
| **Index Tokens** | [`index-tokens.md`](./index-tokens.md) | Discover, index, and monitor all Liquid Protocol token deployments |
| **Fee Tracking** | [`fee-tracking.md`](./fee-tracking.md) | Track fee accrual, burns, and LIQ buyback cycles per token — build proof-of-burn feeds without a backend |

## How to Use

These are standalone markdown files designed to be loaded into an AI agent's system prompt or context window. Each skill contains:

- Complete setup instructions
- Step-by-step workflows with code examples
- Type definitions and parameter references
- Full working examples
- Error handling and edge cases

### With Claude Code

Place a skill file in your project and reference it in your `CLAUDE.md`:

```markdown
For token deployment, follow the instructions in skills/deploy-token.md
```

### With Other AI Agents

Load the skill file contents into your agent's system prompt or tool description:

```python
with open("skills/deploy-token.md") as f:
    skill = f.read()

agent.system_prompt += f"\n\n{skill}"
```

### With MCP Servers

Serve skill files as resources through an MCP server for on-demand agent access.

## Requirements

All skills require:
- `liquid-sdk` and `viem` npm packages
- An RPC endpoint for Base mainnet (chain ID 8453)
- For write operations: a private key with ETH on Base
