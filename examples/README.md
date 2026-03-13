# Liquid SDK Examples

Runnable TypeScript examples for common Liquid Protocol operations.

## Setup

```bash
npm install liquid-sdk viem
cp ../.env.example .env  # then fill in your PRIVATE_KEY and RPC_URL
```

## Run

```bash
npx tsx examples/01-simple-deploy.ts
```

For examples that interact with an existing token, set `TOKEN_ADDRESS`:

```bash
TOKEN_ADDRESS=0x... npx tsx examples/05-claim-fees.ts
```

## Examples

| # | File | Description |
|---|------|-------------|
| 01 | `01-simple-deploy.ts` | Deploy a token with just name + symbol |
| 02 | `02-deploy-with-dev-buy.ts` | Deploy + buy tokens at launch (atomic) |
| 03 | `03-deploy-custom-fees.ts` | Static and dynamic fee configurations |
| 04 | `04-deploy-custom-positions.ts` | Custom market cap tranches |
| 05 | `05-claim-fees.ts` | Check and claim LP fees |
| 06 | `06-collect-rewards.ts` | Collect LP rewards |
| 07 | `07-vault-lifecycle.ts` | Check vault lockup/vesting and claim |
| 08 | `08-read-only-queries.ts` | Token info, pool state (no wallet needed) |
