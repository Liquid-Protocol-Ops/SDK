# SDK Guide: Reward Management

How to manage LP rewards: check reward configuration, collect fees from LP positions, and update reward recipients.

## Overview

LP rewards are distributed to reward recipients configured at deployment. The LP Locker holds the Uniswap V4 LP positions permanently and distributes collected fees according to BPS splits.

## Reward Flow

```
LP positions accrue fees from trading
  |
  v
collectRewards(tokenAddress) called
  |-- Collects fees from all positions
  |-- Converts to preferred token (ETH by default)
  |-- Splits by reward BPS
  |-- Deposits into Fee Locker
  |
  v
Fee recipients call claimFees() to withdraw
```

## SDK Methods

### `getTokenRewards(tokenAddress)`

Returns the complete reward configuration for a token.

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);

console.log("Recipients:", rewards.rewardRecipients);   // Address[]
console.log("BPS:", rewards.rewardBps);                 // number[] (sum = 10000)
console.log("Admins:", rewards.rewardAdmins);           // Address[]
console.log("Pool key:", rewards.poolKey);              // PoolKey
console.log("Position ID:", rewards.positionId);        // bigint
console.log("Num positions:", rewards.numPositions);    // bigint
```

### `collectRewards(tokenAddress)`

Collects all accrued LP fees from Uniswap V4 positions and distributes to reward recipients via the Fee Locker. Also unlocks the LP position.

```typescript
const txHash = await sdk.collectRewards(tokenAddress);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

**Important:** Reverts with `ManagerLocked` during the MEV block delay period. Check `getPoolUnlockTime()` first.

### `collectRewardsWithoutUnlock(tokenAddress)`

Same as `collectRewards` but skips the unlock step. Use this to avoid MEV during fee collection or when the pool is still in the MEV protection window.

```typescript
const txHash = await sdk.collectRewardsWithoutUnlock(tokenAddress);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

### `updateRewardRecipient(tokenAddress, rewardIndex, newRecipient)`

Changes the reward recipient at a specific index. Only callable by the reward admin at that index.

```typescript
const txHash = await sdk.updateRewardRecipient(
  tokenAddress,
  0n,                // reward index (bigint)
  newRecipientAddress,
);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

## Complete Example

```typescript
import { LiquidSDK } from "liquid-sdk";

const sdk = new LiquidSDK({ publicClient, walletClient });

// 1. Check reward config
const rewards = await sdk.getTokenRewards(tokenAddress);
console.log("Recipients:", rewards.rewardRecipients);
console.log("Splits:", rewards.rewardBps.map(b => `${b/100}%`));

// 2. Check if pool is unlocked
const unlockTime = await sdk.getPoolUnlockTime(poolId);
const now = BigInt(Math.floor(Date.now() / 1000));

if (now < unlockTime) {
  console.log("Pool locked until:", new Date(Number(unlockTime) * 1000));
  // Use without unlock
  const txHash = await sdk.collectRewardsWithoutUnlock(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
} else {
  // Full collect + unlock
  const txHash = await sdk.collectRewards(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

// 3. Now claim fees (see fee-management.md)
const claimable = await sdk.getFeesToClaim(account.address, tokenAddress);
if (claimable > 0n) {
  await sdk.claimFees(account.address, tokenAddress);
}
```

## Key Rules

- **BPS splits are immutable** -- Set at deployment, cannot be changed
- **Only recipient addresses can change** -- Via `updateRewardRecipient`
- **Only the admin at index N can update recipient N** -- Each admin controls only their index
- **Admin addresses are immutable** -- Set at deployment, cannot be changed
- **`collectRewards` is permissionless** -- Anyone can trigger fee collection
- **Fees are converted to ETH by default** -- Using `FeePreference.Paired`

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `ManagerLocked` | Pool in MEV lock period | Use `collectRewardsWithoutUnlock` or wait |
| `Unauthorized` | Not the admin for that index | Use correct wallet |

## See Also

- [fee-management.md](fee-management.md) -- Claiming fees after collection
- [../contracts/liquid-lp-locker.md](../contracts/liquid-lp-locker.md) -- LP Locker contract
- [../concepts/fee-system.md](../concepts/fee-system.md) -- Complete fee system
