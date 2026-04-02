# Liquid Factory (Liquid.sol)

The Liquid factory is the core orchestrator of the Liquid Protocol. It deploys ERC-20 tokens with Uniswap V4 liquidity pools in a single atomic transaction.

## Contract Details

- **Address:** `0x04F1a284168743759BE6554f607a10CEBdB77760`
- **Chain:** Base (8453)
- **SDK Constant:** `ADDRESSES.FACTORY`
- **Solidity:** `^0.8.28`, optimizer 20,000 runs, EVM target Cancun
- **Inherits:** `OwnerAdmins`, `ReentrancyGuard`, `ILiquid`
- **Owner:** Gnosis Safe `0x872c561f699B42977c093F0eD8b4C9a431280c6c`

## Protocol Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TOKEN_SUPPLY` | `100_000_000_000e18` | 100 billion tokens, 18 decimals |
| `BPS` | `10_000` | Basis points denominator |
| `MAX_EXTENSIONS` | `10` | Maximum extensions per token |
| `MAX_EXTENSION_BPS` | `9000` | Max 90% of supply to extensions |

## Key Functions

### `deployToken(DeploymentConfig config)`

The primary entry point. Orchestrates the full deployment flow:

1. **Deploy token** -- Uses `LiquidDeployer` library with CREATE2 for deterministic addresses
2. **Initialize Uniswap V4 pool** -- Calls the hook to set up the pool with the provided fee configuration
3. **Lock LP** -- Transfers all liquidity to the LP Locker contract (permanent, non-reversible)
4. **Set up MEV protection** -- Registers the MEV module (sniper auction or descending fees) with the hook
5. **Execute extensions** -- Calls each extension (vault, airdrop, dev buy) in sequence, allocating token supply per `extensionBps`
6. **Emit `TokenCreated` event** -- Contains all deployment data for indexing

**Input struct (DeploymentConfig):**
```
DeploymentConfig {
  tokenConfig: TokenConfig      // name, symbol, image, metadata, context, salt, admin
  poolConfig: PoolConfig        // hook, pairedToken, tick, tickSpacing, poolData
  lockerConfig: LockerConfig    // locker, rewards, positions
  mevModuleConfig: MevModuleConfig  // MEV module + data
  extensionConfigs: ExtensionConfig[]  // vault, airdrop, dev buy, etc.
}
```

### `tokenDeploymentInfo(address token) -> DeploymentInfo`

Returns the stored deployment information for any token deployed by this factory.

```typescript
// SDK equivalent
const info = await sdk.getDeploymentInfo(tokenAddress);
// info.token, info.hook, info.locker, info.extensions
```

### Module Management (Owner/Admin only)

| Function | Description |
|----------|-------------|
| `setHook(address, bool)` | Enable/disable a hook contract |
| `setLocker(address, address, bool)` | Enable/disable a locker for a specific hook |
| `setExtension(address, bool)` | Enable/disable an extension |
| `setMevModule(address, bool)` | Enable/disable an MEV module |
| `setDeprecated(bool)` | Pause/unpause the factory |
| `setTeamFeeRecipient(address)` | Set protocol fee recipient |
| `claimTeamFees(address token)` | Claim accumulated protocol fees |

### Factory Status Checks (SDK)

```typescript
await sdk.isFactoryDeprecated();             // Is factory still active?
await sdk.isLockerEnabled(locker, hook);     // Is locker approved for hook?
await sdk.isExtensionEnabled(extension);     // Is extension on allowlist?
```

## Events

### `TokenCreated`

Emitted on every successful token deployment. Contains all information needed to index and interact with the token.

| Field | Type | Description |
|-------|------|-------------|
| `msgSender` | `address` | Deployer address |
| `tokenAddress` | `address` | Deployed ERC-20 contract |
| `tokenAdmin` | `address` | Admin who can update metadata |
| `tokenImage` | `string` | Image URL |
| `tokenName` | `string` | Token name |
| `tokenSymbol` | `string` | Token symbol |
| `tokenMetadata` | `string` | JSON metadata |
| `tokenContext` | `string` | JSON deployment context |
| `startingTick` | `int24` | Initial pool tick |
| `poolHook` | `address` | Hook contract used |
| `poolId` | `bytes32` | Uniswap V4 pool ID |
| `pairedToken` | `address` | Quote token (WETH) |
| `locker` | `address` | LP locker contract |
| `mevModule` | `address` | MEV protection module |
| `extensionsSupply` | `uint256` | Total supply allocated to extensions |
| `extensions` | `address[]` | Extension contracts used |

## Deployment Flow Diagram

```
sdk.deployToken(params)
  |
  v
SDK builds DeploymentConfig with defaults
  |
  v
Factory.deployToken(config)
  |-- 1. LiquidDeployer.deploy(salt) --> new LiquidToken (100B supply)
  |-- 2. Hook.initializePool(poolKey, startingTick, poolData)
  |-- 3. token.approve(locker, remaining supply)
  |-- 4. locker.lockLiquidity(positions, rewards)
  |-- 5. For each extension:
  |     |-- token.approve(extension, extensionBps * supply / BPS)
  |     |-- extension.receiveTokens(token, amount, data)
  |-- 6. mevModule.register(poolId, mevData)
  |-- 7. emit TokenCreated(...)
  |
  v
SDK parses TokenCreated event from receipt
  |
  v
Returns { tokenAddress, txHash, event }
```

## Security

- Factory is protected by `ReentrancyGuard` on `deployToken`
- Only enabled hooks/lockers/extensions/MEV modules can be used
- Forked from Clanker v4, audited by 0xMacro (A-3) and Cantina
- Owner is a Gnosis Safe multisig -- no single party can modify factory configuration

## See Also

- [../sdk/deploy-token.md](../sdk/deploy-token.md) -- SDK deployment guide
- [../concepts/token-lifecycle.md](../concepts/token-lifecycle.md) -- Full lifecycle overview
- [liquid-token.md](liquid-token.md) -- The ERC-20 token contract
