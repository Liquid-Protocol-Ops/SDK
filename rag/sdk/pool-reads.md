# SDK Guide: Pool Reads

How to query pool configuration, fee state, creation time, and token sort order.

## Overview

These read-only methods query on-chain pool state from the Uniswap V4 hook contracts. No wallet required.

```typescript
const sdk = new LiquidSDK({ publicClient }); // read-only
```

## SDK Methods

### `getPoolConfig(poolId)`

Returns the dynamic fee configuration for a pool. Most useful for pools using `HOOK_DYNAMIC_FEE_V2`.

```typescript
const config = await sdk.getPoolConfig(poolId);

config.baseFee                     // number -- minimum fee (BPS)
config.maxLpFee                    // number -- maximum LP fee
config.referenceTickFilterPeriod   // bigint -- seconds
config.resetPeriod                 // bigint -- seconds
config.resetTickFilter             // number -- tick units
config.feeControlNumerator         // bigint -- scaling constant
config.decayFilterBps              // number -- decay filter in BPS
```

### `getPoolFeeState(poolId)`

Returns the current fee state variables that change with each swap.

```typescript
const state = await sdk.getPoolFeeState(poolId);

state.referenceTick       // number -- current reference tick
state.resetTick           // number -- tick at last reset
state.resetTickTimestamp   // bigint -- unix timestamp of last reset
state.lastSwapTimestamp    // bigint -- unix timestamp of last swap
state.appliedVR           // number -- applied volatility ratio
state.prevVA              // number -- previous volatility accumulator
```

### `getPoolCreationTimestamp(poolId)`

Returns the unix timestamp when the pool was created.

```typescript
const timestamp = await sdk.getPoolCreationTimestamp(poolId);
const date = new Date(Number(timestamp) * 1000);
console.log("Created:", date.toISOString());
```

### `isLiquidToken0(poolId)`

Returns whether the liquid token is token0 or token1 in the Uniswap V4 pool.

```typescript
const isToken0 = await sdk.isLiquidToken0(poolId);
// In practice, WETH (0x4200...) is almost always token0 (lower address)
// So this typically returns false (the liquid token is token1)
```

This is important for determining swap direction:
- If liquid token is token0: `zeroForOne = true` to sell, `false` to buy
- If liquid token is token1 (typical): `zeroForOne = true` to buy, `false` to sell

## Pool Key Structure

Every Liquid pool has a standard key:

```typescript
const poolKey = {
  currency0: EXTERNAL.WETH,      // 0x4200...0006
  currency1: tokenAddress,        // deployed token
  fee: 8388608,                   // 0x800000 = dynamic fee flag
  tickSpacing: 200,               // Liquid default
  hooks: hookAddress,             // which hook contract
};

// Pool ID = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
```

You can retrieve the pool key from token rewards:

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
const poolKey = rewards.poolKey;
const poolId = tokenEvent.poolId; // from getTokenEvent()
```

## Complete Example

```typescript
import { LiquidSDK } from "liquid-sdk";

const sdk = new LiquidSDK({ publicClient }); // read-only

// Get pool ID from token
const tokenEvent = await sdk.getTokenEvent(tokenAddress);
const poolId = tokenEvent.poolId;

// Read pool state
const config = await sdk.getPoolConfig(poolId);
console.log("Base fee:", config.baseFee, "BPS");
console.log("Max LP fee:", config.maxLpFee, "BPS");

const state = await sdk.getPoolFeeState(poolId);
console.log("Reference tick:", state.referenceTick);
console.log("Last swap:", new Date(Number(state.lastSwapTimestamp) * 1000));

const created = await sdk.getPoolCreationTimestamp(poolId);
console.log("Pool created:", new Date(Number(created) * 1000));

const isToken0 = await sdk.isLiquidToken0(poolId);
console.log("Liquid is token0:", isToken0);
```

## See Also

- [../contracts/liquid-hooks.md](../contracts/liquid-hooks.md) -- Hook contract details
- [../concepts/fee-system.md](../concepts/fee-system.md) -- Fee system overview
