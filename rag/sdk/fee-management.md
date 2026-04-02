# SDK Guide: Fee Management

How to check and claim LP fees using the Liquid SDK.

## Overview

When users trade tokens on Uniswap V4, LP fees accrue in the pool. The LP Locker collects these fees, converts them to ETH (by default), and deposits them into the Fee Locker for each reward recipient. Recipients then call `claimFees()` to withdraw.

## Fee Flow

```
Trading activity on Uniswap V4
  |-- Hook applies LP fee (e.g., 1%)
  |-- 20% of LP fee -> Protocol (team)
  |-- 80% of LP fee -> LP position
  |
collectRewards(tokenAddress) -- anyone can call
  |-- Collects fees from LP positions
  |-- Converts to ETH (FeePreference.Paired)
  |-- Splits by reward BPS
  |-- Deposits into Fee Locker
  |
claimFees(owner, token) -- anyone can call
  |-- Transfers accumulated WETH to fee owner
```

## SDK Methods

### `getAvailableFees(feeOwner, tokenAddress)`

Returns total unlocked fees for a fee owner and token pair.

```typescript
const available = await sdk.getAvailableFees(ownerAddress, tokenAddress);
// available: bigint -- fee balance in the Fee Locker (usually WETH)
```

### `getFeesToClaim(feeOwner, tokenAddress)`

Returns the currently claimable fee balance. In the current implementation, this is the same as `getAvailableFees`.

```typescript
const claimable = await sdk.getFeesToClaim(ownerAddress, tokenAddress);
// claimable: bigint
```

### `claimFees(feeOwner, tokenAddress)`

Claims all accumulated fees for a fee owner. Requires wallet. The fees are transferred to the `feeOwner` address.

```typescript
if (claimable > 0n) {
  const txHash = await sdk.claimFees(ownerAddress, tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

**Note:** `claimFees` is permissionless -- anyone can trigger a claim on behalf of any fee owner. The funds always go to the `feeOwner` address.

## Complete Example

```typescript
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount("0x...");
const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient, walletClient });

// 1. Check available fees
const available = await sdk.getAvailableFees(account.address, tokenAddress);
console.log("Available fees:", formatEther(available), "ETH");

// 2. Check claimable
const claimable = await sdk.getFeesToClaim(account.address, tokenAddress);
console.log("Claimable fees:", formatEther(claimable), "ETH");

// 3. Claim
if (claimable > 0n) {
  console.log("Claiming fees...");
  const txHash = await sdk.claimFees(account.address, tokenAddress);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Claimed in tx:", receipt.transactionHash);
} else {
  console.log("No fees to claim yet.");
}
```

## Important Notes

- Fees only accrue from trading activity. No trading = no fees.
- Fees are denominated in the paired asset (WETH) when using the default `FeePreference.Paired`.
- The `collectRewards()` step must happen before fees appear in the Fee Locker. See [reward-management.md](reward-management.md).
- `claimFees` reverts with `NoFeesToClaim` if balance is zero.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `NoFeesToClaim` | No fees accrued | Wait for trading, or call `collectRewards()` first |

## Contract Addresses

| Contract | Address |
|----------|---------|
| Fee Locker | `0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF` |
| LP Locker Fee Conversion | `0x77247fCD1d5e34A3703AcA898A591Dc7422435f3` |

## See Also

- [reward-management.md](reward-management.md) -- Collecting LP rewards (prerequisite for fee claiming)
- [../contracts/liquid-fee-locker.md](../contracts/liquid-fee-locker.md) -- Fee Locker contract
- [../concepts/fee-system.md](../concepts/fee-system.md) -- Complete fee system overview
