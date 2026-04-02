# LiquidAirdropV2

Merkle-based token airdrop extension with mutable root, admin controls, lockup/vesting, and admin reclaim.

## Contract Details

- **Address:** `0x1423974d48f525462f1c087cBFdCC20BDBc33CdD`
- **SDK Constant:** `ADDRESSES.AIRDROP_V2`
- **Type:** Extension (receives tokens via `receiveTokens`)

## How It Works

1. **At deployment:** Factory transfers tokens (per `extensionBps`) to the Airdrop contract
2. **Merkle root set:** Admin sets the merkle root defining who can claim and how much
3. **Lockup period:** Claims are blocked until `lockupEndTime`
4. **Vesting period:** After lockup, tokens vest linearly until `vestingEndTime`
5. **Claiming:** Recipients submit merkle proofs to claim their vested allocation
6. **Admin reclaim:** After `adminClaimTime`, admin can reclaim unclaimed tokens

## Airdrop Info Structure

```typescript
interface AirdropInfo {
  admin: Address;          // Airdrop administrator
  merkleRoot: Hex;         // Merkle root for claim verification
  totalSupply: bigint;     // Total tokens allocated to airdrop
  totalClaimed: bigint;    // Tokens claimed so far
  lockupEndTime: bigint;   // When claims can begin
  vestingEndTime: bigint;  // When vesting fully completes
  adminClaimTime: bigint;  // When admin can reclaim unclaimed
  adminClaimed: boolean;   // Whether admin has reclaimed
}
```

## Key Features

### Mutable Merkle Root

The admin can update the merkle root after deployment. This allows:
- Correcting errors in the original distribution
- Adding new recipients
- Adjusting allocations before claims begin

### Lockup + Vesting

Same model as the Vault:
- **Lockup:** No claims until `lockupEndTime`
- **Vesting:** Linear vesting from `lockupEndTime` to `vestingEndTime`
- Each recipient's allocation vests independently based on their total amount

### Admin Reclaim

After `adminClaimTime`, the admin can reclaim any unclaimed tokens. This prevents tokens from being permanently locked if recipients never claim.

## SDK Methods

### Check airdrop state

```typescript
const info = await sdk.getAirdropInfo(tokenAddress);
console.log("Merkle root:", info.merkleRoot);
console.log("Total supply:", info.totalSupply);
console.log("Total claimed:", info.totalClaimed);
console.log("Lockup ends:", new Date(Number(info.lockupEndTime) * 1000));
console.log("Vesting ends:", new Date(Number(info.vestingEndTime) * 1000));
console.log("Admin:", info.admin);
console.log("Admin claimed:", info.adminClaimed);
```

### Check claimable for a recipient

```typescript
const claimable = await sdk.getAirdropClaimable(
  tokenAddress,
  recipientAddress,
  allocatedAmount,    // bigint -- total allocation for this recipient (18 decimals)
);
```

### Claim airdrop

```typescript
const txHash = await sdk.claimAirdrop(
  tokenAddress,
  recipientAddress,
  allocatedAmount,    // bigint -- must match the merkle leaf
  merkleProof,        // Hex[] -- generated off-chain from the merkle tree
);
```

## Merkle Proof Generation

Merkle proofs must be generated off-chain from the original airdrop tree. The SDK does not include merkle tree generation -- use a library like `merkletreejs` or `@openzeppelin/merkle-tree`:

```typescript
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

// Build the tree
const values = [
  ["0xRecipient1", "1000000000000000000000"],  // 1000 tokens
  ["0xRecipient2", "500000000000000000000"],   // 500 tokens
];

const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
const root = tree.root;  // Set this as merkleRoot

// Get proof for a specific recipient
const proof = tree.getProof(["0xRecipient1", "1000000000000000000000"]);
```

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `AlreadyClaimed` | Recipient already claimed their allocation | Check `getAirdropClaimable()` first |
| `LockupNotEnded` | Claims not yet open | Wait for `lockupEndTime` |
| Invalid proof | Proof doesn't match the merkle root | Regenerate proof from the tree |
| `Unauthorized` | Only admin can update root or reclaim | Use admin wallet |

## See Also

- [../sdk/airdrop-system.md](../sdk/airdrop-system.md) -- SDK airdrop guide
- [../concepts/extension-system.md](../concepts/extension-system.md) -- Extension overview
