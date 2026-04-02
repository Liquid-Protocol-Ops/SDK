# SDK Guide: Airdrop System

How to interact with merkle-based airdrops: check state, verify claimable amounts, and claim tokens.

## Overview

The Airdrop V2 extension distributes tokens via merkle proof claims. It supports mutable merkle roots, lockup/vesting, and admin reclaim of unclaimed tokens.

## SDK Methods

### `getAirdropInfo(tokenAddress)`

Returns the airdrop state for a token.

```typescript
const info = await sdk.getAirdropInfo(tokenAddress);

info.admin            // Address -- airdrop admin
info.merkleRoot       // Hex -- merkle root for verification
info.totalSupply      // bigint -- total airdrop allocation
info.totalClaimed     // bigint -- tokens claimed so far
info.lockupEndTime    // bigint -- when claims open (unix timestamp)
info.vestingEndTime   // bigint -- when vesting completes (unix timestamp)
info.adminClaimTime   // bigint -- when admin can reclaim unclaimed
info.adminClaimed     // boolean -- whether admin has reclaimed
```

### `getAirdropClaimable(tokenAddress, recipient, allocatedAmount)`

Returns the amount a specific recipient can claim right now.

```typescript
const claimable = await sdk.getAirdropClaimable(
  tokenAddress,
  recipientAddress,
  allocatedAmount,    // bigint -- total allocation for this recipient (18 decimals)
);
```

### `claimAirdrop(tokenAddress, recipient, allocatedAmount, proof)`

Claims the airdrop for a recipient. Requires wallet.

```typescript
const txHash = await sdk.claimAirdrop(
  tokenAddress,
  recipientAddress,
  allocatedAmount,    // bigint -- must match the merkle leaf exactly
  merkleProof,        // Hex[] -- generated off-chain from the merkle tree
);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

## Complete Example

```typescript
import { LiquidSDK } from "liquid-sdk";
import { formatUnits, parseUnits } from "viem";

const sdk = new LiquidSDK({ publicClient, walletClient });

// 1. Check airdrop state
const info = await sdk.getAirdropInfo(tokenAddress);
const now = BigInt(Math.floor(Date.now() / 1000));

console.log("Merkle root:", info.merkleRoot);
console.log("Total supply:", formatUnits(info.totalSupply, 18));
console.log("Claimed so far:", formatUnits(info.totalClaimed, 18));

// 2. Check if claims are open
if (now < info.lockupEndTime) {
  console.log("Claims not yet open. Opens:", new Date(Number(info.lockupEndTime) * 1000));
  return;
}

// 3. Check claimable for a recipient
const myAllocation = parseUnits("1000", 18);  // 1000 tokens allocated
const claimable = await sdk.getAirdropClaimable(
  tokenAddress,
  recipientAddress,
  myAllocation,
);
console.log("Claimable:", formatUnits(claimable, 18), "tokens");

// 4. Claim (need merkle proof from off-chain tree)
if (claimable > 0n) {
  const txHash = await sdk.claimAirdrop(
    tokenAddress,
    recipientAddress,
    myAllocation,
    merkleProof,  // Hex[] from the merkle tree
  );
  console.log("Claimed in tx:", txHash);
}
```

## Merkle Proof Generation

The SDK does not generate merkle proofs. Use a library like `@openzeppelin/merkle-tree`:

```typescript
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

// Build tree from recipient list
const values = [
  ["0xRecipient1", "1000000000000000000000"],  // 1000 tokens (18 decimals)
  ["0xRecipient2", "500000000000000000000"],   // 500 tokens
  // ... more recipients
];

const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
console.log("Root:", tree.root);  // Set this as the merkle root

// Get proof for a recipient
const proof = tree.getProof(["0xRecipient1", "1000000000000000000000"]);
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `AlreadyClaimed` | Recipient already claimed | Check `getAirdropClaimable()` first |
| `LockupNotEnded` | Claims haven't opened yet | Wait for `lockupEndTime` |
| Invalid proof | Proof doesn't match root | Regenerate from the tree |
| `Unauthorized` | Admin-only function called by non-admin | Use admin wallet |

## See Also

- [../contracts/liquid-airdrop.md](../contracts/liquid-airdrop.md) -- Airdrop contract details
- [../concepts/extension-system.md](../concepts/extension-system.md) -- Extension overview
