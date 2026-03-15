# Skill: Bid in a Sniper Auction (MEV)

You are an AI agent that participates in Liquid Protocol's sniper auction system. This skill teaches you how to bid for early access to newly launched tokens through the MEV auction mechanism on Base.

## How the Sniper Auction Works

When a new token is deployed on Liquid Protocol, a **sniper auction** activates to price early trading activity and capture MEV. Here's the mechanism:

1. **Fee decay**: The auction starts with an **80% fee** on swaps and decays linearly to **40% over 32 seconds**
2. **Gas price bidding**: Bidders compete by setting their transaction gas price **above the pool's gas peg**. The difference between your gas price and the gas peg determines your bid amount
3. **Rounds**: The auction runs in discrete rounds, each lasting a configurable number of blocks. Each round has its own auction window
4. **Winner takes the swap**: The highest gas-price transaction in each block wins the right to swap at the current fee rate
5. **Revenue distribution**: Auction revenue (bid amounts) flows to the protocol and LP holders

The auction is **not** a separate step from trading — it's a modified swap where your gas price encodes your bid.

## Prerequisites

```bash
npm install liquid-sdk viem
```

You need:
- A **private key** with ETH on Base
- The **token address** or **pool ID** of a recently launched token
- An **RPC endpoint** for Base mainnet

## Setup

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const sdk = new LiquidSDK({ publicClient, walletClient });
```

## Step-by-Step: Bidding in an Auction

### Step 1: Get the Auction State

```typescript
// You need the pool ID — get it from deployment or token lookup
const tokenEvent = await sdk.getTokenEvent(tokenAddress);
const poolId = tokenEvent.poolId;

// Query current auction state
const auction = await sdk.getAuctionState(poolId);

console.log("Next auction block:", auction.nextAuctionBlock);
console.log("Current round:", auction.round);
console.log("Gas peg:", auction.gasPeg);
console.log("Current fee:", auction.currentFee); // in uniBps (800000 = 80%)
```

**Key fields:**
| Field | Type | Description |
|-------|------|-------------|
| `nextAuctionBlock` | `bigint` | Block number when next auction round starts |
| `round` | `bigint` | Current round number (must match when bidding) |
| `gasPeg` | `bigint` | Base gas price reference — you bid by exceeding this |
| `currentFee` | `number` | Current MEV fee in uniBps (decays from 800000→400000) |

### Step 2: Check Auction Fee Config

```typescript
const feeConfig = await sdk.getAuctionFeeConfig(poolId);

console.log("Starting fee:", feeConfig.startingFee);     // 800000 (80%)
console.log("Ending fee:", feeConfig.endingFee);          // 400000 (40%)
console.log("Seconds to decay:", feeConfig.secondsToDecay); // 32n
```

### Step 3: Check Timing

```typescript
// When did fee decay start?
const decayStart = await sdk.getAuctionDecayStartTime(poolId);
const now = BigInt(Math.floor(Date.now() / 1000));
const elapsed = now - decayStart;

console.log("Seconds since decay started:", elapsed);
// If elapsed > secondsToDecay, fee is at the floor (endingFee)

// How many rounds total?
const maxRounds = await sdk.getAuctionMaxRounds();
console.log("Max auction rounds:", maxRounds);

// Is this round still active?
const currentBlock = await publicClient.getBlockNumber();
console.log("Current block:", currentBlock);
console.log("Next auction block:", auction.nextAuctionBlock);
// If currentBlock < nextAuctionBlock, the current round is still active
```

### Step 4: Calculate Gas Price for Your Bid

```typescript
const desiredBidAmount = parseEther("0.01"); // How much ETH you want to bid

// SDK calculates the exact gas price needed
const requiredGasPrice = await sdk.getAuctionGasPriceForBid(
  auction.gasPeg,
  desiredBidAmount,
);

console.log("Required gas price:", requiredGasPrice);
// This is the maxFeePerGas you must set on your transaction
```

**The formula:** `bidAmount = (txGasPrice - gasPeg) * paymentPerGasUnit`. The utility contract solves for `txGasPrice` given your desired `bidAmount`.

### Step 5: Get the Pool Key

```typescript
// The pool key identifies the Uniswap V4 pool for the swap
const rewards = await sdk.getTokenRewards(tokenAddress);
const poolKey = rewards.poolKey;

// poolKey contains:
// .currency0  — lower-sorted token (WETH or the Liquid token)
// .currency1  — higher-sorted token
// .fee        — fee tier
// .tickSpacing — tick spacing (200)
// .hooks      — hook contract address
```

### Step 6: Execute the Bid

```typescript
const result = await sdk.bidInAuction(
  {
    poolKey: rewards.poolKey,
    zeroForOne: true,               // true = buying tokens with ETH
    amountIn: parseEther("0.1"),    // amount of ETH to swap
    amountOutMinimum: 0n,           // set slippage protection (0 = no minimum)
    round: auction.round,           // must match current on-chain round
    bidAmount: desiredBidAmount,    // ETH bid (sent as msg.value)
  },
  requiredGasPrice,                 // calculated gas price from step 4
);

console.log("Bid tx:", result.txHash);

// Wait for confirmation
const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash });
console.log("Status:", receipt.status); // "success" or "reverted"
```

## Complete Example: Automated Auction Sniper

```typescript
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

async function snipeToken(tokenAddress: `0x${string}`, bidETH: string, swapETH: string) {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
  const sdk = new LiquidSDK({ publicClient, walletClient });

  // 1. Look up the token
  const tokenEvent = await sdk.getTokenEvent(tokenAddress);
  if (!tokenEvent) throw new Error("Token not found");

  console.log(`Sniping ${tokenEvent.tokenName} (${tokenEvent.tokenSymbol})`);
  console.log(`Pool ID: ${tokenEvent.poolId}`);

  // 2. Check auction state
  const auction = await sdk.getAuctionState(tokenEvent.poolId);
  console.log(`Auction round: ${auction.round}, Fee: ${Number(auction.currentFee) / 10000}%`);

  // 3. Check if auction is still active
  const maxRounds = await sdk.getAuctionMaxRounds();
  if (auction.round >= maxRounds) {
    console.log("Auction ended — trading at normal fees now");
    return;
  }

  // 4. Get pool key for the swap
  const rewards = await sdk.getTokenRewards(tokenAddress);

  // 5. Calculate gas price for desired bid
  const bidAmount = parseEther(bidETH);
  const gasPrice = await sdk.getAuctionGasPriceForBid(auction.gasPeg, bidAmount);

  console.log(`Bid amount: ${formatEther(bidAmount)} ETH`);
  console.log(`Required gas price: ${gasPrice}`);

  // 6. Execute the bid
  const result = await sdk.bidInAuction(
    {
      poolKey: rewards.poolKey,
      zeroForOne: true,
      amountIn: parseEther(swapETH),
      amountOutMinimum: 0n,       // In production, calculate proper slippage!
      round: auction.round,
      bidAmount,
    },
    gasPrice,
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash });
  console.log(`Bid ${receipt.status === "success" ? "WON" : "FAILED"}: ${result.txHash}`);
}

// Usage
await snipeToken("0x...", "0.005", "0.1"); // bid 0.005 ETH, swap 0.1 ETH
```

## BidInAuctionParams Reference

```typescript
interface BidInAuctionParams {
  poolKey: PoolKey;        // The Uniswap V4 pool key (get from getTokenRewards)
  zeroForOne: boolean;     // true = ETH→token, false = token→ETH
  amountIn: bigint;        // Amount of input token to swap (in wei)
  amountOutMinimum: bigint;// Minimum output (slippage protection)
  round: bigint;           // Must match current on-chain auction round
  bidAmount: bigint;       // ETH bid amount (sent as msg.value)
}

interface BidInAuctionResult {
  txHash: Hash;
}
```

## Auction Parameters (Defaults)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Starting fee | 800,000 (80%) | Fee at auction start |
| Ending fee | 400,000 (40%) | Fee after decay completes |
| Decay period | 32 seconds | Time for fee to decay from start to end |
| Gas peg | Dynamic | Base gas price, updated per round |
| Max rounds | Contract-defined | Total auction rounds per token |

## Timing Strategy

The auction fee **decays over time**, so there's a tradeoff:

- **Bid early** (high fee): You pay up to 80% of the swap as a fee, but you get the tokens before others. Useful if you expect rapid price appreciation.
- **Bid late** (lower fee): The fee decays to 40% over 32 seconds. You pay less in fees but risk being outbid or missing the auction window.
- **Wait for auction to end**: After all rounds complete, trading is at normal pool fees (typically 1%). No auction mechanics apply.

```typescript
// Check current fee percentage
const feePercent = auction.currentFee / 10000; // e.g., 80.0, 60.5, 40.0
console.log(`Current fee: ${feePercent}%`);

// Check fee decay progress
const feeConfig = await sdk.getAuctionFeeConfig(poolId);
const decayStart = await sdk.getAuctionDecayStartTime(poolId);
const now = BigInt(Math.floor(Date.now() / 1000));
const decayProgress = Number(now - decayStart) / Number(feeConfig.secondsToDecay);
console.log(`Decay progress: ${Math.min(decayProgress * 100, 100).toFixed(1)}%`);
```

## Important Notes

1. **`round` must be current**: If you submit a bid with a stale round number, the transaction will revert. Always fetch `getAuctionState()` right before bidding.

2. **Gas price is the bid**: The auction uses `tx.gasprice` as the bidding mechanism. The SDK's `bidInAuction()` sets `maxFeePerGas` to the calculated value. On Base (L2), gas prices are low, so even small bids produce manageable gas costs.

3. **Slippage protection**: Set `amountOutMinimum` to a non-zero value in production. Calculate it based on the current pool price and your acceptable slippage tolerance.

4. **The bid amount is sent as `msg.value`**: This ETH goes to the auction contract, not to the swap. The `amountIn` is the separate ETH amount for the actual token swap.

5. **`zeroForOne` direction**: Almost always `true` for sniping (buying tokens with ETH). Only set to `false` if selling tokens back through the auction.

## Read-Only Auction Queries (No Wallet Needed)

```typescript
const sdk = new LiquidSDK({ publicClient }); // read-only

const auction = await sdk.getAuctionState(poolId);
const feeConfig = await sdk.getAuctionFeeConfig(poolId);
const decayStart = await sdk.getAuctionDecayStartTime(poolId);
const maxRounds = await sdk.getAuctionMaxRounds();
const gasPrice = await sdk.getAuctionGasPriceForBid(auction.gasPeg, parseEther("0.01"));
```

## Contract Addresses

```typescript
import { ADDRESSES } from "liquid-sdk";

ADDRESSES.SNIPER_AUCTION_V2  // Auction state contract
ADDRESSES.SNIPER_UTIL_V2     // Bid execution contract (called by bidInAuction)
```
