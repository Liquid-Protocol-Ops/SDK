# Liquid Hook System

The hook contracts are Uniswap V4 BaseHook implementations that control fee logic, MEV module integration, and pool lifecycle for Liquid Protocol pools.

## Architecture

```
LiquidHookV2 (abstract base)
  |-- LiquidHookStaticFeeV2   (fixed fees, default)
  |-- LiquidHookDynamicFeeV2  (volatility-responsive fees)
```

## LiquidHookV2 (Base Contract)

Abstract contract that all Liquid hooks inherit from.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_LP_FEE` | `100_000` | Max LP fee: 10% (100,000 / 1,000,000) |
| `MAX_MEV_LP_FEE` | `800_000` | Max MEV fee: 80% |
| `PROTOCOL_FEE_NUMERATOR` | `200_000` | 20% of LP fees go to protocol |
| `FEE_DENOMINATOR` | `1_000_000` | 100% in Uniswap V4 fee units |
| `MAX_MEV_MODULE_DELAY` | `2 minutes` | Max duration for MEV module effects |

### Per-Pool State

| Mapping | Type | Description |
|---------|------|-------------|
| `liquidIsToken0` | `PoolId => bool` | Whether the liquid token is token0 in the pair |
| `locker` | `PoolId => address` | LP locker for this pool |
| `mevModule` | `PoolId => address` | MEV protection module |
| `mevModuleEnabled` | `PoolId => bool` | Whether MEV module is active |
| `poolCreationTimestamp` | `PoolId => uint256` | Block timestamp when pool was created |
| `poolExtension` | `PoolId => address` | Optional pool extension |

### Hook Callbacks

The hook implements Uniswap V4 lifecycle callbacks:

1. **`afterInitialize`** -- Called when pool is created. Records pool metadata, sets up MEV module
2. **`beforeSwap`** -- Called before every swap. Applies MEV fee if active, calculates LP fee
3. **`afterSwap`** -- Called after every swap. Collects protocol fee portion

### Fee Calculation Flow (per swap)

```
Swap initiated
  |
  v
beforeSwap():
  1. Check if MEV module is active
  2. If yes: apply MEV fee (up to 80%)
  3. Calculate LP fee (static or dynamic)
  4. Apply protocol fee = LP fee * 200,000 / 1,000,000 (20%)
  |
  v
Uniswap V4 executes swap with calculated fee
  |
  v
afterSwap():
  1. Collect protocol fee portion
  2. Route to factory for team fee recipient
```

## LiquidHookStaticFeeV2 (Default)

Fixed fee hook. The fee is set at pool initialization and never changes.

- **Address:** `0x9811f10Cd549c754Fa9E5785989c422A762c28cc`
- **SDK Constant:** `ADDRESSES.HOOK_STATIC_FEE_V2`
- **Default fees:** 1% on buys (paired fee), 1% on sells (liquid fee)

### Pool Data Encoding

```typescript
import { encodeStaticFeePoolData } from "liquid-sdk";

// 1% both directions (default)
const poolData = encodeStaticFeePoolData(100, 100);
// Args: (liquidFeeBps, pairedFeeBps)
// liquidFeeBps: fee when selling token (token -> ETH)
// pairedFeeBps: fee when buying token (ETH -> token)

// 0% sell, 2% buy
const customData = encodeStaticFeePoolData(0, 200);
```

The encoding uses two layers:
1. **Inner:** `abi.encode(uint24 liquidFee, uint24 pairedFee)` in uniBps (BPS * 100)
2. **Outer:** `PoolInitializationData { extension, extensionData, feeData }`

## LiquidHookDynamicFeeV2

Volatility-responsive fee hook. Fee adjusts based on tick movement (price volatility).

- **Address:** `0x80E2F7dC8C2C880BbC4BDF80A5Fb0eB8B1DB68CC`
- **SDK Constant:** `ADDRESSES.HOOK_DYNAMIC_FEE_V2`

### Configuration Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseFeeBps` | `number` | Minimum fee in BPS (e.g., 100 = 1%) |
| `maxFeeBps` | `number` | Maximum fee in BPS (e.g., 500 = 5%) |
| `referenceTickFilterPeriod` | `number` | Seconds for reference tick filtering |
| `resetPeriod` | `number` | Seconds before fee state resets |
| `resetTickFilter` | `number` | Tick movement threshold for reset |
| `feeControlNumerator` | `bigint` | Scaling constant for fee curve |
| `decayFilterBps` | `number` | Decay filter in BPS |

### Pool Data Encoding

```typescript
import { encodeDynamicFeePoolData, ADDRESSES } from "liquid-sdk";

const poolData = encodeDynamicFeePoolData({
  baseFeeBps: 100,              // 1% base fee
  maxFeeBps: 500,               // 5% max fee
  referenceTickFilterPeriod: 30, // 30s filter period
  resetPeriod: 120,              // 2 min reset
  resetTickFilter: 200,          // 200 tick threshold
  feeControlNumerator: 500000000n, // scaling constant
  decayFilterBps: 7500,          // 75% decay filter
});

const result = await sdk.deployToken({
  hook: ADDRESSES.HOOK_DYNAMIC_FEE_V2,
  poolData,
  // ...other params
});
```

### Reading Dynamic Fee State

```typescript
// Get pool configuration (immutable after deploy)
const config = await sdk.getPoolConfig(poolId);
// config.baseFee, config.maxLpFee, config.referenceTickFilterPeriod, etc.

// Get current fee state (changes with each swap)
const state = await sdk.getPoolFeeState(poolId);
// state.referenceTick, state.resetTick, state.appliedVR, state.prevVA
```

## Pool Key Structure

Every Liquid pool has a standard pool key:

```typescript
const poolKey = {
  currency0: EXTERNAL.WETH,          // 0x4200...0006 (always lower)
  currency1: tokenAddress,            // deployed token (always higher)
  fee: 8388608,                       // 0x800000 = dynamic fee flag
  tickSpacing: 200,                   // Liquid default
  hooks: hookAddress,                 // which hook contract
};
```

The `fee: 0x800000` is NOT an actual fee value -- it signals to Uniswap V4 that the hook controls the fee dynamically via `beforeSwap`.

Pool ID is: `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`

## See Also

- [../concepts/fee-system.md](../concepts/fee-system.md) -- Complete fee system explanation
- [../concepts/mev-protection.md](../concepts/mev-protection.md) -- MEV module details
- [../sdk/deploy-token.md](../sdk/deploy-token.md) -- Deploying with custom hooks
