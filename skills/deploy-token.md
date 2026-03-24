# Skill: Deploy a Token with Liquid Protocol

You are an AI agent that deploys ERC-20 tokens on Base using the `liquid-sdk`. This skill gives you everything you need to deploy tokens autonomously — from minimal launches to fully customized deployments with dev buys, custom fee structures, and multi-tranche liquidity positions.

## Prerequisites

```bash
npm install liquid-sdk viem
```

You need:
- A **private key** with ETH on Base (for gas + optional dev buy)
- An **RPC endpoint** for Base mainnet (chain ID 8453)

## Setup

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const sdk = new LiquidSDK({ publicClient, walletClient });
```

## Deploying a Token

### Minimal Deploy (2 required fields)

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
});

// result.tokenAddress  → 0x... (the deployed ERC-20)
// result.txHash        → 0x... (the transaction hash)
// result.event.poolId  → 0x... (the Uniswap V4 pool ID)
```

This creates a token with 100 billion supply, a Uniswap V4 pool, locked liquidity, 1% fee on both buys and sells, and sniper auction MEV protection — all with sensible defaults.

### Deploy with Image (IPFS recommended)

```typescript
// Pin to IPFS first with your own Pinata key (free: 500MB)
const form = new FormData();
form.append("file", imageFile); // PNG/JPEG/WEBP/GIF, 256x256 recommended

const pinata = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
  method: "POST",
  headers: { "Authorization": "Bearer YOUR_PINATA_JWT" },
  body: form,
}).then(r => r.json());

const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: `ipfs://${pinata.IpfsHash}`,  // permanent, decentralized
});

// Or use any URL directly (less permanent)
const result2 = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "ipfs://QmYourImageCID",
});
```

Get a Pinata JWT at https://app.pinata.cloud/developers/api-keys.

### Deploy with Dev Buy (buy tokens at launch)

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "ipfs://QmYourImageCID",
  metadata: JSON.stringify({ description: "Launched by an AI agent" }),
  devBuy: {
    ethAmount: parseEther("0.01"), // ETH to spend buying tokens at launch
    recipient: account.address,     // who receives the purchased tokens
  },
});
```

The dev buy happens atomically in the same transaction as deployment. The ETH is swapped through the Uniswap V4 pool. The `msg.value` of the transaction equals the `ethAmount`.

### Deploy with Custom Fees

```typescript
import { encodeStaticFeePoolData, encodeDynamicFeePoolData, ADDRESSES } from "liquid-sdk";

// Static fees: 0% sell fee, 2% buy fee (override defaults)
const result = await sdk.deployToken({
  name: "High Fee Token",
  symbol: "HFT",
  poolData: encodeStaticFeePoolData(0, 200), // (liquidFeeBps, pairedFeeBps)
});

// Dynamic fees (volatility-responsive)
const result2 = await sdk.deployToken({
  name: "Dynamic Fee Token",
  symbol: "DFT",
  hook: ADDRESSES.HOOK_DYNAMIC_FEE_V2,
  poolData: encodeDynamicFeePoolData({
    baseFeeBps: 30,              // 0.3% base
    maxFeeBps: 500,              // 5% max
    referenceTickFilterPeriod: 300,
    resetPeriod: 86400,
    resetTickFilter: 600,
    feeControlNumerator: 50000n,
    decayFilterBps: 500,
  }),
});
```

### Deploy with Custom Liquidity Positions

```typescript
import { createPositionsUSD, createDefaultPositions } from "liquid-sdk";

// Option A: Default 3-tranche positions based on current ETH price
const positions = createDefaultPositions(20_000, 2500); // $20K starting cap, ETH=$2500
const result = await sdk.deployToken({
  name: "Positioned Token",
  symbol: "POS",
  tickIfToken0IsLiquid: positions.tickIfToken0IsLiquid,
  tickLower: positions.tickLower,
  tickUpper: positions.tickUpper,
  positionBps: positions.positionBps,
});

// Option B: Custom tranches
const custom = createPositionsUSD(20_000, 2500, [
  { upperMarketCapUSD: 100_000, supplyPct: 30 },
  { upperMarketCapUSD: 1_000_000, supplyPct: 40 },
  { upperMarketCapUSD: 100_000_000, supplyPct: 30 },
]);
```

### Deploy with Custom Reward Splits

```typescript
const result = await sdk.deployToken({
  name: "Split Token",
  symbol: "SPLIT",
  rewardAdmins: [walletA, walletB],
  rewardRecipients: [walletA, walletB],
  rewardBps: [7000, 3000], // 70% / 30% split
});
```

### Deploy with Context (attribution/tracking)

```typescript
import { buildContext, buildMetadata } from "liquid-sdk";

const result = await sdk.deployToken({
  name: "Social Token",
  symbol: "SOC",
  context: buildContext({
    interface: "My Agent",
    platform: "Farcaster",
    messageId: "0x123abc",
  }),
  metadata: buildMetadata({
    description: "A token launched from a Farcaster cast",
    socialMediaUrls: [
      { platform: "Twitter", url: "https://twitter.com/example" },
    ],
  }),
});
```

## Complete DeployTokenParams Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | `string` | **required** | Token name |
| `symbol` | `string` | **required** | Token symbol |
| `image` | `string` | `""` | Image URL |
| `metadata` | `string` | `""` | JSON metadata string |
| `context` | `string` | `'{"interface":"SDK"}'` | JSON context for attribution |
| `tokenAdmin` | `Address` | wallet address | Can update image/metadata |
| `salt` | `Hex` | auto-generated | CREATE2 salt (unique per deploy) |
| `hook` | `Address` | Static Fee V2 | Fee logic hook contract |
| `pairedToken` | `Address` | WETH | Quote token |
| `tickIfToken0IsLiquid` | `number` | `-230400` | Starting tick (~10 ETH market cap) |
| `tickSpacing` | `number` | `200` | Uniswap V4 tick spacing |
| `poolData` | `Hex` | 1% sell / 1% buy | Encoded fee configuration |
| `locker` | `Address` | LP Locker Fee Conversion | LP locker contract |
| `rewardAdmins` | `Address[]` | `[wallet]` | Reward admin per recipient |
| `rewardRecipients` | `Address[]` | `[wallet]` | Fee recipients |
| `rewardBps` | `number[]` | `[10000]` | BPS per recipient (sum = 10000) |
| `tickLower` | `number[]` | 5-tranche Liquid default | Position lower bounds |
| `tickUpper` | `number[]` | 5-tranche Liquid default | Position upper bounds |
| `positionBps` | `number[]` | 5-tranche Liquid default | Supply % per position (sum = 10000) |
| `lockerData` | `Hex` | auto-encoded | Locker init data |
| `mevModule` | `Address` | Sniper Auction V2 | MEV protection module |
| `mevModuleData` | `Hex` | 80%→40% over 20s | Encoded auction config |
| `extensions` | `ExtensionConfig[]` | `[]` | Additional extensions |
| `devBuy` | `DevBuyParams` | none | Buy tokens at launch |

## DeployTokenResult

```typescript
interface DeployTokenResult {
  tokenAddress: Address;      // The deployed ERC-20 contract
  txHash: Hash;               // Transaction hash
  event: TokenCreatedEvent;   // Full on-chain event data
}

// event contains:
// .poolId        — Uniswap V4 pool ID (bytes32)
// .poolHook      — Hook contract used
// .locker        — LP locker address
// .mevModule     — MEV module address
// .extensions    — Extension addresses
// .tokenAdmin    — Admin address
// .startingTick  — Initial tick
// .pairedToken   — Quote token (WETH)
```

## What Happens On-Chain

When `deployToken()` executes, a single transaction:

1. **Creates the ERC-20 token** with 100 billion supply (18 decimals)
2. **Initializes a Uniswap V4 pool** paired with WETH
3. **Locks all LP** in the LP Locker (non-ruggable)
4. **Configures reward splits** for fee distribution
5. **Activates MEV protection** (sniper auction: 80%→40% fee decay over 20 seconds)
6. **Executes dev buy** if specified (swaps ETH→tokens in same tx)
7. **Emits `TokenCreated` event** with all deployment data

## Validation Rules

The SDK validates before sending the transaction:
- 1–7 positions allowed, BPS must sum to 10000
- All ticks must be aligned to `tickSpacing`
- All `tickLower` must be `≥ tickIfToken0IsLiquid`
- At least one position must have `tickLower == tickIfToken0IsLiquid`
- 1+ reward recipients, BPS must sum to 10000
- Max 10 extensions, max 90% of supply to extensions total

## Post-Deploy Operations

After deployment, you can:

```typescript
// Update token image or metadata (admin only)
await sdk.updateImage(result.tokenAddress, "https://new-image.png");
await sdk.updateMetadata(result.tokenAddress, '{"description":"Updated"}');

// Check deployment info
const info = await sdk.getDeploymentInfo(result.tokenAddress);
const tokenInfo = await sdk.getTokenInfo(result.tokenAddress);

// Check MEV lock status
const unlockTime = await sdk.getPoolUnlockTime(result.event.poolId);
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `TickRangeLowerThanStartingTick` | `tickLower < tickIfToken0IsLiquid` | Ensure all position ticks ≥ starting tick |
| Insufficient funds | Not enough ETH for gas + devBuy | Check balance covers gas + `devBuy.ethAmount` |
| `rewardBps must sum to 10000` | BPS array doesn't total 10000 | Fix the array values |
| `positions and bps arrays must be same length` | Mismatched arrays | Ensure tickLower, tickUpper, positionBps are same length |

## Contract Addresses (Base Mainnet)

```typescript
import { ADDRESSES, EXTERNAL } from "liquid-sdk";

ADDRESSES.FACTORY                    // Token factory
ADDRESSES.HOOK_STATIC_FEE_V2        // Default hook (1% buy + 1% sell)
ADDRESSES.HOOK_DYNAMIC_FEE_V2       // Dynamic fee hook
ADDRESSES.LP_LOCKER_FEE_CONVERSION  // Default locker (converts fees to ETH)
ADDRESSES.SNIPER_AUCTION_V2         // Default MEV module
ADDRESSES.UNIV4_ETH_DEV_BUY         // Dev buy extension
EXTERNAL.WETH                       // Base WETH
EXTERNAL.POOL_MANAGER               // Uniswap V4 Pool Manager
```
