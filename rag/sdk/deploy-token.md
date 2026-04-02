# SDK Guide: Deploy Token

Complete guide to `sdk.deployToken()` -- the primary entry point for launching tokens on Liquid Protocol.

## Prerequisites

```bash
npm install liquid-sdk viem
```

- A wallet with ETH on Base (for gas + optional dev buy)
- An RPC endpoint for Base mainnet (chain ID 8453)

## Setup

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient, walletClient });
```

## Minimal Deploy

Only `name` and `symbol` are required. Everything else gets sensible defaults:

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
});

console.log("Token:", result.tokenAddress);
console.log("Pool ID:", result.event.poolId);
console.log("Tx:", result.txHash);
```

### What the Defaults Provide

| Setting | Default Value |
|---------|--------------|
| Fee hook | Static 1% buy + 1% sell |
| Starting market cap | ~10 ETH (~$20K) |
| Positions | 5-position Liquid layout |
| MEV protection | Sniper Auction (80% to 40% over 20s) |
| Reward split | 100% to deployer |
| Fee conversion | All fees to ETH |
| LP | Permanently locked |

## Deploy with Image

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "ipfs://QmYourImageCID",
});
```

Recommended: 256x256 or 512x512 PNG, pinned to IPFS.

## Deploy with Dev Buy

Buy tokens with ETH in the same transaction. Uses normal 1% LP fees (not auction fees).

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"),
    recipient: account.address,
  },
});
```

## Deploy with Custom Fees

### Static Fees

```typescript
import { encodeStaticFeePoolData } from "liquid-sdk";

// 2% on both directions
const result = await sdk.deployToken({
  name: "High Fee Token",
  symbol: "HFT",
  poolData: encodeStaticFeePoolData(200, 200),
  // Args: (liquidFeeBps, pairedFeeBps)
  // liquidFeeBps = sell fee (token -> ETH)
  // pairedFeeBps = buy fee (ETH -> token)
});

// 0% sell, 3% buy
const result2 = await sdk.deployToken({
  name: "Buy Fee Only",
  symbol: "BFO",
  poolData: encodeStaticFeePoolData(0, 300),
});
```

### Dynamic Fees

```typescript
import { encodeDynamicFeePoolData, ADDRESSES } from "liquid-sdk";

const result = await sdk.deployToken({
  name: "Dynamic Token",
  symbol: "DYN",
  hook: ADDRESSES.HOOK_DYNAMIC_FEE_V2,
  poolData: encodeDynamicFeePoolData({
    baseFeeBps: 100,
    maxFeeBps: 500,
    referenceTickFilterPeriod: 30,
    resetPeriod: 120,
    resetTickFilter: 200,
    feeControlNumerator: 500000000n,
    decayFilterBps: 7500,
  }),
});
```

## Deploy with Custom Positions

### Using Default 3-Tranche Split

```typescript
import { createDefaultPositions } from "liquid-sdk";

const positions = createDefaultPositions(20_000, 2070);
// Creates 3 tranches: 40% to $500K, 50% to $10M, 10% to $1B

const result = await sdk.deployToken({
  name: "Positioned Token",
  symbol: "POS",
  ...positions,  // tickLower, tickUpper, positionBps, tickIfToken0IsLiquid
});
```

### Using Custom USD Tranches

```typescript
import { createPositionsUSD } from "liquid-sdk";

const positions = createPositionsUSD(50_000, 2500, [
  { upperMarketCapUSD: 1_000_000, supplyPct: 30 },
  { upperMarketCapUSD: 50_000_000, supplyPct: 50 },
  { upperMarketCapUSD: 500_000_000, supplyPct: 20 },
]);

const result = await sdk.deployToken({
  name: "Custom Positions",
  symbol: "CPS",
  ...positions,
  tickIfToken0IsLiquid: positions.tickLower[0],
});
```

## Deploy with Custom Reward Splits

```typescript
const result = await sdk.deployToken({
  name: "Split Token",
  symbol: "SPLIT",
  rewardAdmins: [walletA, walletB],
  rewardRecipients: [walletA, walletB],
  rewardBps: [7000, 3000],  // 70% / 30%
});
```

**Rules:**
- Arrays must be same length
- rewardBps must sum to exactly 10000
- BPS splits are IMMUTABLE after deployment
- Admin at index N can update recipient at index N

## Deploy with Metadata and Context

```typescript
import { buildContext, buildMetadata } from "liquid-sdk";

const result = await sdk.deployToken({
  name: "Social Token",
  symbol: "SOC",
  image: "ipfs://QmImageHash",
  metadata: buildMetadata({
    description: "A community token for builders",
    socialMediaUrls: [
      { platform: "Twitter", url: "https://x.com/myproject" },
      { platform: "Website", url: "https://myproject.xyz" },
    ],
  }),
  context: buildContext({
    interface: "My Agent",
    platform: "Farcaster",
    messageId: "0x123abc",
  }),
});
```

## Deploy with Custom MEV Protection

```typescript
import { encodeSniperAuctionData, ADDRESSES } from "liquid-sdk";

// Custom sniper auction: 60% to 30% over 30s
const result = await sdk.deployToken({
  name: "Custom MEV Token",
  symbol: "CMEV",
  mevModule: ADDRESSES.SNIPER_AUCTION_V2,
  mevModuleData: encodeSniperAuctionData({
    startingFee: 600_000,
    endingFee: 300_000,
    secondsToDecay: 30,
  }),
});

// Use descending fees instead
const result2 = await sdk.deployToken({
  name: "Descending Fee Token",
  symbol: "DFT",
  mevModule: ADDRESSES.MEV_DESCENDING_FEES,
  // mevModuleData encoding depends on the module
});
```

## Return Value

```typescript
interface DeployTokenResult {
  tokenAddress: Address;      // Deployed ERC-20 contract
  txHash: Hash;               // Transaction hash
  event: TokenCreatedEvent;   // Full on-chain event with poolId, hook, etc.
}
```

The `event` contains: `poolId`, `poolHook`, `locker`, `mevModule`, `extensions`, `tokenAdmin`, `startingTick`, `pairedToken`, and more.

## Validation Rules

The SDK validates before sending the transaction:

- 1-7 positions allowed
- `positionBps` must sum to 10000
- All ticks divisible by `tickSpacing`
- All `tickLower` values >= `tickIfToken0IsLiquid`
- At least one position must start at `tickIfToken0IsLiquid`
- 1+ reward recipients, `rewardBps` sum to 10000
- Max 10 extensions, total extensionBps <= 9000

## Post-Deploy

```typescript
// Check deployment
const info = await sdk.getDeploymentInfo(result.tokenAddress);
const tokenInfo = await sdk.getTokenInfo(result.tokenAddress);

// Update metadata (admin only)
await sdk.updateImage(result.tokenAddress, "https://new-image.png");
await sdk.updateMetadata(result.tokenAddress, '{"description":"Updated"}');

// Check MEV status
const unlockTime = await sdk.getPoolUnlockTime(result.event.poolId);
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `TickRangeLowerThanStartingTick` | tickLower < tickIfToken0IsLiquid | Adjust position ticks |
| Insufficient funds | Not enough ETH for gas + devBuy | Fund wallet |
| `rewardBps must sum to 10000` | BPS array wrong | Fix values |
| `Deprecated()` | Factory is paused | Contact team |

## See Also

- [../schemas/deploy-params.json](../schemas/deploy-params.json) -- Full parameter schema
- [../contracts/liquid-factory.md](../contracts/liquid-factory.md) -- Factory contract details
- [../concepts/token-lifecycle.md](../concepts/token-lifecycle.md) -- What happens on-chain
- [../concepts/lp-positions.md](../concepts/lp-positions.md) -- Position math
