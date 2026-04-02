# SDK Guide: Vault Lifecycle

How to check vault lockup/vesting status and claim vested tokens.

## Overview

The Vault extension locks tokens with a lockup period followed by linear vesting. After the lockup period ends, tokens vest linearly until the vesting end time.

## Timeline

```
Deployment          lockupEndTime         vestingEndTime
    |                    |                      |
    |--- Lockup ---------|--- Linear Vesting ---|
    |  (no claims)       |  (claim vested amt)  | (claim all remaining)
```

## SDK Methods

### `getVaultAllocation(tokenAddress)`

Returns the vault state for a token.

```typescript
const vault = await sdk.getVaultAllocation(tokenAddress);

vault.token           // Address -- the token
vault.amountTotal     // bigint -- total tokens locked
vault.amountClaimed   // bigint -- already claimed
vault.lockupEndTime   // bigint -- unix timestamp when lockup ends
vault.vestingEndTime  // bigint -- unix timestamp when fully vested
vault.admin           // Address -- who can claim
```

### `getVaultClaimable(tokenAddress)`

Returns the number of tokens available to claim right now.

```typescript
const claimable = await sdk.getVaultClaimable(tokenAddress);
// claimable: bigint -- tokens available now (18 decimals)
```

### `claimVault(tokenAddress)`

Claims all currently vested tokens. Requires wallet. Only callable by the vault admin.

```typescript
if (claimable > 0n) {
  const txHash = await sdk.claimVault(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

## Complete Example

```typescript
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount("0x...");
const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient, walletClient });

async function checkAndClaimVault(tokenAddress: `0x${string}`) {
  // 1. Get vault state
  const vault = await sdk.getVaultAllocation(tokenAddress);
  const now = BigInt(Math.floor(Date.now() / 1000));

  console.log("Total locked:", formatUnits(vault.amountTotal, 18), "tokens");
  console.log("Already claimed:", formatUnits(vault.amountClaimed, 18), "tokens");
  console.log("Admin:", vault.admin);
  console.log("Lockup ends:", new Date(Number(vault.lockupEndTime) * 1000).toISOString());
  console.log("Vesting ends:", new Date(Number(vault.vestingEndTime) * 1000).toISOString());

  // 2. Check lockup
  if (now < vault.lockupEndTime) {
    const remaining = Number(vault.lockupEndTime - now);
    console.log(`Still locked for ${remaining} seconds`);
    return;
  }

  // 3. Check vesting progress
  if (now >= vault.vestingEndTime) {
    console.log("Fully vested!");
  } else {
    const elapsed = Number(now - vault.lockupEndTime);
    const total = Number(vault.vestingEndTime - vault.lockupEndTime);
    const pct = (elapsed / total * 100).toFixed(1);
    console.log(`Vesting: ${pct}% complete`);
  }

  // 4. Check claimable
  const claimable = await sdk.getVaultClaimable(tokenAddress);
  console.log("Claimable now:", formatUnits(claimable, 18), "tokens");

  // 5. Claim
  if (claimable > 0n) {
    console.log("Claiming...");
    const txHash = await sdk.claimVault(tokenAddress);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Claimed in tx:", txHash);
  }
}
```

## Vesting Math

```
if now < lockupEndTime:
  claimable = 0

if now >= vestingEndTime:
  claimable = amountTotal - amountClaimed

if lockupEndTime <= now < vestingEndTime:
  elapsed = now - lockupEndTime
  vestingDuration = vestingEndTime - lockupEndTime
  totalVested = amountTotal * elapsed / vestingDuration
  claimable = totalVested - amountClaimed
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `LockupNotEnded` | Lockup period hasn't passed | Wait for `lockupEndTime` |
| `Unauthorized` | Caller is not the vault admin | Use admin wallet |
| Zero claimable | All vested tokens already claimed | Wait for more to vest |

## See Also

- [../contracts/liquid-vault.md](../contracts/liquid-vault.md) -- Vault contract details
- [../concepts/extension-system.md](../concepts/extension-system.md) -- Extension overview
- [deploy-token.md](deploy-token.md) -- Deploying with vault extension
