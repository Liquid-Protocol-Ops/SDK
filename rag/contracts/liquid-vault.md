# LiquidVault

The Vault extension enables token lockup with linear vesting. Tokens are locked for a configurable lockup period, then vest linearly over a vesting period.

## Contract Details

- **Address:** `0xdFCCC93257c20519A9005A2281CFBdF84836d50E`
- **SDK Constant:** `ADDRESSES.VAULT`
- **Type:** Extension (receives tokens via `receiveTokens`)

## How It Works

1. **At deployment:** The factory transfers a portion of token supply (per `extensionBps`) to the Vault
2. **Lockup period:** Tokens are fully locked until `lockupEndTime`. No claims possible.
3. **Vesting period:** After lockup ends, tokens vest linearly from `lockupEndTime` to `vestingEndTime`
4. **Claiming:** The vault admin can claim vested tokens at any time after lockup ends

### Vesting Formula

```
if (now < lockupEndTime):
  claimable = 0

if (now >= vestingEndTime):
  claimable = amountTotal - amountClaimed

if (lockupEndTime <= now < vestingEndTime):
  elapsed = now - lockupEndTime
  vestingDuration = vestingEndTime - lockupEndTime
  totalVested = amountTotal * elapsed / vestingDuration
  claimable = totalVested - amountClaimed
```

## Vault Allocation Structure

```typescript
interface VaultAllocation {
  token: Address;          // The token being vested
  amountTotal: bigint;     // Total tokens locked in vault
  amountClaimed: bigint;   // Tokens already claimed
  lockupEndTime: bigint;   // Unix timestamp: lockup ends
  vestingEndTime: bigint;  // Unix timestamp: vesting completes
  admin: Address;          // Who can claim
}
```

## SDK Methods

### Check vault state

```typescript
const vault = await sdk.getVaultAllocation(tokenAddress);
console.log("Total locked:", vault.amountTotal);
console.log("Already claimed:", vault.amountClaimed);
console.log("Lockup ends:", new Date(Number(vault.lockupEndTime) * 1000));
console.log("Vesting ends:", new Date(Number(vault.vestingEndTime) * 1000));
console.log("Admin:", vault.admin);
```

### Check claimable amount

```typescript
const claimable = await sdk.getVaultClaimable(tokenAddress);
// claimable: bigint -- tokens available to claim right now
```

### Claim vested tokens

```typescript
if (claimable > 0n) {
  const txHash = await sdk.claimVault(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

## Configuration at Deployment

To include a vault in your token deployment, add it as an extension:

```typescript
// The vault extension data must encode:
// - lockupDuration (uint256): seconds of lockup after deployment
// - vestingDuration (uint256): seconds of linear vesting after lockup
// - admin (address): who can claim
```

The vault receives `extensionBps / 10000 * TOKEN_SUPPLY` tokens at deployment.

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `LockupNotEnded` | Attempting to claim before `lockupEndTime` | Wait for lockup to end |
| `Unauthorized` | Caller is not the vault admin | Use the admin wallet |
| Zero claimable | All vested tokens already claimed | Wait for more to vest |

## Example: Full Vault Lifecycle

```typescript
import { LiquidSDK } from "liquid-sdk";
import { formatUnits } from "viem";

const sdk = new LiquidSDK({ publicClient, walletClient });

// 1. Check vault state
const vault = await sdk.getVaultAllocation(tokenAddress);
const now = BigInt(Math.floor(Date.now() / 1000));

console.log("Total:", formatUnits(vault.amountTotal, 18), "tokens");
console.log("Claimed:", formatUnits(vault.amountClaimed, 18), "tokens");

// 2. Check if lockup has ended
if (now < vault.lockupEndTime) {
  const remaining = Number(vault.lockupEndTime - now);
  console.log(`Locked for ${remaining} more seconds`);
  return;
}

// 3. Check claimable
const claimable = await sdk.getVaultClaimable(tokenAddress);
console.log("Claimable:", formatUnits(claimable, 18), "tokens");

// 4. Claim
if (claimable > 0n) {
  const txHash = await sdk.claimVault(tokenAddress);
  console.log("Claimed in tx:", txHash);
}
```

## See Also

- [../sdk/vault-lifecycle.md](../sdk/vault-lifecycle.md) -- SDK vault guide
- [../concepts/extension-system.md](../concepts/extension-system.md) -- Extension system overview
- [../concepts/token-lifecycle.md](../concepts/token-lifecycle.md) -- Full token lifecycle
