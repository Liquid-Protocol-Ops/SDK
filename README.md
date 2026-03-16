# Liquid Protocol SDK

TypeScript SDK for the Liquid Protocol token launcher on Base. Deploy tokens, manage pools, and claim fees using [viem](https://viem.sh).

## Installation

```bash
npm install liquid-sdk viem
```

> **Defaults**: Static 1% fee, 3-tranche liquidity (40%/50%/10% at $500K/$10M/$1B), Sniper Auction MEV (80%→40% over 32s), tick spacing 200, starting tick -230400 (~10 ETH market cap).

## Quick Start

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

const liquid = new LiquidSDK({ walletClient });
```

## Deploy a Token

```typescript
const result = await liquid.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "ipfs://QmYourImageHash",
  metadata: '{"description": "My token description"}',
});

console.log("Token deployed at:", result.tokenAddress);
console.log("Pool ID:", result.event.poolId);
console.log("Tx:", result.txHash);
```

### Deploy with Custom Market Cap Positions

```typescript
import { createDefaultPositions, createPositionsUSD } from "liquid-sdk";

// Use default 3-tranche split ($500K / $10M / $1B) at current ETH price
const positions = createDefaultPositions(20_000, 2070); // $20K start, $2070/ETH

const result = await liquid.deployToken({
  name: "My Token",
  symbol: "MTK",
  ...positions, // tickLower, tickUpper, positionBps, tickIfToken0IsLiquid
});

// Or define fully custom tranches
const custom = createPositionsUSD(50_000, 2070, [
  { upperMarketCapUSD: 1_000_000, supplyPct: 30 },
  { upperMarketCapUSD: 50_000_000, supplyPct: 50 },
  { upperMarketCapUSD: 500_000_000, supplyPct: 20 },
]);
```

### Deploy with Custom Fees

```typescript
import { ADDRESSES, encodeStaticFeePoolData, encodeDynamicFeePoolData } from "liquid-sdk";

// Static 2% fee
const result = await liquid.deployToken({
  name: "Custom Fee Token",
  symbol: "CFT",
  poolData: encodeStaticFeePoolData(200, 200), // 2% both directions
});

// Dynamic fee (1%-5% range)
const result2 = await liquid.deployToken({
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

## Read Token Info

```typescript
// Get ERC20 info + deployment details
const info = await liquid.getTokenInfo(tokenAddress);
console.log(info.name, info.symbol, info.decimals);
console.log("Hook:", info.deployment.hook);
console.log("Locker:", info.deployment.locker);

// Get deployment info only
const deployment = await liquid.getDeploymentInfo(tokenAddress);
```

## Pool Information

```typescript
// Get pool fee configuration (dynamic fee hook)
const config = await liquid.getPoolConfig(poolId);
console.log("Base fee:", config.baseFee);
console.log("Max LP fee:", config.maxLpFee);

// Get current fee state
const feeState = await liquid.getPoolFeeState(poolId);
console.log("Reference tick:", feeState.referenceTick);
console.log("Last swap:", feeState.lastSwapTimestamp);

// Check pool creation time
const created = await liquid.getPoolCreationTimestamp(poolId);

// Check token ordering
const isToken0 = await liquid.isLiquidToken0(poolId);
```

## Claim Fees

```typescript
// Check available fees
const available = await liquid.getAvailableFees(ownerAddress, tokenAddress);
const claimable = await liquid.getFeesToClaim(ownerAddress, tokenAddress);

console.log("Available:", available);
console.log("Claimable:", claimable);

// Claim fees
const txHash = await liquid.claimFees(ownerAddress, tokenAddress);
```

## Vault (Token Vesting)

```typescript
// Check vault allocation
const allocation = await liquid.getVaultAllocation(tokenAddress);
console.log("Total:", allocation.amountTotal);
console.log("Claimed:", allocation.amountClaimed);
console.log("Lockup ends:", new Date(Number(allocation.lockupEndTime) * 1000));

// Check claimable amount
const claimable = await liquid.getVaultClaimable(tokenAddress);

// Claim vested tokens
const txHash = await liquid.claimVault(tokenAddress);
```

## Factory Status

```typescript
// Check if factory is accepting new deployments
const deprecated = await liquid.isFactoryDeprecated();

// Check if a locker/hook pair is enabled
const enabled = await liquid.isLockerEnabled(lockerAddress, hookAddress);
```

## Constants & ABIs

All production addresses, fee parameters, and contract ABIs are exported:

```typescript
import {
  ADDRESSES,        // Liquid Protocol contract addresses
  EXTERNAL,         // External protocol addresses (PoolManager, WETH, etc.)
  FEE,              // Fee constants (denominator, protocol fee, max fees)
  TOKEN,            // Token constants (supply, decimals, max extensions)
  DEFAULTS,         // Default deploy config (hook, fees, MEV, ticks)
  POOL_POSITIONS,   // Position presets (Standard, Liquid)
  DEFAULT_CHAIN,    // base chain object
  DEFAULT_CHAIN_ID, // 8453

  // Tick math & positions
  getTickFromMarketCapETH,
  getTickFromMarketCapUSD,
  marketCapFromTickETH,
  marketCapFromTickUSD,
  createPositions,
  createPositionsUSD,
  createDefaultPositions,
  describePositions,

  // Encoding helpers
  encodeStaticFeePoolData,
  encodeDynamicFeePoolData,
  encodeSniperAuctionData,

  // ABIs for direct contract interaction
  LiquidFactoryAbi,
  LiquidFeeLockerAbi,
  LiquidHookDynamicFeeV2Abi,
  LiquidVaultAbi,
  ERC20Abi,
} from "liquid-sdk";
```

## API Reference

### `LiquidSDK`

#### Constructor

```typescript
new LiquidSDK({ walletClient, publicClient? })
```

- `walletClient` (optional) - viem `WalletClient` for write operations
- `publicClient` (optional) - viem `PublicClient` connected to Base (auto-created if omitted)

#### Methods

| Method | Description | Requires Wallet |
|--------|-------------|:-:|
| `deployToken(params)` | Deploy a new token + pool | Yes |
| `getDeploymentInfo(token)` | Get deployment info (hook, locker, extensions) | No |
| `getTokenInfo(token)` | Get ERC20 info + deployment details | No |
| `getPoolConfig(poolId, hook?)` | Get dynamic fee pool configuration | No |
| `getPoolFeeState(poolId, hook?)` | Get current fee state variables | No |
| `getPoolCreationTimestamp(poolId, hook?)` | Get pool creation timestamp | No |
| `isLiquidToken0(poolId, hook?)` | Check if Liquid token is currency0 | No |
| `getAvailableFees(owner, token)` | Get available fee balance | No |
| `getFeesToClaim(owner, token)` | Get claimable fee balance | No |
| `claimFees(owner, token)` | Claim accumulated fees | Yes |
| `getVaultAllocation(token)` | Get vault vesting allocation | No |
| `getVaultClaimable(token)` | Get vested amount available to claim | No |
| `claimVault(token)` | Claim vested tokens from vault | Yes |
| `isFactoryDeprecated()` | Check if factory is deprecated | No |
| `isLockerEnabled(locker, hook)` | Check if locker/hook pair is enabled | No |

## Production Addresses

All contracts are deployed on **Base** (chain ID 8453):

| Contract | Address |
|----------|---------|
| Factory | `0x04F1a284168743759BE6554f607a10CEBdB77760` |
| Hook Dynamic Fee V2 | `0x80E2F7dC8C2C880BbC4BDF80A5Fb0eB8B1DB68CC` |
| Hook Static Fee V2 | `0x9811f10Cd549c754Fa9E5785989c422A762c28cc` |
| Fee Locker | `0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF` |
| LP Locker Fee Conversion | `0x77247fCD1d5e34A3703AcA898A591Dc7422435f3` |
| Vault | `0xdFCCC93257c20519A9005A2281CFBdF84836d50E` |
| Sniper Auction V2 | `0x187e8627c02c58F31831953C1268e157d3BfCefd` |
| Sniper Util V2 | `0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f` |
| MEV Descending Fees | `0x8D6B080e48756A99F3893491D556B5d6907b6910` |
| Airdrop V2 | `0x1423974d48f525462f1c087cBFdCC20BDBc33CdD` |
| Pool Extension Allowlist | `0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa` |
| Univ4 ETH Dev Buy | `0x5934097864dC487D21A7B4e4EEe201A39ceF728D` |

## License

MIT
