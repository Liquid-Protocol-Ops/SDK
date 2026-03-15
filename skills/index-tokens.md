# Skill: Index Liquid Protocol Tokens

You are an AI agent that indexes and tracks token deployments on Liquid Protocol. This skill teaches you how to discover tokens, build an index, track new launches in real-time, and query the full on-chain state of any Liquid token on Base.

## What You Can Index

Every token deployed through Liquid Protocol emits a `TokenCreated` event with rich on-chain data:

- Token address, name, symbol, image URL
- Deployer address and admin address
- Metadata (description, social links, audit URLs)
- Context (originating interface, platform, social post ID)
- Uniswap V4 pool ID, hook contract, paired token
- LP locker address and MEV module
- Extensions (dev buy, vault, airdrop, etc.)
- Block number (for pagination/ordering)

All of this is queryable directly from Base mainnet — no backend, no API keys, no database required.

## Prerequisites

```bash
npm install liquid-sdk viem
```

## Setup

```typescript
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-sdk";

// Read-only — no wallet needed for indexing
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const sdk = new LiquidSDK({ publicClient });
```

## Core Indexing Methods

### 1. Get All Tokens

```typescript
const allTokens = await sdk.getTokens();

console.log(`Total tokens: ${allTokens.length}`);
for (const token of allTokens) {
  console.log(`${token.tokenName} (${token.tokenSymbol}) — ${token.tokenAddress}`);
  console.log(`  Deployed by: ${token.msgSender}`);
  console.log(`  Pool ID: ${token.poolId}`);
  console.log(`  Block: ${token.blockNumber}`);
}
```

### 2. Get Tokens by Deployer

```typescript
// All tokens launched by a specific wallet
const myTokens = await sdk.getTokens({ deployer: "0x1234..." });

// Or use the convenience wrapper
const myTokens2 = await sdk.getDeployedTokens("0x1234...");
```

Note: `msgSender` (deployer) is **not indexed** on-chain, so the SDK fetches all events and filters client-side. For large ranges, use block pagination to keep RPC calls manageable.

### 3. Look Up a Single Token

```typescript
// Fast O(1) lookup — tokenAddress IS indexed on-chain
const token = await sdk.getTokenEvent("0xTokenAddress...");

if (token) {
  console.log(`${token.tokenName} (${token.tokenSymbol})`);
  console.log(`Pool: ${token.poolId}`);
  console.log(`Hook: ${token.poolHook}`);
  console.log(`Locker: ${token.locker}`);
  console.log(`MEV Module: ${token.mevModule}`);
  console.log(`Extensions: ${token.extensions}`);
  console.log(`Image: ${token.tokenImage}`);
} else {
  console.log("Not a Liquid Protocol token");
}
```

### 4. Paginate with Block Ranges

```typescript
// Page through tokens using block numbers
const BLOCK_SIZE = 100_000n;
let fromBlock = 20_000_000n; // start from factory deployment block
let allTokens: TokenCreatedEvent[] = [];

while (true) {
  const toBlock = fromBlock + BLOCK_SIZE;
  const page = await sdk.getTokens({ fromBlock, toBlock });

  allTokens.push(...page);
  console.log(`Fetched ${page.length} tokens from blocks ${fromBlock}–${toBlock}`);

  if (page.length === 0) break; // no more tokens
  fromBlock = toBlock + 1n;
}

console.log(`Total indexed: ${allTokens.length} tokens`);
```

### 5. Cursor-Based Pagination

```typescript
// Use the last token's blockNumber as cursor for next page
let cursor = 0n;
const PAGE_SIZE = 50;

async function getNextPage() {
  const tokens = await sdk.getTokens({ fromBlock: cursor + 1n });

  if (tokens.length > 0) {
    cursor = tokens[tokens.length - 1].blockNumber!;
  }

  return tokens;
}
```

## TokenCreatedEvent Schema

```typescript
interface TokenCreatedEvent {
  // Addresses
  msgSender: Address;         // Wallet that called deployToken()
  tokenAddress: Address;      // The deployed ERC-20 (indexed on-chain)
  tokenAdmin: Address;        // Can update image/metadata (indexed on-chain)

  // Token Metadata
  tokenName: string;          // e.g., "My Token"
  tokenSymbol: string;        // e.g., "MTK"
  tokenImage: string;         // Image URL or empty string
  tokenMetadata: string;      // JSON string — parse with parseMetadata()
  tokenContext: string;       // JSON string — parse with parseContext()

  // Pool Configuration
  startingTick: number;       // Initial Uniswap V4 tick (int24)
  poolHook: Address;          // Hook contract (static or dynamic fee)
  poolId: Hex;                // Uniswap V4 pool identifier (bytes32)
  pairedToken: Address;       // Quote token (usually WETH)

  // Infrastructure
  locker: Address;            // LP locker contract
  mevModule: Address;         // MEV module (usually Sniper Auction V2)
  extensionsSupply: bigint;   // Total supply allocated to extensions (wei)
  extensions: Address[];      // Active extension contracts

  // Block Info
  blockNumber?: bigint;       // Block where event was emitted
}
```

## Parsing Metadata and Context

The `tokenMetadata` and `tokenContext` fields are JSON strings. Use the SDK's parsers:

```typescript
import { parseMetadata, parseContext } from "liquid-sdk";

const token = await sdk.getTokenEvent(tokenAddress);

// Parse metadata
const meta = parseMetadata(token.tokenMetadata);
if (meta) {
  console.log("Description:", meta.description);
  console.log("Social links:", meta.socialMediaUrls); // [{ platform, url }]
  console.log("Audit URLs:", meta.auditUrls);
}

// Parse context (deployment provenance)
const ctx = parseContext(token.tokenContext);
if (ctx) {
  console.log("Interface:", ctx.interface);   // "SDK", "Rainbow Wallet", etc.
  console.log("Platform:", ctx.platform);     // "Farcaster", "Twitter", etc.
  console.log("Message ID:", ctx.messageId);  // Social post ID
  console.log("User ID:", ctx.id);
}
```

**Context types:**
```typescript
interface LiquidContext {
  interface: string;    // System that deployed (e.g., "SDK", "My App")
  platform?: string;    // Social platform
  messageId?: string;   // Social post/cast ID
  id?: string;          // User ID on platform
}

interface LiquidMetadata {
  description?: string;
  socialMediaUrls?: { platform: string; url: string }[];
  auditUrls?: string[];
}
```

## Enriching Token Data

Once you have the token event, you can query additional on-chain state:

### Full Token Info

```typescript
const info = await sdk.getTokenInfo(tokenAddress);
console.log(`${info.name} (${info.symbol})`);
console.log(`Decimals: ${info.decimals}`);       // always 18
console.log(`Supply: ${info.totalSupply}`);       // 100 billion * 10^18
console.log(`Hook: ${info.deployment.hook}`);
console.log(`Locker: ${info.deployment.locker}`);
console.log(`Extensions: ${info.deployment.extensions}`);
```

### Reward Configuration

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
console.log("Recipients:", rewards.rewardRecipients);
console.log("Splits (bps):", rewards.rewardBps);   // e.g., [7000, 3000]
console.log("Admins:", rewards.rewardAdmins);
console.log("Pool key:", rewards.poolKey);
console.log("Position ID:", rewards.positionId);
console.log("Num positions:", rewards.numPositions);
```

### Pool State

```typescript
const poolConfig = await sdk.getPoolConfig(poolId);
console.log("Base fee:", poolConfig.baseFee);
console.log("Max LP fee:", poolConfig.maxLpFee);

const feeState = await sdk.getPoolFeeState(poolId);
console.log("Reference tick:", feeState.referenceTick);
console.log("Last swap:", feeState.lastSwapTimestamp);

const createdAt = await sdk.getPoolCreationTimestamp(poolId);
console.log("Pool created:", new Date(Number(createdAt) * 1000));

const isToken0 = await sdk.isLiquidToken0(poolId);
console.log("Liquid is token0:", isToken0);
```

### MEV / Auction State

```typescript
const auction = await sdk.getAuctionState(poolId);
console.log("Auction round:", auction.round);
console.log("Current fee:", auction.currentFee);
console.log("Gas peg:", auction.gasPeg);

const unlockTime = await sdk.getPoolUnlockTime(poolId);
const now = BigInt(Math.floor(Date.now() / 1000));
console.log("Pool locked:", now < unlockTime);
```

### Fee & Reward Balances

```typescript
// Check accrued fees
const fees = await sdk.getAvailableFees(feeOwner, tokenAddress);
const claimable = await sdk.getFeesToClaim(feeOwner, tokenAddress);
console.log("Total fees:", fees);
console.log("Claimable now:", claimable);
```

### Vault State (if token has vault extension)

```typescript
const vault = await sdk.getVaultAllocation(tokenAddress);
console.log("Total locked:", vault.amountTotal);
console.log("Claimed:", vault.amountClaimed);
console.log("Lockup ends:", new Date(Number(vault.lockupEndTime) * 1000));
console.log("Vesting ends:", new Date(Number(vault.vestingEndTime) * 1000));
```

### Airdrop State (if token has airdrop extension)

```typescript
const airdrop = await sdk.getAirdropInfo(tokenAddress);
console.log("Merkle root:", airdrop.merkleRoot);
console.log("Total supply:", airdrop.totalSupply);
console.log("Claimed:", airdrop.totalClaimed);
```

## Complete Example: Build a Token Index

```typescript
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import { LiquidSDK, parseMetadata, parseContext, ADDRESSES } from "liquid-sdk";

async function buildIndex() {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const sdk = new LiquidSDK({ publicClient });

  // Fetch all tokens
  const tokens = await sdk.getTokens();
  console.log(`Indexing ${tokens.length} tokens...\n`);

  const index = [];

  for (const token of tokens) {
    const meta = parseMetadata(token.tokenMetadata);
    const ctx = parseContext(token.tokenContext);

    const entry = {
      address: token.tokenAddress,
      name: token.tokenName,
      symbol: token.tokenSymbol,
      image: token.tokenImage,
      description: meta?.description ?? null,
      socialLinks: meta?.socialMediaUrls ?? [],
      deployer: token.msgSender,
      deployedAt: token.blockNumber,
      poolId: token.poolId,
      pairedToken: token.pairedToken,
      hook: token.poolHook,
      locker: token.locker,
      mevModule: token.mevModule,
      extensions: token.extensions,
      launchedVia: ctx?.interface ?? "unknown",
      platform: ctx?.platform ?? null,
      castId: ctx?.messageId ?? null,
    };

    index.push(entry);
  }

  return index;
}

// Usage
const index = await buildIndex();
console.log(JSON.stringify(index, null, 2));
```

## Complete Example: Real-Time Token Monitor

```typescript
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { LiquidSDK, parseContext, ADDRESSES } from "liquid-sdk";

async function monitorNewTokens(callback: (token: any) => void) {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const sdk = new LiquidSDK({ publicClient });

  let lastBlock = await publicClient.getBlockNumber();

  console.log(`Monitoring from block ${lastBlock}...`);

  setInterval(async () => {
    try {
      const currentBlock = await publicClient.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const newTokens = await sdk.getTokens({
        fromBlock: lastBlock + 1n,
        toBlock: currentBlock,
      });

      for (const token of newTokens) {
        const ctx = parseContext(token.tokenContext);
        console.log(`\nNew token: ${token.tokenName} (${token.tokenSymbol})`);
        console.log(`  Address: ${token.tokenAddress}`);
        console.log(`  Deployer: ${token.msgSender}`);
        console.log(`  Pool ID: ${token.poolId}`);
        console.log(`  Launched via: ${ctx?.interface ?? "unknown"}`);
        callback(token);
      }

      lastBlock = currentBlock;
    } catch (err) {
      console.error("Poll error:", err);
    }
  }, 2000); // poll every 2 seconds (Base block time)
}

// Usage
monitorNewTokens((token) => {
  // Process new token — save to DB, send alert, etc.
});
```

## Complete Example: Enrich a Token for Display

```typescript
async function enrichToken(tokenAddress: `0x${string}`) {
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const sdk = new LiquidSDK({ publicClient });

  // Parallel queries for speed
  const [event, info, rewards] = await Promise.all([
    sdk.getTokenEvent(tokenAddress),
    sdk.getTokenInfo(tokenAddress),
    sdk.getTokenRewards(tokenAddress),
  ]);

  if (!event) return null;

  const meta = parseMetadata(event.tokenMetadata);

  // Pool state (parallel)
  const [poolConfig, feeState, createdAt, auctionState] = await Promise.all([
    sdk.getPoolConfig(event.poolId),
    sdk.getPoolFeeState(event.poolId),
    sdk.getPoolCreationTimestamp(event.poolId),
    sdk.getAuctionState(event.poolId),
  ]);

  return {
    token: {
      address: tokenAddress,
      name: info.name,
      symbol: info.symbol,
      decimals: info.decimals,
      totalSupply: info.totalSupply.toString(),
      image: event.tokenImage,
      description: meta?.description,
      socialLinks: meta?.socialMediaUrls,
    },
    deployment: {
      deployer: event.msgSender,
      admin: event.tokenAdmin,
      block: event.blockNumber,
      hook: event.poolHook,
      locker: event.locker,
      extensions: event.extensions,
    },
    pool: {
      id: event.poolId,
      pairedToken: event.pairedToken,
      baseFee: poolConfig.baseFee,
      maxLpFee: poolConfig.maxLpFee,
      createdAt: Number(createdAt),
      referenceTick: feeState.referenceTick,
    },
    rewards: {
      recipients: rewards.rewardRecipients,
      splits: rewards.rewardBps,
      numPositions: Number(rewards.numPositions),
    },
    auction: {
      round: Number(auctionState.round),
      currentFee: auctionState.currentFee,
      gasPeg: auctionState.gasPeg.toString(),
    },
  };
}
```

## On-Chain Event Signature

The `TokenCreated` event emitted by the Liquid Factory:

```solidity
event TokenCreated(
  address msgSender,             // NOT indexed — filtered client-side
  address indexed tokenAddress,  // indexed — efficient single lookup
  address indexed tokenAdmin,    // indexed — filter by admin
  string tokenImage,
  string tokenName,
  string tokenSymbol,
  string tokenMetadata,
  string tokenContext,
  int24 startingTick,
  address poolHook,
  bytes32 poolId,
  address pairedToken,
  address locker,
  address mevModule,
  uint256 extensionsSupply,
  address[] extensions
);
```

**Indexing implications:**
- `getTokenEvent(address)` is a single RPC call (uses indexed `tokenAddress`)
- `getTokens({ deployer })` requires fetching all events then filtering (msgSender not indexed)
- Block-range pagination is the primary scaling mechanism for large datasets

## Performance Tips

1. **Use `getTokenEvent()` for single lookups** — it's O(1) via the indexed field
2. **Paginate with block ranges** for bulk indexing — avoid fetching the entire history in one call
3. **Parallelize enrichment queries** with `Promise.all()` — pool config, rewards, auction state are all independent reads
4. **Cache block numbers** to avoid re-indexing already-seen tokens
5. **Base block time is ~2s** — poll at this interval for near-real-time monitoring

## Contract Address

```typescript
import { ADDRESSES } from "liquid-sdk";

ADDRESSES.FACTORY  // 0x0000003482fe299E72d4908368044A8A173BE576
// All TokenCreated events are emitted from this address
```
