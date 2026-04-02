# Concept: Extension System

How extensions work in Liquid Protocol: the allowlist process, available extensions, and how they integrate with token deployment.

## What Are Extensions?

Extensions are modular smart contracts that receive a portion of the token supply at deployment time. They enable pre-launch token distribution without modifying the core factory logic.

## How Extensions Work

### At Deployment

```
deployToken() called with extensions[] array
  |
  v
Factory validates each extension:
  1. Is extension on the allowlist? (isExtensionEnabled)
  2. Is extensionBps within limits?
  3. Total extensionBps <= 9000 (90%)?
  |
  v
For each extension in order:
  1. Calculate allocation: TOKEN_SUPPLY * extensionBps / 10000
  2. Factory approves extension to spend tokens
  3. Call extension.receiveTokens(token, amount, extensionData)
  |
  v
Remaining supply (10000 - sum(extensionBps)) -> LP positions
```

### Constraints

| Constraint | Value | SDK Constant |
|------------|-------|-------------|
| Max extensions per token | 10 | `TOKEN.MAX_EXTENSIONS` |
| Max total supply to extensions | 90% (9000 BPS) | `TOKEN.MAX_EXTENSION_BPS` |
| Remaining supply | Goes to LP | Locked permanently |

## Extension Allowlist

Extensions must be approved by the Liquid Protocol admin before they can be used.

### Current Allowlisted Extensions

| Extension | Address | Type |
|-----------|---------|------|
| LiquidVault | `0xdFCCC93257c20519A9005A2281CFBdF84836d50E` | Token lockup + vesting |
| LiquidAirdropV2 | `0x1423974d48f525462f1c087cBFdCC20BDBc33CdD` | Merkle distribution |
| LiquidUniv4EthDevBuy | `0x5934097864dC487D21A7B4e4EEe201A39ceF728D` | Buy tokens via V4 at launch |
| LiquidUniv3EthDevBuy | `0x376028cfb6b9A120E24Aa14c3FAc4205179c0025` | Buy tokens via V3 at launch |
| LiquidPresaleEthToCreator | `0x3bca63EcB49d5f917092d10fA879Fdb422740163` | Presale with ETH to creator |
| LiquidPresaleAllowlist | `0xCBb4ccC4B94E23233c14759f4F9629F7dD01f10B` | Allowlist-gated presale |

All extensions are covered by 0xMacro (A-3) and Cantina audits of the Clanker v4 codebase.

### Approval Process for New Extensions

New extensions require ALL of:

1. **Full third-party audit** by a recognized firm
2. **Uniswap alignment** -- approval from a Uniswap V4 core contributor
3. **Internal review** by Liquid Protocol engineering lead
4. **Admin Safe approval** -- multisig transaction through Gnosis Safe (`0x872c561f699B42977c093F0eD8b4C9a431280c6c`)

**Current status:** No plans to approve additional extensions. Contact `slaterg@mog.capital` to apply.

### On-Chain Mechanism

```typescript
// Check if extension is enabled
const isEnabled = await sdk.isExtensionEnabled(extensionAddress);
```

The allowlist is managed by `LiquidPoolExtensionAllowlist` (`0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa`).

## Available Extensions (Detail)

### Dev Buy (Recommended for Deployers)

The best way to acquire tokens at launch. Swaps ETH for tokens through the Uniswap V4 pool in the same deployment transaction.

**Key advantage:** Uses normal 1% LP fee, not the 80% MEV auction fee.

```typescript
// Simplest way -- SDK builds the extension automatically
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"),
    recipient: account.address,
  },
});
```

Or build manually:

```typescript
const ext = sdk.buildDevBuyExtension({
  ethAmount: parseEther("0.01"),
  recipient: account.address,
});

// ext: ExtensionConfig ready to include in extensions[]
```

### Vault

Locks tokens with lockup + linear vesting. See [../contracts/liquid-vault.md](../contracts/liquid-vault.md).

**Use cases:** Team lockups, investor vesting, treasury management.

### Airdrop V2

Merkle-based token distribution with mutable root, lockup, vesting, and admin reclaim. See [../contracts/liquid-airdrop.md](../contracts/liquid-airdrop.md).

**Use cases:** Community airdrops, retroactive rewards, ecosystem grants.

### Presale (ETH to Creator)

Participants send ETH and receive tokens. ETH goes directly to the token creator.

**Use cases:** Pre-launch fundraising, community pre-sales.

### Presale (Allowlist)

Allowlist-gated presale. Only approved addresses can participate.

**Use cases:** VIP pre-sales, KYC-gated sales, partner allocations.

## Extension Config Structure

```typescript
interface ExtensionConfig {
  extension: Address;       // Must be on the allowlist
  msgValue: bigint;         // ETH to send (0n except for dev buy / presale)
  extensionBps: number;     // Supply allocation (0-9000 BPS)
  extensionData: Hex;       // ABI-encoded init data (varies by extension)
}
```

## Supply Distribution Example

```
Token: 100,000,000,000 (100B) total supply

Extensions:
  Vault:   2000 BPS = 20% = 20,000,000,000 tokens (locked + vesting)
  Airdrop: 1000 BPS = 10% = 10,000,000,000 tokens (merkle claims)
  Dev Buy:    0 BPS =  0% = buys from pool, not from supply

LP Positions: 7000 BPS = 70% = 70,000,000,000 tokens
  Position 1: 40% of 70B = 28,000,000,000 tokens
  Position 2: 50% of 70B = 35,000,000,000 tokens
  Position 3: 10% of 70B =  7,000,000,000 tokens
```

Note: Dev buy uses 0 BPS because it buys from the pool (post-initialization), not from the supply allocation.

## See Also

- [../contracts/liquid-extensions.md](../contracts/liquid-extensions.md) -- Extension contracts
- [../contracts/liquid-vault.md](../contracts/liquid-vault.md) -- Vault details
- [../contracts/liquid-airdrop.md](../contracts/liquid-airdrop.md) -- Airdrop details
- [../sdk/deploy-token.md](../sdk/deploy-token.md) -- Deploying with extensions
