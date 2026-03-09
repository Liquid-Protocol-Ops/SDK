# SDK Architecture

How the Liquid Protocol SDK maps to on-chain contracts.

## Contract Hierarchy

```
Liquid.sol (Factory)
  |-- deployToken() --> creates LiquidToken (ERC20)
  |-- initializes Uniswap v4 pool via Hook
  |-- locks LP via LpLocker
  |-- sets up MEV protection
  |-- triggers extensions (Vault, Airdrop)

LiquidHookDynamicFeeV2 / LiquidHookStaticFeeV2
  |-- Uniswap v4 BaseHook
  |-- Pool lifecycle management
  |-- Dynamic fee curves (tick-based)
  |-- Protocol fee collection
  |-- MEV module integration

LiquidFeeLocker
  |-- Stores accumulated LP fees
  |-- Per-owner, per-token accounting
  |-- claim() distributes fees

LiquidVault
  |-- Token vesting with lockup + linear vest
  |-- Per-token allocation tracking
  |-- claim() releases vested tokens

LiquidLpLocker / LiquidLpLockerFeeConversion
  |-- Holds Uniswap v4 LP positions
  |-- Manages fee collection from positions
  |-- Routes fees to FeeLocker
```

## SDK Method Mapping

| SDK Method | Contract | Function |
|-----------|----------|----------|
| `deployToken()` | Liquid.sol | `deployToken(DeploymentConfig)` |
| `getDeploymentInfo()` | Liquid.sol | `tokenDeploymentInfo(address)` |
| `getTokenInfo()` | ERC20 + Liquid.sol | `name()`, `symbol()`, `decimals()`, `totalSupply()`, `tokenDeploymentInfo()` |
| `getPoolConfig()` | HookDynamicFeeV2 | `poolConfigVars(PoolId)` |
| `getPoolFeeState()` | HookDynamicFeeV2 | `poolFeeVars(PoolId)` |
| `getPoolCreationTimestamp()` | HookDynamicFeeV2 | `poolCreationTimestamp(PoolId)` |
| `isLiquidToken0()` | HookDynamicFeeV2 | `liquidIsToken0(PoolId)` |
| `getAvailableFees()` | LiquidFeeLocker | `availableFees(address,address)` |
| `getFeesToClaim()` | LiquidFeeLocker | `feesToClaim(address,address)` |
| `claimFees()` | LiquidFeeLocker | `claim(address,address)` |
| `getVaultAllocation()` | LiquidVault | `allocation(address)` |
| `getVaultClaimable()` | LiquidVault | `amountAvailableToClaim(address)` |
| `claimVault()` | LiquidVault | `claim(address)` |
| `isFactoryDeprecated()` | Liquid.sol | `deprecated()` |
| `isLockerEnabled()` | Liquid.sol | `enabledLockers(address,address)` |

## Token Deployment Flow

1. User calls `liquid.deployToken({ name, symbol, ... })`
2. SDK builds `DeploymentConfig` struct with defaults for hook, locker, MEV module
3. SDK calls `Liquid.deployToken(config)` on-chain
4. Factory:
   - Deploys new ERC20 token via `LiquidDeployer` library
   - Initializes Uniswap v4 pool via the hook
   - Locks liquidity via the LP locker
   - Triggers extensions (vault, airdrop) if configured
   - Emits `TokenCreated` event
5. SDK parses `TokenCreated` event from receipt
6. Returns `{ tokenAddress, txHash, event }`

## Fee Flow

```
Swap happens in Uniswap v4 pool
  --> Hook calculates dynamic fee
  --> 20% of LP fee goes to protocol (PROTOCOL_FEE_NUMERATOR = 200,000)
  --> Remaining 80% accrues to LP position
  --> LP Locker collects fees periodically
  --> Fees routed to FeeLocker
  --> Fee recipients call claimFees() to withdraw
```

## Default Parameters

When `deployToken()` is called with minimal params, the SDK fills these defaults:

| Parameter | Default | Notes |
|-----------|---------|-------|
| `hook` | HookDynamicFeeV2 | Tick-based dynamic fees |
| `pairedToken` | WETH | `0x4200...0006` on Base |
| `tickIfToken0IsLiquid` | -198720 | ~$0.001 WETH/token initial price |
| `tickSpacing` | 60 | Standard Uniswap v4 spacing |
| `locker` | LP_LOCKER | Standard LP locker |
| `mevModule` | MEV_BLOCK_DELAY | Block-based MEV protection |
| `tickLower/tickUpper` | [-887220, 887220] | Full-range position |
| `positionBps` | [10000] | Single position, 100% |
| `rewardBps` | [10000] | All rewards to caller |
| `salt` | keccak256(name + symbol + timestamp) | Random per deployment |
