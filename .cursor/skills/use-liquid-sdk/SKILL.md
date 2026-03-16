---
skill: use-liquid-sdk
description: Deploy ERC-20 tokens with Uniswap V4 liquidity on Base using the Liquid Protocol SDK
activation_keywords:
  - deploy a token
  - create a coin
  - launch a token
  - launch on Base
  - token launcher
  - liquid sdk
  - liquid protocol
  - claim fees
  - collect rewards
  - airdrop
  - vault
  - dev buy
  - token deployment
  - erc20 deploy
  - uniswap v4
---

# Liquid SDK — Cursor Skill Reference

TypeScript SDK for deploying ERC-20 tokens with Uniswap V4 liquidity on Base.
Zero API keys. One peer dependency (`viem`). Full on-chain token lifecycle.

## Install

```bash
npm install liquid-sdk viem
```

## Setup

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

// Read-only (no wallet needed for queries)
const publicClient = createPublicClient({ chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient });

// Read + write (wallet required for transactions)
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient, walletClient });
```

## Deploy a Token

Minimal — only `name` and `symbol` required:

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
});

console.log(result.tokenAddress);   // 0x...
console.log(result.txHash);         // 0x...
console.log(result.event.poolId);   // 0x... Uniswap V4 pool ID
```

### With Dev Buy (buy tokens at launch)

```typescript
import { parseEther } from "viem";

const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"),
    recipient: account.address,
  },
});
```

### With Image, Metadata & Context

```typescript
import { buildContext, buildMetadata } from "liquid-sdk";

const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "https://example.com/logo.png",
  metadata: buildMetadata({
    description: "A cool token",
    socialMediaUrls: [{ platform: "twitter", url: "https://x.com/mytoken" }],
  }),
  context: buildContext({ interface: "My App", platform: "Farcaster" }),
});
```

### With Custom Fee Configuration

```typescript
import { encodeStaticFeePoolData, encodeDynamicFeePoolData } from "liquid-sdk";

// Static 2% buy fee, 0.5% sell fee
const result = await sdk.deployToken({
  name: "Fee Token",
  symbol: "FEE",
  poolData: encodeStaticFeePoolData(50, 200), // (liquidFeeBps, pairedFeeBps)
});
```

### With Custom Positions (Market Cap Tranches)

```typescript
import { createPositionsUSD } from "liquid-sdk";

const positions = createPositionsUSD(20_000, 2500, [
  { marketCapUSD: 1_000_000, bps: 5000 },  // 50% up to $1M
  { marketCapUSD: 50_000_000, bps: 3000 },  // 30% up to $50M
  { marketCapUSD: 500_000_000, bps: 2000 }, // 20% up to $500M
]);

const result = await sdk.deployToken({
  name: "Tranche Token",
  symbol: "TRN",
  tickIfToken0IsLiquid: positions.tickIfToken0IsLiquid,
  tickLower: positions.tickLower,
  tickUpper: positions.tickUpper,
  positionBps: positions.positionBps,
});
```

### With Custom Reward Splits

```typescript
const result = await sdk.deployToken({
  name: "Split Token",
  symbol: "SPLIT",
  rewardAdmins: [deployer, partner],
  rewardRecipients: [deployer, partner],
  rewardBps: [7000, 3000], // 70% / 30%
});
```

## Fee Management

```typescript
const fees = await sdk.getFeesToClaim(ownerAddress, tokenAddress);
if (fees > 0n) {
  const txHash = await sdk.claimFees(ownerAddress, tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

## LP Reward Collection

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
// rewards.rewardRecipients, rewards.rewardBps

const txHash = await sdk.collectRewards(tokenAddress);
await publicClient.waitForTransactionReceipt({ hash: txHash });

// Or without unlock (safer during MEV lock period):
const txHash = await sdk.collectRewardsWithoutUnlock(tokenAddress);
```

## Vault (Lockup & Vesting)

```typescript
const vault = await sdk.getVaultAllocation(tokenAddress);
const claimable = await sdk.getVaultClaimable(tokenAddress);
if (claimable > 0n) {
  const txHash = await sdk.claimVault(tokenAddress);
}
```

## Airdrop

```typescript
const info = await sdk.getAirdropInfo(tokenAddress);
const claimable = await sdk.getAirdropClaimable(tokenAddress, recipient, amount);
const txHash = await sdk.claimAirdrop(tokenAddress, recipient, amount, proof);
```

## Token Info & Discovery (Read-Only)

```typescript
const info = await sdk.getTokenInfo(tokenAddress);
// info.name, info.symbol, info.decimals, info.totalSupply, info.deployment

const deploy = await sdk.getDeploymentInfo(tokenAddress);
// deploy.token, deploy.hook, deploy.locker, deploy.extensions

// Look up a single token's full event data (name, metadata, context, poolId, etc.)
const event = await sdk.getTokenEvent(tokenAddress);
// event.tokenMetadata → parse with parseMetadata()
// event.tokenContext  → parse with parseContext()

// List all tokens (for indexing/wallet integrations)
const allTokens = await sdk.getTokens();
const myTokens = await sdk.getTokens({ deployer: myAddress });

// Paginate by block range
const page = await sdk.getTokens({ fromBlock: 20000000n, toBlock: 20100000n });
```

## Metadata Updates (Admin Only)

```typescript
await sdk.updateImage(tokenAddress, "https://new-image.png");
await sdk.updateMetadata(tokenAddress, '{"description":"Updated"}');
await sdk.updateRewardRecipient(tokenAddress, 0n, newRecipientAddress);
```

## Pool & Auction Reads

```typescript
const config = await sdk.getPoolConfig(poolId);
const feeState = await sdk.getPoolFeeState(poolId);
const auction = await sdk.getAuctionState(poolId);
const unlockTime = await sdk.getPoolUnlockTime(poolId);
```

## Default Values

| Field | Default |
|-------|---------|
| `hook` | Static Fee V2 (1% buy + 1% sell) |
| `tickSpacing` | 200 |
| `tickIfToken0IsLiquid` | -230400 (~10 ETH market cap) |
| `positions` | 3-tranche: 40% → $500K, 50% → $10M, 10% → $1B |
| `mevModule` | Sniper Auction V2 (80% → 40% over 20s) |
| `rewardRecipients` | [deployer] at 100% |
| `context` | `{"interface":"SDK"}` |

## Contract Addresses (Base Mainnet)

```typescript
import { ADDRESSES, EXTERNAL } from "liquid-sdk";

ADDRESSES.FACTORY                  // 0x04F1a284168743759BE6554f607a10CEBdB77760
ADDRESSES.LP_LOCKER_FEE_CONVERSION // 0x77247fCD1d5e34A3703AcA898A591Dc7422435f3 (default)
ADDRESSES.FEE_LOCKER               // 0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF
ADDRESSES.VAULT                    // 0xdFCCC93257c20519A9005A2281CFBdF84836d50E
ADDRESSES.HOOK_STATIC_FEE_V2       // 0x9811f10Cd549c754Fa9E5785989c422A762c28cc
ADDRESSES.HOOK_DYNAMIC_FEE_V2      // 0x80E2F7dC8C2C880BbC4BDF80A5Fb0eB8B1DB68CC
ADDRESSES.SNIPER_AUCTION_V2        // 0x187e8627c02c58F31831953C1268e157d3BfCefd
ADDRESSES.MEV_DESCENDING_FEES      // 0x8D6B080e48756A99F3893491D556B5d6907b6910
ADDRESSES.SNIPER_UTIL_V2           // 0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f
ADDRESSES.AIRDROP_V2               // 0x1423974d48f525462f1c087cBFdCC20BDBc33CdD
ADDRESSES.UNIV4_ETH_DEV_BUY        // 0x5934097864dC487D21A7B4e4EEe201A39ceF728D
ADDRESSES.POOL_EXTENSION_ALLOWLIST  // 0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa
EXTERNAL.WETH                      // 0x4200000000000000000000000000000000000006
EXTERNAL.POOL_MANAGER              // 0x498581fF718922c3f8e6A244956aF099B2652b2b
```

## Constants

```typescript
import { FEE, TOKEN } from "liquid-sdk";

TOKEN.SUPPLY       // 100_000_000_000n * 10n ** 18n (100B tokens)
TOKEN.DECIMALS     // 18
FEE.BPS            // 10_000
FEE.DENOMINATOR    // 1_000_000
```

## Error Handling

All write methods throw viem errors on failure. Common reverts:

| Error | Meaning | Fix |
|-------|---------|-----|
| `ManagerLocked` | Pool in MEV lock period | Wait for `getPoolUnlockTime()` or use `collectRewardsWithoutUnlock` |
| `NoFeesToClaim` | No fees accrued | Wait for trading activity |
| `Unauthorized` | Caller not admin/owner | Use correct wallet |
| `AlreadyClaimed` | Airdrop already claimed | Check `getAirdropClaimable()` first |
| `LockupNotEnded` | Vault still locked | Check `getVaultAllocation().lockupEndTime` |

## Architecture

- **Chain:** Base mainnet only (8453)
- **Token supply:** Always 100 billion (18 decimals)
- **LP:** Locked in LP Locker — cannot be rugged
- **Fee flow:** Trading → LP Locker → reward recipients by BPS
- **Extensions:** Up to 10 per token, max 90% of supply
- **Dev buy:** ETH swapped in same tx as deployment (not separate)
