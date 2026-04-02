# LiquidToken (ERC-20)

The token contract deployed by the Liquid factory for every token launch. A feature-rich ERC-20 with governance, burning, and cross-chain support.

## Contract Details

- **Deployed per token** -- Each `deployToken()` call creates a new LiquidToken instance via CREATE2
- **Solidity:** `^0.8.28`
- **License:** MIT

## Token Properties

| Property | Value |
|----------|-------|
| **Total Supply** | 100,000,000,000 (100 billion) |
| **Decimals** | 18 |
| **Supply (raw)** | `100_000_000_000 * 10^18` = `100_000_000_000_000_000_000_000_000_000` |
| **SDK Constant** | `TOKEN.SUPPLY` = `100_000_000_000n * 10n ** 18n` |
| **Minting** | Fixed supply, no additional minting possible |

## Inherited Interfaces

LiquidToken inherits from multiple OpenZeppelin and OP Stack contracts:

| Interface | Source | What It Provides |
|-----------|--------|-----------------|
| **ERC20** | OpenZeppelin | Standard token: `transfer`, `approve`, `balanceOf`, `allowance` |
| **ERC20Permit** | OpenZeppelin | Gasless approvals via EIP-2612 signed messages |
| **ERC20Votes** | OpenZeppelin | On-chain governance: `delegate`, `getVotes`, `getPastVotes` |
| **ERC20Burnable** | OpenZeppelin | Token burning: `burn`, `burnFrom` |
| **IERC7802** | OP Stack | Cross-chain token standard for Optimism Superchain bridges |
| **IERC165** | OpenZeppelin | Interface detection: `supportsInterface` |

## Key Features

### Permit (EIP-2612)

Allows gasless token approvals. Users sign a permit off-chain, and anyone can submit the signature to grant approval:

```typescript
// No on-chain approve() transaction needed
// The permit signature can be submitted by anyone
```

### Votes (ERC-5805)

Full on-chain governance support. Token holders can delegate their voting power:

```typescript
// Delegate voting power
await tokenContract.write.delegate([delegateAddress]);

// Check voting power
const votes = await tokenContract.read.getVotes([address]);
```

### Burnable

Token holders can burn their own tokens, permanently reducing the circulating supply:

```typescript
// Burn own tokens
await tokenContract.write.burn([amount]);

// Burn from approved address
await tokenContract.write.burnFrom([owner, amount]);
```

### Cross-Chain (IERC7802)

Supports the Optimism Superchain cross-chain token standard. Enables native bridging across OP Stack chains without wrapped token contracts. Only the `SuperchainTokenBridge` predeploy can call `crosschainMint` and `crosschainBurn`.

## Admin Functions

The token has an admin (set at deployment, defaults to deployer) who can:

| Function | Description | SDK Method |
|----------|-------------|------------|
| `updateImage(string)` | Change the token image URL | `sdk.updateImage(token, url)` |
| `updateMetadata(string)` | Change the token metadata JSON | `sdk.updateMetadata(token, json)` |
| `updateAdmin(address)` | Transfer admin role | Direct contract call |

## Supply Distribution

At deployment, the 100B supply is distributed as:

```
100B Total Supply
  |-- Extensions allocation (0-90%, per extensionBps)
  |   |-- Vault (lockup + vesting)
  |   |-- Airdrop (merkle distribution)
  |   |-- Dev Buy (swap through pool)
  |   |-- Presale
  |
  |-- Remaining → LP positions (locked permanently)
      |-- Position 1: X% of remaining
      |-- Position 2: Y% of remaining
      |-- ... (up to 7 positions)
```

## See Also

- [liquid-factory.md](liquid-factory.md) -- Factory that deploys tokens
- [../concepts/token-lifecycle.md](../concepts/token-lifecycle.md) -- Full lifecycle
