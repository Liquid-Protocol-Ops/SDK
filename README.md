# Liquid Protocol SDK

TypeScript SDK for the Liquid Protocol token launcher on Base. Deploy tokens, manage pools, and claim fees using [viem](https://viem.sh).

## Installation

```bash
npm install liquid-protocol-sdk viem
```

## Quick Start

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-protocol-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

const liquid = new LiquidSDK({ publicClient, walletClient });
```

## Deploy a Token

```typescript
const result = await liquid.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "ipfs://QmYourImageHash",
  metadata: '{"description": "My token description"}',
});

console.log("Token deployed at:", result.tokenAddress);
console.log("Pool ID:", result.event.poolId);
console.log("Tx:", result.txHash);
```

### Deploy with Custom Configuration

```typescript
import { ADDRESSES, EXTERNAL } from "liquid-protocol-sdk";

const result = await liquid.deployToken({
  name: "Custom Token",
  symbol: "CTK",

  // Pool config
  hook: ADDRESSES.HOOK_STATIC_FEE_V2, // use static fee hook
  pairedToken: EXTERNAL.WETH,
  tickSpacing: 60,
  tickIfToken0IsLiquid: -198720,

  // LP rewards: split 70/30 between creator and platform
  rewardAdmins: [creatorAddress, platformAddress],
  rewardRecipients: [creatorAddress, platformAddress],
  rewardBps: [7000, 3000],

  // Full-range single position
  tickLower: [-887220],
  tickUpper: [887220],
  positionBps: [10000],

  // MEV protection
  mevModule: ADDRESSES.MEV_BLOCK_DELAY,
});
```

## Read Token Info

```typescript
// Get ERC20 info + deployment details
const info = await liquid.getTokenInfo(tokenAddress);
console.log(info.name, info.symbol, info.decimals);
console.log("Hook:", info.deployment.hook);
console.log("Locker:", info.deployment.locker);

// Get deployment info only
const deployment = await liquid.getDeploymentInfo(tokenAddress);
```

## Pool Information

```typescript
// Get pool fee configuration (dynamic fee hook)
const config = await liquid.getPoolConfig(poolId);
console.log("Base fee:", config.baseFee);
console.log("Max LP fee:", config.maxLpFee);

// Get current fee state
const feeState = await liquid.getPoolFeeState(poolId);
console.log("Reference tick:", feeState.referenceTick);
console.log("Last swap:", feeState.lastSwapTimestamp);

// Check pool creation time
const created = await liquid.getPoolCreationTimestamp(poolId);

// Check token ordering
const isToken0 = await liquid.isLiquidToken0(poolId);
```

## Claim Fees

```typescript
// Check available fees
const available = await liquid.getAvailableFees(ownerAddress, tokenAddress);
const claimable = await liquid.getFeesToClaim(ownerAddress, tokenAddress);

console.log("Available:", available);
console.log("Claimable:", claimable);

// Claim fees
const txHash = await liquid.claimFees(ownerAddress, tokenAddress);
```

## Vault (Token Vesting)

```typescript
// Check vault allocation
const allocation = await liquid.getVaultAllocation(tokenAddress);
console.log("Total:", allocation.amountTotal);
console.log("Claimed:", allocation.amountClaimed);
console.log("Lockup ends:", new Date(Number(allocation.lockupEndTime) * 1000));

// Check claimable amount
const claimable = await liquid.getVaultClaimable(tokenAddress);

// Claim vested tokens
const txHash = await liquid.claimVault(tokenAddress);
```

## Factory Status

```typescript
// Check if factory is accepting new deployments
const deprecated = await liquid.isFactoryDeprecated();

// Check if a locker/hook pair is enabled
const enabled = await liquid.isLockerEnabled(lockerAddress, hookAddress);
```

## Constants & ABIs

All production addresses, fee parameters, and contract ABIs are exported:

```typescript
import {
  ADDRESSES,     // Liquid Protocol contract addresses
  EXTERNAL,      // External protocol addresses (PoolManager, WETH, etc.)
  FEE,           // Fee constants (denominator, protocol fee, max fees)
  TOKEN,         // Token constants (supply, decimals, max extensions)
  DEFAULT_CHAIN, // base chain object
  DEFAULT_CHAIN_ID, // 8453

  // ABIs for direct contract interaction
  LiquidFactoryAbi,
  LiquidFeeLockerAbi,
  LiquidHookDynamicFeeV2Abi,
  LiquidVaultAbi,
  ERC20Abi,
} from "liquid-protocol-sdk";
```

## API Reference

### `LiquidSDK`

#### Constructor

```typescript
new LiquidSDK({ publicClient, walletClient? })
```

- `publicClient` (required) - viem `PublicClient` connected to Base
- `walletClient` (optional) - viem `WalletClient` for write operations

#### Methods

| Method | Description | Requires Wallet |
|--------|-------------|:-:|
| `deployToken(params)` | Deploy a new token + pool | Yes |
| `getDeploymentInfo(token)` | Get deployment info (hook, locker, extensions) | No |
| `getTokenInfo(token)` | Get ERC20 info + deployment details | No |
| `getPoolConfig(poolId, hook?)` | Get dynamic fee pool configuration | No |
| `getPoolFeeState(poolId, hook?)` | Get current fee state variables | No |
| `getPoolCreationTimestamp(poolId, hook?)` | Get pool creation timestamp | No |
| `isLiquidToken0(poolId, hook?)` | Check if Liquid token is currency0 | No |
| `getAvailableFees(owner, token)` | Get available fee balance | No |
| `getFeesToClaim(owner, token)` | Get claimable fee balance | No |
| `claimFees(owner, token)` | Claim accumulated fees | Yes |
| `getVaultAllocation(token)` | Get vault vesting allocation | No |
| `getVaultClaimable(token)` | Get vested amount available to claim | No |
| `claimVault(token)` | Claim vested tokens from vault | Yes |
| `isFactoryDeprecated()` | Check if factory is deprecated | No |
| `isLockerEnabled(locker, hook)` | Check if locker/hook pair is enabled | No |

## Production Addresses

All contracts are deployed on **Base** (chain ID 8453):

| Contract | Address |
|----------|---------|
| Factory | `0x0000003482fe299E72d4908368044A8A173BE576` |
| Hook Dynamic Fee V2 | `0x2A2F73CDDa098d639bd8Bbcd7dF2bf24E06728cC` |
| Hook Static Fee V2 | `0xb2401c5369AaCF62F8d615623C7F68F84da428Cc` |
| Fee Locker | `0x000008B9242b7e4432f6c4b1EeAD93562f9Cc94d` |
| LP Locker | `0x00000548732DfA56Be1257cE44D0CFc3B46dDb2A` |
| LP Locker Fee Conversion | `0x00000547518784420CEeF761fb18D884bb908102` |
| Vault | `0x000001c5263F4d64CdC343cDA9C8bF961CF8376c` |
| Sniper Auction V2 | `0x000007b64003ee07a69576F98859a0a36b854260` |
| Sniper Util V2 | `0x000003Ee0cb9B0C82C6C7FCB7b81a9883F285270` |
| MEV Block Delay | `0x0000035D83588954F3c581c3A66251b3F06AD5e4` |
| Airdrop V2 | `0x00000C222442512b08446D33dd9754a7F260BE79` |
| Pool Extension Allowlist | `0x000003Afb1b070F037D2871eE0A6b8c8f53F7B77` |

## License

MIT
