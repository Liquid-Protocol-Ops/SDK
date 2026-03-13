# liquid-sdk — Agent & Developer Reference

> Zero API keys. One peer dependency (`viem`). Full on-chain token lifecycle on Base.

## Install

```bash
npm install liquid-sdk viem
```

## Quick Start

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

// Read-only (no wallet needed)
const publicClient = createPublicClient({ chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient });

// Read + write (wallet required for transactions)
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient, walletClient });
```

No API keys, no backend, no database. The SDK talks directly to Base mainnet contracts via any RPC endpoint.

---

## What This SDK Does

Liquid Protocol deploys ERC-20 tokens on Base with:
- Uniswap V4 liquidity pools (automatic)
- LP fee collection and reward distribution
- MEV protection via block delay
- Optional extensions: dev buy, vault lockup/vesting, airdrops

Every token gets 100 billion supply (18 decimals), a Uniswap V4 pool, and locked liquidity with configurable reward splits.

---

## Complete Method Reference

### Token Deployment

#### `sdk.deployToken(params)` — Deploy a new token

Requires wallet. Creates the token, pool, locks LP, and optionally buys tokens at launch.

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: "https://example.com/logo.png",     // optional
  metadata: '{"description":"A cool token"}', // optional, JSON string
  context: '{"platform":"my-app"}',           // optional, tracking/attribution

  // All fields below are optional — sensible defaults are applied
  // See "Default Values" section for what gets used if omitted
});

console.log(result.tokenAddress);  // 0x... deployed token
console.log(result.txHash);        // 0x... transaction hash
console.log(result.event.poolId);  // 0x... Uniswap V4 pool ID
```

**Returns:** `{ tokenAddress, txHash, event }` where `event` contains the full `TokenCreated` event data (poolId, hook, locker, extensions, etc.)

#### `sdk.deployToken(params)` — With dev buy (buy tokens at launch)

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"), // ETH to spend buying tokens
    recipient: account.address,     // who gets the tokens
  },
});
```

The dev buy extension is appended automatically. The ETH is swapped for tokens through the Uniswap V4 pool in the same transaction as deployment.

#### `sdk.buildDevBuyExtension(devBuy)` — Build dev buy extension manually

```typescript
const ext = sdk.buildDevBuyExtension({
  ethAmount: parseEther("0.1"),
  recipient: "0x...",
});
// ext is an ExtensionConfig you can include in params.extensions
```

---

### Checking & Collecting Fees

Tokens generate LP fees from Uniswap V4 trading. These accrue in the Fee Locker and can be claimed by the fee owner.

#### `sdk.getAvailableFees(feeOwner, tokenAddress)` — Check total unlocked fees

```typescript
const fees = await sdk.getAvailableFees(ownerAddress, tokenAddress);
// fees: bigint — total fees available (in token's paired asset, usually WETH)
```

#### `sdk.getFeesToClaim(feeOwner, tokenAddress)` — Check claimable fees

```typescript
const claimable = await sdk.getFeesToClaim(ownerAddress, tokenAddress);
// claimable: bigint — fees ready to claim right now
```

#### `sdk.claimFees(feeOwner, tokenAddress)` — Claim fees

Requires wallet.

```typescript
if (claimable > 0n) {
  const txHash = await sdk.claimFees(ownerAddress, tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

---

### Checking & Collecting LP Rewards

LP rewards are distributed to reward recipients configured at deployment. The LP Locker holds the position and distributes fees according to BPS splits.

#### `sdk.getTokenRewards(tokenAddress)` — Get reward configuration

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
// rewards.rewardRecipients: Address[] — who receives rewards
// rewards.rewardBps: number[]         — basis points per recipient (sum = 10000)
// rewards.rewardAdmins: Address[]     — who can update recipients
// rewards.poolKey: PoolKey            — the Uniswap V4 pool
// rewards.positionId: bigint          — LP position NFT ID
// rewards.numPositions: bigint        — number of LP positions
```

#### `sdk.collectRewards(tokenAddress)` — Collect rewards and unlock LP

Requires wallet. Collects all accrued LP fees and distributes to recipients.

```typescript
const txHash = await sdk.collectRewards(tokenAddress);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

#### `sdk.collectRewardsWithoutUnlock(tokenAddress)` — Collect fees only (no unlock)

Requires wallet. Same as above but does not unlock the LP position. Use this to avoid MEV during collection.

```typescript
const txHash = await sdk.collectRewardsWithoutUnlock(tokenAddress);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

**Important:** After deployment, the pool is locked for a MEV block delay. `collectRewardsWithoutUnlock` may revert with `ManagerLocked` if called too soon. Use `getPoolUnlockTime` to check.

#### `sdk.updateRewardRecipient(tokenAddress, rewardIndex, newRecipient)` — Change reward recipient

Requires wallet. Only callable by the reward admin for that index.

```typescript
// Change the first reward recipient (index 0)
const txHash = await sdk.updateRewardRecipient(
  tokenAddress,
  0n,                  // reward index (bigint)
  newRecipientAddress, // new recipient
);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

---

### Vault (Token Lockup & Vesting)

Tokens can be locked in a vault with a lockup period followed by linear vesting.

#### `sdk.getVaultAllocation(tokenAddress)` — Check vault state

```typescript
const vault = await sdk.getVaultAllocation(tokenAddress);
// vault.amountTotal: bigint      — total tokens locked
// vault.amountClaimed: bigint    — already claimed
// vault.lockupEndTime: bigint    — when lockup ends (unix timestamp)
// vault.vestingEndTime: bigint   — when vesting fully unlocks (unix timestamp)
// vault.admin: Address           — who can claim
// vault.token: Address           — the token
```

#### `sdk.getVaultClaimable(tokenAddress)` — Check claimable amount

```typescript
const claimable = await sdk.getVaultClaimable(tokenAddress);
// claimable: bigint — tokens available to claim right now
```

#### `sdk.claimVault(tokenAddress)` — Claim vested tokens

Requires wallet.

```typescript
if (claimable > 0n) {
  const txHash = await sdk.claimVault(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

---

### Airdrop

Tokens can include a merkle-tree airdrop extension for distributing tokens to a list of recipients.

#### `sdk.getAirdropInfo(tokenAddress)` — Check airdrop state

```typescript
const info = await sdk.getAirdropInfo(tokenAddress);
// info.merkleRoot: Hex            — merkle root
// info.totalSupply: bigint        — total airdrop supply
// info.totalClaimed: bigint       — already claimed
// info.lockupEndTime: bigint      — when claims begin
// info.vestingEndTime: bigint     — when vesting completes
// info.admin: Address             — airdrop admin
// info.adminClaimed: boolean      — whether admin reclaimed unclaimed tokens
```

#### `sdk.getAirdropClaimable(tokenAddress, recipient, allocatedAmount)` — Check claimable

```typescript
const claimable = await sdk.getAirdropClaimable(
  tokenAddress,
  recipientAddress,
  allocatedAmount,    // bigint — total allocation for this recipient (18 decimals)
);
```

#### `sdk.claimAirdrop(tokenAddress, recipient, allocatedAmount, proof)` — Claim airdrop

Requires wallet. The merkle proof must be generated off-chain from the original airdrop tree.

```typescript
const txHash = await sdk.claimAirdrop(
  tokenAddress,
  recipientAddress,
  allocatedAmount,    // bigint
  merkleProof,        // Hex[] — from the merkle tree
);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

---

### Token Info

#### `sdk.getTokenInfo(tokenAddress)` — Get token metadata

```typescript
const info = await sdk.getTokenInfo(tokenAddress);
// info.address: Address
// info.name: string
// info.symbol: string
// info.decimals: number (always 18)
// info.totalSupply: bigint
// info.deployment: { token, hook, locker, extensions }
```

#### `sdk.getDeploymentInfo(tokenAddress)` — Get deployment addresses

```typescript
const deploy = await sdk.getDeploymentInfo(tokenAddress);
// deploy.token: Address
// deploy.hook: Address       — which hook contract
// deploy.locker: Address     — which locker contract
// deploy.extensions: Address[] — active extensions
```

---

### Token Discovery

#### `sdk.getTokens(options?)` — Query all deployed tokens

Query TokenCreated events with optional filtering. For wallet integrations, token listings, and indexing.

```typescript
// Get all tokens
const allTokens = await sdk.getTokens();

// Get tokens by deployer
const myTokens = await sdk.getTokens({ deployer: myAddress });

// Paginate with block ranges
const page1 = await sdk.getTokens({ fromBlock: 20000000n, toBlock: 20100000n });
const page2 = await sdk.getTokens({ fromBlock: 20100001n });
```

Each result includes full on-chain event data: name, symbol, image, metadata, context, poolId, hook, locker, extensions, and `blockNumber` for cursor-based pagination.

#### `sdk.getTokenEvent(tokenAddress)` — Look up a single token's event data

Fast lookup by contract address (tokenAddress is indexed on-chain = single RPC call).

```typescript
const event = await sdk.getTokenEvent(tokenAddress);
// event.tokenName, event.tokenSymbol, event.tokenImage
// event.tokenMetadata — parse with parseMetadata()
// event.tokenContext  — parse with parseContext()
// event.poolId, event.poolHook, event.locker, event.extensions
// event.blockNumber
```

#### `sdk.getDeployedTokens(deployer, fromBlock?, toBlock?)` — Get tokens by deployer

Convenience wrapper around `getTokens({ deployer })`.

```typescript
const tokens = await sdk.getDeployedTokens(deployerAddress);
```

---

### Token Metadata Updates

#### `sdk.updateImage(tokenAddress, newImageUrl)` — Update token image

Requires wallet. Only callable by token admin.

```typescript
const txHash = await sdk.updateImage(tokenAddress, "https://new-image.png");
```

#### `sdk.updateMetadata(tokenAddress, newMetadata)` — Update token metadata

Requires wallet. Only callable by token admin.

```typescript
const txHash = await sdk.updateMetadata(tokenAddress, '{"description":"Updated"}');
```

---

### Pool Reads

#### `sdk.getPoolConfig(poolId)` — Get dynamic fee configuration

```typescript
const config = await sdk.getPoolConfig(poolId);
// config.baseFee: number                    — minimum fee (bps)
// config.maxLpFee: number                   — maximum LP fee
// config.referenceTickFilterPeriod: bigint   — seconds
// config.resetPeriod: bigint                — seconds
// config.resetTickFilter: number
// config.feeControlNumerator: bigint
// config.decayFilterBps: number
```

#### `sdk.getPoolFeeState(poolId)` — Get current fee state

```typescript
const state = await sdk.getPoolFeeState(poolId);
// state.referenceTick: number
// state.resetTick: number
// state.resetTickTimestamp: bigint
// state.lastSwapTimestamp: bigint
// state.appliedVR: number
// state.prevVA: number
```

#### `sdk.getPoolCreationTimestamp(poolId)` — When was the pool created

```typescript
const timestamp = await sdk.getPoolCreationTimestamp(poolId);
```

#### `sdk.isLiquidToken0(poolId)` — Is the token token0 or token1

```typescript
const isToken0 = await sdk.isLiquidToken0(poolId);
```

---

### Sniper Auction

MEV auction system that prices early trading activity.

#### `sdk.getAuctionState(poolId)` — Current auction state

```typescript
const auction = await sdk.getAuctionState(poolId);
// auction.nextAuctionBlock: bigint
// auction.round: bigint
// auction.gasPeg: bigint
// auction.currentFee: number
```

#### `sdk.getAuctionFeeConfig(poolId)` — Auction fee parameters

```typescript
const feeConfig = await sdk.getAuctionFeeConfig(poolId);
// feeConfig.startingFee: number
// feeConfig.endingFee: number
// feeConfig.secondsToDecay: bigint
```

#### `sdk.getAuctionDecayStartTime(poolId)` — When fee decay started

```typescript
const startTime = await sdk.getAuctionDecayStartTime(poolId);
```

#### `sdk.getAuctionMaxRounds()` — Max auction rounds

```typescript
const maxRounds = await sdk.getAuctionMaxRounds();
```

#### `sdk.getAuctionGasPriceForBid(gasPeg, bidAmount)` — Calculate gas price for bid

```typescript
const gasPrice = await sdk.getAuctionGasPriceForBid(
  auction.gasPeg,
  parseEther("1"),  // desired bid
);
```

---

### MEV Protection

#### `sdk.getMevBlockDelay()` — Get configured block delay

```typescript
const delay = await sdk.getMevBlockDelay();
// delay: bigint — number of blocks
```

#### `sdk.getPoolUnlockTime(poolId)` — When does MEV lock expire

```typescript
const unlockTime = await sdk.getPoolUnlockTime(poolId);
// unlockTime: bigint — unix timestamp
// If Date.now()/1000 < unlockTime, pool is still locked
```

---

### Factory & Allowlist Checks

#### `sdk.isFactoryDeprecated()` — Is the factory still active

```typescript
const deprecated = await sdk.isFactoryDeprecated();
```

#### `sdk.isLockerEnabled(lockerAddress, hookAddress)` — Is locker approved

```typescript
const enabled = await sdk.isLockerEnabled(ADDRESSES.LP_LOCKER, ADDRESSES.HOOK_DYNAMIC_FEE_V2);
```

#### `sdk.isExtensionEnabled(extensionAddress)` — Is extension on allowlist

```typescript
const enabled = await sdk.isExtensionEnabled(ADDRESSES.UNIV4_ETH_DEV_BUY);
```

---

## Default Values

When calling `deployToken`, all fields except `name` and `symbol` are optional. These defaults are applied:

| Field | Default | Notes |
|-------|---------|-------|
| `tokenAdmin` | Wallet address | Controls metadata updates |
| `salt` | `keccak256(name + symbol + timestamp)` | Unique per deploy |
| `image` | `""` | Empty string |
| `metadata` | `""` | Empty string |
| `context` | `'{"interface":"SDK"}'` | Auto-set via `buildContext()` |
| `hook` | `ADDRESSES.HOOK_STATIC_FEE_V2` | Static 1% buy fee |
| `pairedToken` | `EXTERNAL.WETH` | Base WETH |
| `tickIfToken0IsLiquid` | `-230400` | ≈10 ETH market cap |
| `tickSpacing` | `200` | Uniswap V4 tick spacing |
| `poolData` | `encodeStaticFeePoolData(0, 100)` | 0% sell, 1% buy |
| `locker` | `ADDRESSES.LP_LOCKER_FEE_CONVERSION` | LP locker with fee conversion to ETH |
| `rewardAdmins` | `[walletAddress]` | Deployer is admin |
| `rewardRecipients` | `[walletAddress]` | Deployer gets rewards |
| `rewardBps` | `[10000]` | 100% to deployer |
| `tickLower` | `[-230400, -198600, -168600]` | 3-tranche Liquid default |
| `tickUpper` | `[-198600, -168600, -122600]` | 3-tranche Liquid default |
| `positionBps` | `[4000, 5000, 1000]` | 40% / 50% / 10% |
| `mevModule` | `ADDRESSES.SNIPER_AUCTION_V2` | 80%→40% over 32s |
| `extensions` | `[]` | No extensions |

---

## Contract Addresses (Base Mainnet)

All addresses are exported as `ADDRESSES` and `EXTERNAL`:

```typescript
import { ADDRESSES, EXTERNAL } from "liquid-sdk";

// Liquid Protocol contracts
ADDRESSES.FACTORY                  // 0x0000003482fe299E72d4908368044A8A173BE576
ADDRESSES.LP_LOCKER                // 0x00000548732DfA56Be1257cE44D0CFc3B46dDb2A
ADDRESSES.FEE_LOCKER               // 0x000008B9242b7e4432f6c4b1EeAD93562f9Cc94d
ADDRESSES.VAULT                    // 0x000001c5263F4d64CdC343cDA9C8bF961CF8376c
ADDRESSES.HOOK_DYNAMIC_FEE_V2      // 0x2A2F73CDDa098d639bd8Bbcd7dF2bf24E06728cC
ADDRESSES.HOOK_STATIC_FEE_V2       // 0xb2401c5369AaCF62F8d615623C7F68F84da428Cc
ADDRESSES.AIRDROP_V2               // 0x00000C222442512b08446D33dd9754a7F260BE79
ADDRESSES.SNIPER_AUCTION_V2        // 0x000007b64003ee07a69576F98859a0a36b854260
ADDRESSES.SNIPER_UTIL_V2           // 0x000003Ee0cb9B0C82C6C7FCB7b81a9883F285270
ADDRESSES.MEV_BLOCK_DELAY          // 0x0000035D83588954F3c581c3A66251b3F06AD5e4
ADDRESSES.UNIV4_ETH_DEV_BUY        // 0x00000d7DE1f0A3FA7957F5d8A2b97B0E24e5783D
ADDRESSES.POOL_EXTENSION_ALLOWLIST  // 0x000003Afb1b070F037D2871eE0A6b8c8f53F7B77
ADDRESSES.LIQUID_DEPLOYER_LIB      // 0x00000f88b2d37A2006F2F0C8552d22E0b8945202

// External (Uniswap V4 / Base)
EXTERNAL.POOL_MANAGER              // 0x498581fF718922c3f8e6A244956aF099B2652b2b
EXTERNAL.WETH                      // 0x4200000000000000000000000000000000000006
EXTERNAL.UNIVERSAL_ROUTER          // 0x6fF5693b99212Da76ad316178A184AB56D299b43
EXTERNAL.PERMIT2                   // 0x000000000022D473030F116dDEE9F6B43aC78BA3
```

---

## Constants

```typescript
import { FEE, TOKEN } from "liquid-sdk";

FEE.DENOMINATOR           // 1_000_000 (Uniswap V4 fee unit)
FEE.PROTOCOL_FEE_NUMERATOR // 200_000 (20% of LP fees → protocol)
FEE.MAX_LP_FEE            // 100_000 (10% max LP fee)
FEE.MAX_MEV_FEE           // 800_000 (80% max MEV fee)
FEE.BPS                   // 10_000 (basis points denominator)

TOKEN.SUPPLY              // 100_000_000_000n * 10n ** 18n (100B tokens)
TOKEN.DECIMALS            // 18
TOKEN.MAX_EXTENSIONS      // 10
TOKEN.MAX_EXTENSION_BPS   // 9000 (max 90% of supply to extensions)
```

---

## Exported ABIs

All contract ABIs are exported for direct use with viem if needed:

```typescript
import {
  LiquidFactoryAbi,
  LiquidFeeLockerAbi,
  LiquidHookDynamicFeeV2Abi,
  LiquidVaultAbi,
  LiquidSniperAuctionV2Abi,
  LiquidSniperUtilV2Abi,
  LiquidAirdropV2Abi,
  LiquidPoolExtensionAllowlistAbi,
  LiquidMevBlockDelayAbi,
  LiquidLpLockerAbi,
  ERC20Abi,
} from "liquid-sdk";
```

---

## Exported Types

```typescript
import type {
  AirdropInfo,
  DeployTokenParams,
  DeployTokenResult,
  DeploymentConfig,
  DeploymentInfo,
  DevBuyParams,
  ExtensionConfig,
  LiquidSDKConfig,
  LockerConfig,
  MevModuleConfig,
  PoolConfig,
  PoolDynamicConfigVars,
  PoolDynamicFeeVars,
  PoolKey,
  SniperAuctionFeeConfig,
  SniperAuctionState,
  TokenConfig,
  TokenCreatedEvent,
  TokenRewardInfo,
  VaultAllocation,
} from "liquid-sdk";
```

---

## Common Workflows

### 1. Deploy a token and buy some at launch

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const sdk = new LiquidSDK({ publicClient, walletClient });

const result = await sdk.deployToken({
  name: "Agent Token",
  symbol: "AGENT",
  image: "https://example.com/logo.png",
  metadata: JSON.stringify({ description: "Deployed by an AI agent" }),
  devBuy: {
    ethAmount: parseEther("0.01"),
    recipient: account.address,
  },
});

console.log("Token:", result.tokenAddress);
console.log("Pool ID:", result.event.poolId);
```

### 2. Check and collect all rewards for a token

```typescript
// Step 1: Check reward config
const rewards = await sdk.getTokenRewards(tokenAddress);
console.log("Recipients:", rewards.rewardRecipients);
console.log("Splits:", rewards.rewardBps); // e.g. [10000] = 100%

// Step 2: Check if pool is unlocked (MEV protection)
const unlockTime = await sdk.getPoolUnlockTime(result.event.poolId);
const now = BigInt(Math.floor(Date.now() / 1000));

if (now < unlockTime) {
  console.log("Pool still locked until:", new Date(Number(unlockTime) * 1000));
  // Can still try collectRewardsWithoutUnlock
  const txHash = await sdk.collectRewardsWithoutUnlock(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
} else {
  // Full collect + unlock
  const txHash = await sdk.collectRewards(tokenAddress);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
```

### 3. Check and claim fees

```typescript
const fees = await sdk.getFeesToClaim(ownerAddress, tokenAddress);
console.log("Claimable fees:", fees);

if (fees > 0n) {
  const txHash = await sdk.claimFees(ownerAddress, tokenAddress);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Fees claimed in tx:", receipt.transactionHash);
}
```

### 4. Check vault vesting and claim

```typescript
const vault = await sdk.getVaultAllocation(tokenAddress);
const now = BigInt(Math.floor(Date.now() / 1000));

if (now < vault.lockupEndTime) {
  console.log("Vault locked until:", new Date(Number(vault.lockupEndTime) * 1000));
} else {
  const claimable = await sdk.getVaultClaimable(tokenAddress);
  console.log("Claimable from vault:", claimable);

  if (claimable > 0n) {
    const txHash = await sdk.claimVault(tokenAddress);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }
}
```

### 5. Full token status check (no wallet needed)

```typescript
const sdk = new LiquidSDK({ publicClient }); // read-only

const info = await sdk.getTokenInfo(tokenAddress);
console.log(`${info.name} (${info.symbol})`);
console.log("Total supply:", info.totalSupply);
console.log("Hook:", info.deployment.hook);
console.log("Locker:", info.deployment.locker);
console.log("Extensions:", info.deployment.extensions);

const rewards = await sdk.getTokenRewards(tokenAddress);
console.log("Reward recipients:", rewards.rewardRecipients);

const poolConfig = await sdk.getPoolConfig(poolId);
console.log("Base fee:", poolConfig.baseFee, "bps");
console.log("Max LP fee:", poolConfig.maxLpFee, "bps");

const feeState = await sdk.getPoolFeeState(poolId);
console.log("Current reference tick:", feeState.referenceTick);

const auction = await sdk.getAuctionState(poolId);
console.log("Auction round:", auction.round);
console.log("Current sniper fee:", auction.currentFee);
```

### 6. Deploy with custom reward splits

```typescript
const result = await sdk.deployToken({
  name: "Split Token",
  symbol: "SPLIT",
  rewardAdmins: [deployer, partner],
  rewardRecipients: [deployer, partner],
  rewardBps: [7000, 3000], // 70% deployer, 30% partner
});
```

### 7. Update reward recipient (e.g., rotate to a new wallet)

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
// Only the admin at index N can update recipient at index N
const txHash = await sdk.updateRewardRecipient(
  tokenAddress,
  0n,              // index
  newWalletAddress,
);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

---

## Architecture Notes

- **Chain:** Base mainnet only (chain ID 8453)
- **Pool type:** Uniswap V4 with custom hooks (dynamic or static fee)
- **Token supply:** Always 100 billion (100,000,000,000) with 18 decimals
- **LP locking:** Liquidity is locked in the LP Locker — it cannot be rugged
- **Fee flow:** Trading fees → LP Locker → distributed to reward recipients by BPS
- **MEV protection:** After deployment, pool is locked for N blocks. `collectRewards` will revert with `ManagerLocked` during this period. Use `collectRewardsWithoutUnlock` or wait.
- **Extensions:** Up to 10 extensions per token, max 90% of supply allocated to extensions total
- **Dev buy:** Not a separate step — ETH is swapped in the same transaction as deployment

---

## Error Handling

All write methods throw viem errors on failure. Common revert reasons:

| Error | Meaning | Resolution |
|-------|---------|------------|
| `ManagerLocked` | Pool is still in MEV lock period | Wait for `getPoolUnlockTime()` to pass, or use `collectRewardsWithoutUnlock` |
| `NoFeesToClaim` | No fees accrued yet | Wait for trading activity |
| `Unauthorized` | Caller is not the admin/owner | Use the correct wallet |
| `AlreadyClaimed` | Airdrop already claimed | Check `getAirdropClaimable()` first |
| `LockupNotEnded` | Vault lockup period hasn't passed | Check `getVaultAllocation().lockupEndTime` |
