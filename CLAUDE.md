# CLAUDE.md — Liquid Protocol SDK Agent Guide

> Agent context file for AI-assisted development with the Liquid Protocol SDK on Base.

---

## What Is This Project?

**liquid-sdk** (`v0.1.0`) is a TypeScript SDK for the Liquid Protocol token launcher on Base (chain ID 8453). It deploys ERC-20 tokens with permanent, locked Uniswap V4 liquidity pools and provides read/write helpers for pool state, fee claiming, vaults, airdrops, and auctions.

---

## Core Mental Model

```
User calls sdk.deployToken(params)
  └─► Factory deploys token + Uniswap V4 pool
       ├─► Hook (Dynamic Fee V2) controls LP fee (0.5% – 5%)
       ├─► MEV module charges ~80% fee decaying to 5% over 30s (sniper protection)
       ├─► LP Locker permanently locks all liquidity (5-position "Project" layout)
       ├─► Fee Locker accumulates creator rewards in WETH (FeeIn.Paired)
       └─► Optional extensions: dev buy, vault, airdrop, presale
```

Tokens are:
- Fixed supply: 100B (100,000,000,000 x 10^18), 18 decimals
- Always paired with WETH on Uniswap V4
- Swappable via Universal Router + Permit2 (Uniswap V4 flow)

---

## Chain & RPC

```
Chain:    Base (mainnet)
Chain ID: 8453
RPC:      https://mainnet.base.org  (rate-limited — use Alchemy/Infura for production)
Explorer: https://basescan.org
```

---

## Key Contract Addresses (Base Mainnet)

```typescript
// From src/constants.ts — ADDRESSES
const ADDRESSES = {
  FACTORY:                    "0x04F1a284168743759BE6554f607a10CEBdB77760",
  POOL_EXTENSION_ALLOWLIST:   "0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa",
  FEE_LOCKER:                 "0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF",
  LP_LOCKER_FEE_CONVERSION:   "0x77247fCD1d5e34A3703AcA898A591Dc7422435f3",
  VAULT:                      "0xdFCCC93257c20519A9005A2281CFBdF84836d50E",
  HOOK_DYNAMIC_FEE_V2:        "0x80E2F7dC8C2C880BbC4BDF80A5Fb0eB8B1DB68CC",
  HOOK_STATIC_FEE_V2:         "0x9811f10Cd549c754Fa9E5785989c422A762c28cc",
  SNIPER_AUCTION_V2:          "0x187e8627c02c58F31831953C1268e157d3BfCefd",
  SNIPER_UTIL_V2:             "0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f",
  MEV_DESCENDING_FEES:        "0x8D6B080e48756A99F3893491D556B5d6907b6910",
  AIRDROP_V2:                 "0x1423974d48f525462f1c087cBFdCC20BDBc33CdD",
  UNIV4_ETH_DEV_BUY:          "0x5934097864dC487D21A7B4e4EEe201A39ceF728D",
  UNIV3_ETH_DEV_BUY:          "0x376028cfb6b9A120E24Aa14c3FAc4205179c0025",
  PRESALE_ETH_TO_CREATOR:     "0x3bca63EcB49d5f917092d10fA879Fdb422740163",
  PRESALE_ALLOWLIST:           "0xCBb4ccC4B94E23233c14759f4F9629F7dD01f10B",
} as const;

// From src/constants.ts — EXTERNAL
const EXTERNAL = {
  POOL_MANAGER:     "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  WETH:             "0x4200000000000000000000000000000000000006",
  UNIVERSAL_ROUTER: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
  PERMIT2:          "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;
```

---

## SDK Setup

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-sdk";

const publicClient = createPublicClient({ chain: base, transport: http() });

// Read-only usage
const sdk = new LiquidSDK({ publicClient });

// With write access
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({ chain: base, transport: http(), account });
const sdkRW = new LiquidSDK({ publicClient, walletClient });
```

---

## SDK Methods Reference

### Token Deployment

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  // Optional: image, metadata, context, tokenAdmin, salt
  // Optional: hook, pairedToken, tickIfToken0IsLiquid, tickSpacing, poolData
  // Optional: locker, rewardAdmins, rewardRecipients, rewardBps
  // Optional: tickLower, tickUpper, positionBps, lockerData
  // Optional: mevModule, mevModuleData
  // Optional: extensions, devBuy
});
// Returns: { tokenAddress, txHash, event: TokenCreatedEvent }
```

**With dev buy (ETH -> token swap at launch):**
```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"),
    recipient: account.address,
  },
});
```

### Deployment Defaults

| Parameter | Default Value |
|-----------|---------------|
| `hook` | `HOOK_DYNAMIC_FEE_V2` |
| `pairedToken` | `WETH` |
| `tickIfToken0IsLiquid` | `-233160` (~$15K MC at $2000/ETH) |
| `tickSpacing` | `60` |
| `locker` | `LP_LOCKER_FEE_CONVERSION` |
| `rewardRecipients` | `[deployer]` (100%) |
| `positionBps` | `[1000, 5000, 1500, 2000, 500]` (5-position layout) |
| `mevModule` | `MEV_DESCENDING_FEES` (80% -> 5% over 30s) |
| `lockerData` | `FeeIn.Paired` (WETH-only fee accumulation) |

### Pool & Token Info (read-only)

```typescript
await sdk.getDeploymentInfo(tokenAddress)    // → { token, hook, locker, extensions }
await sdk.getTokenInfo(tokenAddress)         // → { address, name, symbol, decimals, totalSupply, deployment }
await sdk.getPoolConfig(poolId)              // → PoolDynamicConfigVars
await sdk.getPoolFeeState(poolId)            // → PoolDynamicFeeVars (includes lastSwapTimestamp)
await sdk.getPoolCreationTimestamp(poolId)    // → bigint
await sdk.isLiquidToken0(poolId)             // → boolean
```

### Fee Claims

```typescript
await sdk.getAvailableFees(owner, token)     // → bigint (uncollected fees)
await sdk.getFeesToClaim(owner, token)        // → bigint (collected, claimable WETH)
await sdk.claimFees(owner, token)            // → Hash (write)
await sdk.getTokenRewards(token)             // → TokenRewardInfo (poolKey, recipients, bps)
await sdk.collectRewards(token)              // → Hash (write - collect from LP positions)
await sdk.collectRewardsWithoutUnlock(token)  // → Hash (write)
await sdk.updateRewardRecipient(token, idx, newRecipient) // → Hash (write)
```

### Vault

```typescript
await sdk.getVaultAllocation(token)          // → VaultAllocation
await sdk.getVaultClaimable(token)           // → bigint
await sdk.claimVault(token)                  // → Hash (write)
```

### Airdrop

```typescript
await sdk.getAirdropInfo(token)              // → AirdropInfo
await sdk.getAirdropClaimable(token, recipient, allocatedAmount) // → bigint
await sdk.claimAirdrop(token, recipient, allocatedAmount, proof) // → Hash (write)
```

### Sniper Auction

```typescript
await sdk.getAuctionState(poolId)            // → SniperAuctionState
await sdk.getAuctionFeeConfig(poolId)        // → SniperAuctionFeeConfig
await sdk.getAuctionDecayStartTime(poolId)   // → bigint
await sdk.getAuctionMaxRounds()              // → bigint
await sdk.getAuctionGasPriceForBid(gasPeg, amount) // → bigint
```

### Factory Status

```typescript
await sdk.isFactoryDeprecated()              // → boolean
await sdk.isLockerEnabled(locker, hook)      // → boolean
await sdk.isExtensionEnabled(extension)      // → boolean
```

---

## Pool Key Structure

For any Liquid token, the pool key is always:

```typescript
const poolKey = {
  currency0:   EXTERNAL.WETH,              // always WETH (0x4200...)
  currency1:   tokenAddress,               // deployed token (always > WETH numerically)
  fee:         8388608,                     // 0x800000 — dynamic fee flag
  tickSpacing: 60,
  hooks:       ADDRESSES.HOOK_DYNAMIC_FEE_V2,
};
```

> WETH < token address numerically — Uniswap V4 requires currency0 < currency1.

Pool ID: `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))`

You can also retrieve the pool key from the SDK:
```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
const poolKey = rewards.poolKey;
```

---

## Swap Architecture (not in SDK — manual Universal Router calls)

The SDK does NOT include a swap method. Swaps require direct Universal Router interaction.
See `test-swap.ts` (buy/ETH->token) and `test-sell.ts` (sell/token->ETH) for working examples.

### Uniswap V4 Action Constants (from Actions.sol)

```typescript
// Universal Router commands
const V4_SWAP     = 0x10;
const WRAP_ETH    = 0x0b;
const UNWRAP_WETH = 0x0c;

// V4 Router actions (from v4-periphery/src/libraries/Actions.sol)
const SWAP_EXACT_IN_SINGLE = 0x06;
const SWAP_EXACT_IN        = 0x07;
const SETTLE               = 0x0b;
const SETTLE_ALL           = 0x0c;
const TAKE                 = 0x0e;
const TAKE_ALL             = 0x0f;
```

### Buy (ETH -> Token)

```
Universal Router commands: 0x0b 0x10  (WRAP_ETH, V4_SWAP)

V4_SWAP actions: 0x06 0x0b 0x0f  (SWAP_EXACT_IN_SINGLE, SETTLE, TAKE_ALL)
  - zeroForOne = true  (buying with currency0/WETH -> currency1/token)
  - SETTLE (not SETTLE_ALL) with payerIsUser = false (router pays from its own WETH)
  - TAKE_ALL receives the output token
```

### Sell (Token -> ETH)

```
Prerequisites:
  1. token.approve(PERMIT2, maxUint256)
  2. Permit2.approve(token, UNIVERSAL_ROUTER, maxUint160, expiration)

Universal Router commands: 0x10 0x0c  (V4_SWAP, UNWRAP_WETH)

V4_SWAP actions: 0x06 0x0c 0x0f  (SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL)
  - zeroForOne = false  (selling currency1/token -> currency0/WETH)
  - SETTLE_ALL settles the input token via Permit2
  - TAKE_ALL receives the output WETH (then unwrapped by UNWRAP_WETH command)
```

### Common Swap Bugs

| Error | Cause | Fix |
|-------|-------|-----|
| `UnsupportedAction(uint256)` | Wrong action byte values | Use exact constants from Actions.sol above |
| `CurrencyNotSettled()` | Using SETTLE when should use SETTLE_ALL, or vice versa | Sell -> SETTLE_ALL. Buy -> SETTLE (payerIsUser=false) |
| Rate limit (429) | Public RPC throttled | Add delays between calls, or use paid RPC |

---

## Fee Logic

| Layer | Rate | Notes |
|-------|------|-------|
| Dynamic LP Fee | 0.5% – 5% | Scales with price volatility |
| Protocol Fee | 20% of LP fee | Goes to Liquid Protocol team |
| MEV Fee | 5% – 80% | Decays from 80% to 5% over 30s after pool launch |

Fee denominator: `1,000,000`. So `5000 = 0.5%`, `50000 = 5%`, `666777 = ~66.7%`.

### Fee Claiming Flow

```typescript
// Step 1: Collect from LP positions into FeeLocker (anyone can call)
await sdk.collectRewards(tokenAddress);

// Step 2: Check claimable balance
const claimable = await sdk.getFeesToClaim(feeOwnerAddress, tokenAddress);

// Step 3: Claim WETH to wallet
await sdk.claimFees(feeOwnerAddress, tokenAddress);
```

---

## Default Position Layout (5-position "Project" layout)

```typescript
const DEFAULT_POSITIONS = {
  tickLower:   [-233160, -216060, -202020, -155040, -141060],
  tickUpper:   [-216060, -155040, -155040, -120060, -120060],
  positionBps: [1000,     5000,    1500,    2000,    500],
  // Total: 10000 BPS = 100%
};
```

---

## Exported ABIs

The SDK exports 10 ABIs:

| ABI | Contract |
|-----|----------|
| `LiquidFactoryAbi` | Factory (deployToken, tokenDeploymentInfo) |
| `LiquidFeeLockerAbi` | FeeLocker (claim, availableFees, feesToClaim) |
| `LiquidHookDynamicFeeV2Abi` | Hook (poolConfigVars, poolFeeVars, liquidIsToken0) |
| `LiquidVaultAbi` | Vault (allocation, claim, amountAvailableToClaim) |
| `LiquidSniperAuctionV2Abi` | Auction (round, gasPeg, getFee, feeConfig) |
| `LiquidSniperUtilV2Abi` | Sniper (bidInAuction, getTxGasPriceForBidAmount) |
| `LiquidAirdropV2Abi` | Airdrop (airdrops, claim, amountAvailableToClaim) |
| `LiquidPoolExtensionAllowlistAbi` | Extension allowlist |
| `LiquidLpLockerFeeConversionAbi` | LP Locker (tokenRewards, collectRewards) |
| `ERC20Abi` | Standard ERC-20 (name, symbol, balanceOf, approve, transfer) |

---

## Important Invariants

1. WETH is always `currency0`, token is always `currency1` — never reverse this.
2. The dynamic fee flag `0x800000` (8388608) is NOT an actual fee — it signals hook-controlled fees.
3. LP is permanently locked — there is no unlock or withdraw path.
4. Reward BPS splits are immutable after deployment. Only recipient/admin addresses can change.
5. Never use `amountOutMinimum = 0` in production swaps.
6. All write methods require `walletClient` with `account` — they throw if not provided.
7. `DEFAULT_POSITIONS` arrays are `readonly` — spread them (`[...DEFAULT_POSITIONS.tickLower]`) when assigning to mutable arrays.

---

## Project Structure

```
src/
  client.ts       — LiquidSDK class (all methods)
  types.ts        — TypeScript interfaces (20 types)
  constants.ts    — Addresses, fee constants, positions, chain config
  index.ts        — Public exports
  abis/           — 10 contract ABI files + index

test/
  unit/           — 5 test files (exports, constants, ABIs, client, deploy-params)
  integration/    — read-contracts.test.ts (live Base mainnet reads)
  build.test.ts   — Verifies npm run build produces output

test-deploy.ts    — Example: deploy a token (with optional devBuy)
test-swap.ts      — Example: buy token with ETH via Universal Router
test-sell.ts      — Example: sell token for ETH via Universal Router
test-claim-fees.ts — Example: collect and claim protocol fees
```

---

## Build & Test

```bash
npm run build        # tsup → dist/
npm run typecheck    # tsc --noEmit
npm test             # vitest (130 tests)
npm run test:unit    # unit tests only
npm run test:integration  # live contract reads (needs RPC)
```

---

## Audit & Source

- Forked from: Clanker v4
- Audits: 0xMacro (A-3), Cantina
- Source: https://github.com/Liquid-Protocol-Ops/SDK
- SDK: `npm install liquid-sdk`
