# Concept: Fee System

Complete explanation of how fees work in Liquid Protocol: LP fees (static/dynamic), protocol fees, fee conversion, and reward distribution.

## Fee Layers

Every swap through a Liquid Protocol pool passes through multiple fee layers:

| Layer | Rate | When Active | Goes To |
|-------|------|-------------|---------|
| MEV Fee | 80% to 40% | First ~20s after launch | Protocol + LP |
| LP Fee | 1% (default) | Always | LP position (80%) + Protocol (20%) |
| Protocol Fee | 20% of LP fee | Always | Team fee recipient |

## Fee Constants

```typescript
import { FEE } from "liquid-sdk";

FEE.DENOMINATOR            // 1,000,000 -- Uniswap V4 fee unit (100%)
FEE.PROTOCOL_FEE_NUMERATOR // 200,000   -- 20% of LP fees to protocol
FEE.MAX_LP_FEE             // 100,000   -- 10% max LP fee
FEE.MAX_MEV_FEE            // 800,000   -- 80% max MEV fee
FEE.BPS                    // 10,000    -- basis points denominator
```

### Fee Unit Conversions

| BPS | UniBps | Percentage |
|-----|--------|------------|
| 1 | 100 | 0.01% |
| 100 | 10,000 | 1% |
| 500 | 50,000 | 5% |
| 1000 | 100,000 | 10% |
| 8000 | 800,000 | 80% |

The SDK uses BPS for input (e.g., `100` = 1%) and converts to uniBps internally by multiplying by 100.

## Static Fees (Default)

The default hook (`HOOK_STATIC_FEE_V2`) charges a fixed fee on every swap:

- **Liquid fee (sell):** Fee when swapping token to ETH. Default: 100 BPS (1%)
- **Paired fee (buy):** Fee when swapping ETH to token. Default: 100 BPS (1%)

```typescript
import { encodeStaticFeePoolData } from "liquid-sdk";

// Default: 1% both directions
const poolData = encodeStaticFeePoolData(100, 100);

// Custom: 0% sell, 2% buy
const poolData = encodeStaticFeePoolData(0, 200);

// Custom: 0.5% sell, 3% buy
const poolData = encodeStaticFeePoolData(50, 300);
```

## Dynamic Fees

The dynamic fee hook (`HOOK_DYNAMIC_FEE_V2`) adjusts the fee based on price volatility:

- **Base fee:** Minimum fee during calm markets
- **Max fee:** Maximum fee during high volatility
- **Volatility tracking:** Uses tick movement to detect volatility
- **Decay:** Fee decays back toward base when volatility subsides

```typescript
import { encodeDynamicFeePoolData, ADDRESSES } from "liquid-sdk";

const poolData = encodeDynamicFeePoolData({
  baseFeeBps: 100,               // 1% base
  maxFeeBps: 500,                // 5% max
  referenceTickFilterPeriod: 30,  // 30s smoothing
  resetPeriod: 120,               // 2 min reset
  resetTickFilter: 200,           // 200 tick threshold
  feeControlNumerator: 500000000n, // scaling
  decayFilterBps: 7500,           // 75% decay
});
```

## Protocol Fee

A fixed 20% of all LP fees goes to the Liquid Protocol team:

```
LP Fee = 1% of swap
Protocol share = 1% * 20% = 0.2% of swap
LP share = 1% * 80% = 0.8% of swap
```

The protocol fee is collected by the hook's `afterSwap` callback and routed to the factory's `teamFeeRecipient`.

## Fee Conversion

The LP Locker Fee Conversion contract can convert collected fees to a preferred token before distributing:

| FeePreference | Value | Behavior |
|---------------|-------|----------|
| `Both` | 0 | No conversion -- receive fees in both WETH and token |
| `Paired` | 1 | Convert all fees to WETH/ETH. **Default.** |
| `Liquid` | 2 | Convert all fees to the liquid token |

```typescript
import { encodeFeeConversionLockerData, FeePreference } from "liquid-sdk";

// Default: all fees as ETH
const lockerData = encodeFeeConversionLockerData([FeePreference.Paired]);

// Two recipients: one gets ETH, one gets token
const lockerData = encodeFeeConversionLockerData([
  FeePreference.Paired,
  FeePreference.Liquid,
]);
```

## Reward Distribution

Fees are split among reward recipients according to immutable BPS allocations:

```typescript
// Set at deployment
const result = await sdk.deployToken({
  rewardAdmins: [walletA, walletB, treasury],
  rewardRecipients: [walletA, walletB, treasury],
  rewardBps: [5000, 3000, 2000],  // 50% / 30% / 20%
});
```

**Rules:**
- BPS splits are IMMUTABLE after deployment
- Recipient addresses can be updated by their admin
- Admin addresses are IMMUTABLE
- BPS must sum to exactly 10000

## Complete Fee Flow

```
User swaps ETH -> Token (buy) via Universal Router
  |
  v
Hook.beforeSwap():
  |-- If MEV active: apply 80-40% MEV fee
  |-- Calculate LP fee: 1% (10,000 uniBps)
  |-- Calculate protocol fee: 1% * 20% = 0.2%
  |
  v
Uniswap V4 executes swap, deducting fees
  |
  v
Hook.afterSwap():
  |-- Protocol fee (0.2%) -> Factory team fee recipient
  |-- LP fee (0.8%) -> Accrues in LP position
  |
  v
collectRewards(tokenAddress) called (by anyone)
  |
  v
LP Locker:
  1. Reads LP positions from PoolManager
  2. Collects accrued fees (WETH + token)
  3. Converts to ETH (FeePreference.Paired)
  4. For each recipient:
     fee = totalFees * recipientBps / 10000
     FeeLocker.storeFees(recipient, WETH, fee)
  |
  v
claimFees(recipient, WETH) called
  |
  v
FeeLocker transfers WETH to recipient
```

## Fee Example (Numbers)

For a $1000 swap at default settings:

| Component | Amount |
|-----------|--------|
| Swap amount | $1000 |
| LP fee (1%) | $10 |
| Protocol fee (20% of LP) | $2 |
| Net to LP position | $8 |
| MEV fee (if active, 80%) | $800 additional |

After collection with single recipient:
- Recipient gets $8 in WETH (per swap)
- Accumulates over many swaps before collection

## See Also

- [mev-protection.md](mev-protection.md) -- MEV fee details
- [../contracts/liquid-hooks.md](../contracts/liquid-hooks.md) -- Hook contracts
- [../contracts/liquid-fee-locker.md](../contracts/liquid-fee-locker.md) -- Fee Locker
- [../contracts/liquid-lp-locker.md](../contracts/liquid-lp-locker.md) -- LP Locker
- [../sdk/fee-management.md](../sdk/fee-management.md) -- SDK fee claiming
- [../sdk/reward-management.md](../sdk/reward-management.md) -- SDK reward management
