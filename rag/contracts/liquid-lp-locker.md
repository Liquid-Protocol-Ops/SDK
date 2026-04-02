# LiquidLpLockerFeeConversion

The LP Locker permanently locks Uniswap V4 LP positions and manages fee collection, conversion, and distribution to reward recipients.

## Contract Details

- **Address:** `0x77247fCD1d5e34A3703AcA898A591Dc7422435f3`
- **SDK Constant:** `ADDRESSES.LP_LOCKER_FEE_CONVERSION`
- **Role:** Default LP locker for all Liquid Protocol tokens

## What It Does

1. **Locks LP permanently** -- Liquidity positions are transferred to this contract and can never be withdrawn. This is a core anti-rug guarantee.
2. **Collects fees** -- Periodically collects accrued LP fees from Uniswap V4 positions
3. **Converts fees** -- Converts collected fees to a preferred token per recipient (ETH by default)
4. **Distributes fees** -- Routes converted fees to the Fee Locker, split by reward BPS

## Fee Conversion (FeePreference)

Each reward recipient can specify how they want their fees:

| Value | Enum | Behavior |
|-------|------|----------|
| 0 | `FeePreference.Both` | No conversion -- receive fees in whichever token accrues |
| 1 | `FeePreference.Paired` | Convert all fees to paired token (WETH/ETH). **Default.** |
| 2 | `FeePreference.Liquid` | Convert all fees to the liquid token |

```typescript
import { encodeFeeConversionLockerData, FeePreference } from "liquid-sdk";

// Single recipient, all fees as ETH (default)
const lockerData = encodeFeeConversionLockerData([FeePreference.Paired]);

// Two recipients: first gets ETH, second gets the token
const lockerData = encodeFeeConversionLockerData([
  FeePreference.Paired,
  FeePreference.Liquid,
]);
```

## Reward Configuration

Set at deployment time. The BPS splits are immutable, but recipient addresses can be updated by their admins.

| Field | Description | Mutable? |
|-------|-------------|----------|
| `rewardRecipients` | Who receives fees | Yes (by admin) |
| `rewardAdmins` | Who can update each recipient | No |
| `rewardBps` | Split percentages (sum = 10000) | No |

### Reading Reward Config

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
// rewards.rewardRecipients: Address[]
// rewards.rewardBps: number[]         -- e.g., [7000, 3000] = 70%/30%
// rewards.rewardAdmins: Address[]
// rewards.poolKey: PoolKey
// rewards.positionId: bigint
// rewards.numPositions: bigint
```

### Updating Recipients

```typescript
// Only the admin at index N can update recipient N
const txHash = await sdk.updateRewardRecipient(
  tokenAddress,
  0n,              // reward index (bigint)
  newRecipientAddress,
);
```

## Collecting Rewards

Two methods for collecting fees from LP positions:

### `collectRewards(tokenAddress)` -- Full collect + unlock

Collects all accrued LP fees, converts them per fee preferences, and distributes to the Fee Locker. Also unlocks the LP position (related to MEV block delay).

```typescript
const txHash = await sdk.collectRewards(tokenAddress);
```

**Note:** Will revert with `ManagerLocked` during the MEV block delay period. Check `getPoolUnlockTime()` first.

### `collectRewardsWithoutUnlock(tokenAddress)` -- Collect only

Same as above but skips the unlock step. Useful during the MEV protection window or to avoid MEV during collection.

```typescript
const txHash = await sdk.collectRewardsWithoutUnlock(tokenAddress);
```

## Fee Distribution Flow

```
collectRewards(tokenAddress) called
  |
  v
LP Locker reads positions from Uniswap V4 PoolManager
  |
  v
Collects accrued fees (token0 + token1)
  |
  v
For each reward recipient:
  |-- Check FeePreference
  |-- If Paired: swap token fees -> WETH via pool
  |-- If Liquid: swap WETH fees -> token via pool
  |-- If Both: no conversion
  |
  v
Calculate recipient share: totalFees * recipientBps / 10000
  |
  v
Call FeeLocker.storeFees(recipient, token, amount)
  |
  v
Recipient can call sdk.claimFees() to withdraw
```

## Key Invariants

- LP is **permanently locked** -- there is no withdraw or unlock path for the liquidity itself
- Reward BPS splits are **immutable** -- set at deployment, cannot be changed
- Only reward admins can update recipient addresses
- Fee conversion uses the same Uniswap V4 pool for swaps

## See Also

- [liquid-fee-locker.md](liquid-fee-locker.md) -- Where converted fees are stored
- [../sdk/reward-management.md](../sdk/reward-management.md) -- SDK reward guide
- [../sdk/fee-management.md](../sdk/fee-management.md) -- SDK fee claiming guide
- [../concepts/fee-system.md](../concepts/fee-system.md) -- Full fee system overview
