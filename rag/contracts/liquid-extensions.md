# Extension System

Extensions are modular contracts that receive a portion of the token supply at deployment. They enable pre-launch token distribution (vesting, airdrops, dev buys, presales) without modifying the core factory logic.

## How Extensions Work

1. The deployer includes `ExtensionConfig[]` in the deployment parameters
2. During `deployToken()`, the factory allocates `extensionBps / 10000 * TOKEN_SUPPLY` to each extension
3. The factory calls `extension.receiveTokens(token, amount, extensionData)` for each
4. Extensions hold and distribute tokens according to their logic

### Constraints

| Constraint | Value | Description |
|------------|-------|-------------|
| Max extensions | 10 | Per token deployment |
| Max total BPS | 9000 | 90% of total supply across all extensions |
| Remaining supply | Goes to LP | Locked in positions via LP Locker |

## Extension Allowlist

Extensions must be explicitly approved by the Liquid Protocol admin. The allowlist is managed by `LiquidPoolExtensionAllowlist` (`0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa`), owned by the Gnosis Safe multisig.

### Approval Process

New extensions require ALL of the following:

1. **Full third-party audit** -- By a recognized firm
2. **Uniswap alignment** -- Approval from a Uniswap V4 core contributor
3. **Internal review** -- Liquid Protocol engineering lead must approve
4. **Admin Safe approval** -- Multisig transaction through the Gnosis Safe

**Current status:** No plans to add new extensions. Contact `slaterg@mog.capital` and `admin@mog.capital` to apply.

### Checking Allowlist Status

```typescript
const isEnabled = await sdk.isExtensionEnabled(extensionAddress);
```

## Available Extensions

### 1. Dev Buy (V4) -- LiquidUniv4EthDevBuy

**Address:** `0x5934097864dC487D21A7B4e4EEe201A39ceF728D`

Buys tokens with ETH through the Uniswap V4 pool in the same transaction as deployment. This is the recommended way to acquire tokens at launch because:

- Uses normal 1% LP fees (NOT auction fees)
- Atomic -- no front-running risk
- Tokens delivered to specified recipient immediately

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"),  // ETH to spend
    recipient: account.address,     // Who gets tokens
  },
});
```

The SDK automatically builds the extension config and appends it. The `ethAmount` is sent as `msg.value`.

### 2. Dev Buy (V3) -- LiquidUniv3EthDevBuy

**Address:** `0x376028cfb6b9A120E24Aa14c3FAc4205179c0025`

Legacy extension for buying through Uniswap V3 pools. Same concept as V4 dev buy but routes through V3. Not commonly used for new deployments.

### 3. Vault -- LiquidVault

**Address:** `0xdFCCC93257c20519A9005A2281CFBdF84836d50E`

Locks tokens with a lockup period followed by linear vesting. See [liquid-vault.md](liquid-vault.md) for full details.

**Use cases:**
- Team token lockup
- Investor vesting schedules
- Treasury management

### 4. Airdrop V2 -- LiquidAirdropV2

**Address:** `0x1423974d48f525462f1c087cBFdCC20BDBc33CdD`

Merkle-based token distribution with lockup/vesting and admin controls. See [liquid-airdrop.md](liquid-airdrop.md) for full details.

**Use cases:**
- Community airdrops
- Retroactive rewards
- Ecosystem grants

### 5. Presale (ETH to Creator) -- LiquidPresaleEthToCreator

**Address:** `0x3bca63EcB49d5f917092d10fA879Fdb422740163`

Presale where participants send ETH and receive tokens. The ETH is forwarded directly to the token creator (deployer).

**Use cases:**
- Pre-launch fundraising
- Community pre-sales

### 6. Presale (Allowlist) -- LiquidPresaleAllowlist

**Address:** `0xCBb4ccC4B94E23233c14759f4F9629F7dD01f10B`

Allowlist-gated presale. Only addresses on the allowlist can participate. Provides a controlled pre-sale mechanism.

**Use cases:**
- VIP/early supporter pre-sales
- KYC-gated sales
- Partner allocations

## Extension Config Structure

```typescript
interface ExtensionConfig {
  extension: Address;       // Contract address (must be allowlisted)
  msgValue: bigint;         // ETH to send (usually 0n, non-zero for dev buy)
  extensionBps: number;     // Supply allocation (0-9000 BPS)
  extensionData: Hex;       // ABI-encoded init data (extension-specific)
}
```

## Building Extension Configs Manually

```typescript
// Dev buy (the SDK does this automatically when devBuy is passed)
const devBuyExt: ExtensionConfig = {
  extension: ADDRESSES.UNIV4_ETH_DEV_BUY,
  msgValue: parseEther("0.01"),  // ETH for the swap
  extensionBps: 0,                // Dev buy uses 0 BPS (buys from pool)
  extensionData: encodeAbiParameters(
    [{ type: "address" }],
    [recipientAddress],
  ),
};

// Or use the SDK helper
const devBuyExt = sdk.buildDevBuyExtension({
  ethAmount: parseEther("0.01"),
  recipient: recipientAddress,
});
```

## See Also

- [liquid-vault.md](liquid-vault.md) -- Vault extension details
- [liquid-airdrop.md](liquid-airdrop.md) -- Airdrop extension details
- [../concepts/extension-system.md](../concepts/extension-system.md) -- Conceptual overview
- [../sdk/deploy-token.md](../sdk/deploy-token.md) -- Deploying with extensions
