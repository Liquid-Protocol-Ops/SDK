# Liquid Protocol SDK

TypeScript SDK for the Liquid Protocol token launcher on Base. Deploy tokens, manage pools, and claim fees using [viem](https://viem.sh).

## Installation

```bash
npm install liquid-sdk viem
```

> **Defaults**: Static 1% fee (both buy and sell), 5-position Liquid layout, Sniper Auction MEV (80%→40% over 32s, 5 rounds), tick spacing 200, starting tick -230400 (~10 ETH market cap).

### Default Liquidity Positions

| # | Supply | Tick Range | Market Cap Range (@$2,000/ETH) |
|---|--------|-----------|-------------------------------|
| 1 | 10% | -230,400 → -216,000 | ~$20K → ~$83K |
| 2 | 50% | -216,000 → -155,000 | ~$83K → ~$37M |
| 3 | 15% | -202,000 → -155,000 | ~$338K → ~$37M |
| 4 | 20% | -155,000 → -120,000 | ~$37M → ~$1.2B |
| 5 | 5% | -141,000 → -120,000 | ~$151M → ~$1.2B |

## Quick Start

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

const liquid = new LiquidSDK({ walletClient });
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

### Deploy with Custom Market Cap Positions

```typescript
import { createDefaultPositions, createPositionsUSD } from "liquid-sdk";

// Use default 3-tranche split ($500K / $10M / $1B) at current ETH price
const positions = createDefaultPositions(20_000, 2070); // $20K start, $2070/ETH

const result = await liquid.deployToken({
  name: "My Token",
  symbol: "MTK",
  ...positions, // tickLower, tickUpper, positionBps, tickIfToken0IsLiquid
});

// Or define fully custom tranches
const custom = createPositionsUSD(50_000, 2070, [
  { upperMarketCapUSD: 1_000_000, supplyPct: 30 },
  { upperMarketCapUSD: 50_000_000, supplyPct: 50 },
  { upperMarketCapUSD: 500_000_000, supplyPct: 20 },
]);
```

### Deploy with Custom Fees

```typescript
import { ADDRESSES, encodeStaticFeePoolData, encodeDynamicFeePoolData } from "liquid-sdk";

// Static 2% fee
const result = await liquid.deployToken({
  name: "Custom Fee Token",
  symbol: "CFT",
  poolData: encodeStaticFeePoolData(200, 200), // 2% both directions
});

// Dynamic fee (1%-5% range)
const result2 = await liquid.deployToken({
  name: "Dynamic Token",
  symbol: "DYN",
  hook: ADDRESSES.HOOK_DYNAMIC_FEE_V2,
  poolData: encodeDynamicFeePoolData({
    baseFeeBps: 100,
    maxFeeBps: 500,
    referenceTickFilterPeriod: 30,
    resetPeriod: 120,
    resetTickFilter: 200,
    feeControlNumerator: 500000000n,
    decayFilterBps: 7500,
  }),
});
```

## Sniper Auction (MEV Bidding)

Bid for early access to newly launched tokens. The SDK handles WETH wrapping, approvals, gas price encoding, and timing automatically.

```typescript
import { LiquidSDK, EXTERNAL } from "liquid-sdk";

// 1. Get auction state & pool key
const auction = await liquid.getAuctionState(poolId);
const rewards = await liquid.getTokenRewards(tokenAddress);
const zeroForOne = rewards.poolKey.currency0.toLowerCase() === EXTERNAL.WETH.toLowerCase();

// 2. Calculate gas price for your bid
const gasPrice = await liquid.getAuctionGasPriceForBid(auction.gasPeg, parseEther("0.001"));

// 3. Wait for auction block, then fire
const result = await liquid.bidInAuction({
  poolKey: rewards.poolKey,
  zeroForOne,
  amountIn: parseEther("0.001"),     // WETH to swap (auto-wrapped)
  amountOutMinimum: 0n,
  round: auction.round,
  bidAmount: parseEther("0.0005"),   // ETH bid (msg.value)
}, gasPrice);
```

## Token Discovery

```typescript
// Get all tokens
const allTokens = await liquid.getTokens();

// Get tokens by deployer
const myTokens = await liquid.getTokens({ deployer: myAddress });

// Look up a single token (fast, indexed)
const token = await liquid.getTokenEvent(tokenAddress);

// Paginate with block ranges
const page = await liquid.getTokens({ fromBlock: 20000000n, toBlock: 20100000n });
```

## Read Token Info

```typescript
const info = await liquid.getTokenInfo(tokenAddress);
console.log(info.name, info.symbol, info.decimals);
console.log("Hook:", info.deployment.hook);
console.log("Locker:", info.deployment.locker);
```

## Claim Fees & Rewards

```typescript
// LP Rewards
const rewards = await liquid.getTokenRewards(tokenAddress);
await liquid.collectRewards(tokenAddress);

// Fee claims
const claimable = await liquid.getFeesToClaim(ownerAddress, tokenAddress);
await liquid.claimFees(ownerAddress, tokenAddress);
```

## Vault (Token Vesting)

```typescript
const allocation = await liquid.getVaultAllocation(tokenAddress);
const claimable = await liquid.getVaultClaimable(tokenAddress);
await liquid.claimVault(tokenAddress);
```

## Agent Skills

The SDK ships with **agent skill files** — self-contained markdown guides that AI agents can load into their context to autonomously use the SDK. Find them in `node_modules/liquid-sdk/skills/` after install.

| Skill | File | What it teaches |
|-------|------|-----------------|
| **Deploy Token** | `skills/deploy-token.md` | Full deployment workflows — minimal deploy, dev buy, custom fees, custom positions, reward splits, validation rules |
| **Bid in Auction** | `skills/bid-in-auction.md` | MEV sniper auction — WETH handling, gas price encoding, block timing, automated sniper example |
| **Index Tokens** | `skills/index-tokens.md` | Token discovery — bulk queries, single lookup, pagination, real-time monitoring, data enrichment |

### Using Skills with Your Agent

```python
# Python — load a skill into your agent's context
with open("node_modules/liquid-sdk/skills/deploy-token.md") as f:
    agent.system_prompt += f.read()
```

```typescript
// TypeScript — read skill for an MCP server or agent framework
import { readFileSync } from "fs";
const skill = readFileSync("node_modules/liquid-sdk/skills/bid-in-auction.md", "utf-8");
```

For Claude Code, reference skills in your `CLAUDE.md`:
```
For token deployment, follow the instructions in node_modules/liquid-sdk/skills/deploy-token.md
```

### Additional Agent Docs

| File | Purpose |
|------|---------|
| `AGENT_README.md` | Complete API reference with every method, type, and default (700+ lines) |
| `llms.txt` | Compact summary for LLM context windows |
| `CLAUDE.md` | Agent guide with architecture, defaults, and invariants |

## Constants & ABIs

All production addresses, fee parameters, and contract ABIs are exported:

```typescript
import {
  ADDRESSES,        // Liquid Protocol contract addresses
  EXTERNAL,         // External protocol addresses (PoolManager, WETH, etc.)
  FEE,              // Fee constants (denominator, protocol fee, max fees)
  TOKEN,            // Token constants (supply, decimals, max extensions)
  DEFAULTS,         // Default deploy config (hook, fees, MEV, ticks)
  POOL_POSITIONS,   // Position presets (Standard, Liquid)
  DEFAULT_CHAIN,    // base chain object
  DEFAULT_CHAIN_ID, // 8453

  // Tick math & positions
  getTickFromMarketCapETH,
  getTickFromMarketCapUSD,
  marketCapFromTickETH,
  marketCapFromTickUSD,
  createPositions,
  createPositionsUSD,
  createDefaultPositions,
  describePositions,

  // Encoding helpers
  encodeStaticFeePoolData,
  encodeDynamicFeePoolData,
  encodeSniperAuctionData,

  // ABIs for direct contract interaction
  LiquidFactoryAbi,
  LiquidFeeLockerAbi,
  LiquidHookDynamicFeeV2Abi,
  LiquidLpLockerAbi,
  LiquidVaultAbi,
  LiquidSniperAuctionV2Abi,
  LiquidSniperUtilV2Abi,
  LiquidAirdropV2Abi,
  LiquidTokenAbi,
  LiquidUniv4EthDevBuyAbi,
  LiquidPoolExtensionAllowlistAbi,
  LiquidMevBlockDelayAbi,
  ERC20Abi,
} from "liquid-sdk";
```

## API Reference

### `LiquidSDK`

#### Constructor

```typescript
new LiquidSDK({ walletClient, publicClient? })
```

- `walletClient` (optional) - viem `WalletClient` for write operations
- `publicClient` (optional) - viem `PublicClient` connected to Base (auto-created if omitted)

#### Methods

| Method | Description | Wallet |
|--------|-------------|:------:|
| **Deployment** | | |
| `deployToken(params)` | Deploy token + Uniswap V4 pool | Yes |
| `buildDevBuyExtension(devBuy)` | Build dev buy extension config | No |
| **Token Discovery** | | |
| `getTokens(options?)` | Query deployed tokens with filters | No |
| `getTokenEvent(token)` | Look up single token (indexed, fast) | No |
| `getDeployedTokens(deployer)` | Get tokens by deployer | No |
| **Token Info** | | |
| `getDeploymentInfo(token)` | Hook, locker, extensions | No |
| `getTokenInfo(token)` | ERC20 info + deployment details | No |
| **Token Updates** | | |
| `updateImage(token, url)` | Update token image (admin) | Yes |
| `updateMetadata(token, json)` | Update token metadata (admin) | Yes |
| **Pool State** | | |
| `getPoolConfig(poolId)` | Dynamic fee pool configuration | No |
| `getPoolFeeState(poolId)` | Current fee state variables | No |
| `getPoolCreationTimestamp(poolId)` | Pool creation timestamp | No |
| `isLiquidToken0(poolId)` | Token sort order in pool | No |
| **Fee Claims** | | |
| `getAvailableFees(owner, token)` | Total unlocked fees | No |
| `getFeesToClaim(owner, token)` | Claimable fee balance | No |
| `claimFees(owner, token)` | Claim accumulated fees | Yes |
| **LP Rewards** | | |
| `getTokenRewards(token)` | Reward config (recipients, bps, poolKey) | No |
| `collectRewards(token)` | Collect + unlock LP fees | Yes |
| `collectRewardsWithoutUnlock(token)` | Collect fees only | Yes |
| `updateRewardRecipient(token, idx, addr)` | Change reward recipient | Yes |
| **Vault** | | |
| `getVaultAllocation(token)` | Vault vesting state | No |
| `getVaultClaimable(token)` | Vested amount available | No |
| `claimVault(token)` | Claim vested tokens | Yes |
| **Airdrop** | | |
| `getAirdropInfo(token)` | Airdrop state | No |
| `getAirdropClaimable(token, recipient, amount)` | Claimable for recipient | No |
| `claimAirdrop(token, recipient, amount, proof)` | Claim airdrop | Yes |
| **Sniper Auction** | | |
| `getAuctionState(poolId)` | Round, gasPeg, fee, nextBlock | No |
| `getAuctionFeeConfig(poolId)` | Fee decay parameters | No |
| `getAuctionDecayStartTime(poolId)` | When fee decay started | No |
| `getAuctionMaxRounds()` | Max auction rounds | No |
| `getAuctionGasPriceForBid(gasPeg, bid)` | Calculate gas price for bid | No |
| `bidInAuction(params, gasPrice)` | Bid + swap (auto-wraps WETH) | Yes |
| **MEV Protection** | | |
| `getMevBlockDelay()` | Configured block delay | No |
| `getPoolUnlockTime(poolId)` | When MEV lock expires | No |
| **Factory** | | |
| `isFactoryDeprecated()` | Factory still active? | No |
| `isLockerEnabled(locker, hook)` | Locker/hook pair enabled? | No |
| `isExtensionEnabled(extension)` | Extension on allowlist? | No |

## Production Addresses

All contracts are deployed on **Base** (chain ID 8453):

| Contract | Address |
|----------|---------|
| Factory | `0x04F1a284168743759BE6554f607a10CEBdB77760` |
| Hook Dynamic Fee V2 | `0x80E2F7dC8C2C880BbC4BDF80A5Fb0eB8B1DB68CC` |
| Hook Static Fee V2 | `0x9811f10Cd549c754Fa9E5785989c422A762c28cc` |
| Fee Locker | `0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF` |
| LP Locker Fee Conversion | `0x77247fCD1d5e34A3703AcA898A591Dc7422435f3` |
| Vault | `0xdFCCC93257c20519A9005A2281CFBdF84836d50E` |
| Sniper Auction V2 | `0x187e8627c02c58F31831953C1268e157d3BfCefd` |
| Sniper Util V2 | `0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f` |
| MEV Descending Fees | `0x8D6B080e48756A99F3893491D556B5d6907b6910` |
| Airdrop V2 | `0x1423974d48f525462f1c087cBFdCC20BDBc33CdD` |
| Pool Extension Allowlist | `0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa` |
| Univ4 ETH Dev Buy | `0x5934097864dC487D21A7B4e4EEe201A39ceF728D` |

## License

MIT
