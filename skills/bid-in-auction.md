# Skill: Bid in a Sniper Auction (MEV)

You are an AI agent that participates in Liquid Protocol's sniper auction system. This skill teaches you how to bid for early access to newly launched tokens through the MEV auction mechanism on Base.

## IMPORTANT: Risk Disclosure

**Before executing any auction bid, you MUST inform the user of the following risks and obtain explicit confirmation to proceed.**

Sniper auction participation involves significant financial risk:

1. **High fees (up to 80%)**: During the auction window, swap fees start at 80% and decay to 40%. This means up to 80% of your swap input is taken as fees — you receive far fewer tokens than the input amount suggests.

2. **Bid amount is non-refundable**: The ETH bid (`msg.value`) is paid to the protocol/LP holders regardless of whether the swap is profitable. If the token price drops, you lose both the bid and the trade.

3. **Failed transactions still cost gas**: If your bid loses (outbid by higher gas price, wrong round, missed block), the transaction reverts but you still pay gas fees. On Base, gas is cheap, but repeated failures add up.

4. **Tokens may have no liquidity or value**: Newly launched tokens are unaudited, may have no community, and can go to zero. The auction gives you early access — it does not guarantee the token has any value.

5. **MEV competition**: Other bots and agents are competing in the same auction. You may be consistently outbid by more sophisticated actors with faster infrastructure.

6. **Timing is critical and unreliable**: The auction is valid for exactly one block (~2 seconds on Base). Network latency, RPC delays, or block reorgs can cause your transaction to land in the wrong block and revert.

7. **Smart contract risk**: The auction contracts are unaudited for this specific deployment. Bugs or misconfigurations could result in loss of funds.

**As an agent, you MUST:**
- Clearly present these risks to the user before their first auction bid
- Ask for explicit confirmation (e.g., "I understand the risks of auction sniping and want to proceed")
- Never execute auction bids autonomously without user approval for each bid, unless the user has explicitly granted standing permission
- Display the fee percentage and total cost (bid + swap + fees) before execution
- Recommend small amounts for initial bids until the user understands the mechanics

## How the Sniper Auction Works

When a new token is deployed on Liquid Protocol, a **sniper auction** activates to price early trading activity and capture MEV. Here's the mechanism:

1. **Fee decay**: The auction starts with an **80% fee** on swaps and decays linearly to **40% over 20 seconds**
2. **Gas price bidding**: Bidders compete by setting their transaction gas price **above the pool's gas peg**. The difference between your gas price and the gas peg determines your bid amount
3. **Rounds**: The auction runs in discrete rounds every 2 blocks (5 rounds max). Each round is valid for exactly **one block** (`nextAuctionBlock`)
4. **Winner takes the swap**: The highest gas-price transaction in the auction block wins the right to swap at the current fee rate
5. **Revenue distribution**: Auction revenue (bid amounts) flows to the protocol and LP holders

The auction is **not** a separate step from trading — it's a modified swap where your gas price encodes your bid.

## Prerequisites

```bash
npm install liquid-sdk viem
```

You need:
- A **private key** with ETH on Base (enough for gas + bid + swap amount)
- The **token address** or **pool ID** of a recently launched token
- An **RPC endpoint** for Base mainnet

## Setup

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK, EXTERNAL } from "liquid-sdk";

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
const sdk = new LiquidSDK({ publicClient, walletClient });
```

## Critical Concepts

Before bidding, understand these mechanics:

### Two Separate ETH Costs
- **`bidAmount`** (msg.value): ETH sent to the auction as your bid. Goes to protocol/LP.
- **`amountIn`** (WETH transfer): The actual swap input. Pulled from your WETH balance via `transferFrom`. **This is separate from the bid.**

The SDK **automatically wraps ETH → WETH and approves the SniperUtilV2** if your WETH balance or allowance is insufficient. You just need enough total ETH.

### Gas Price = Bid Encoding
The bid amount is encoded in the transaction's gas price: `bidAmount = (tx.gasprice - gasPeg) × paymentPerGasUnit`. Both `maxFeePerGas` **and** `maxPriorityFeePerGas` must be set to the calculated value, otherwise Base's EIP-1559 will compute a lower effective gas price.

### Gas Estimation Must Be Skipped
`eth_estimateGas` simulates at `baseFee` (~5M wei on Base), which is below the `gasPeg` (~6.3M wei). This causes the auction check to fail during estimation. The SDK sets `gas: 800_000n` manually.

### Block Timing is Critical
The auction is valid at **exactly** `nextAuctionBlock` — not before, not after. Submit your transaction ~1 block early (when `currentBlock === nextAuctionBlock - 1`) to land in the target block. Base has ~2s block time.

### zeroForOne Depends on Token Sort Order
Do **not** hardcode `zeroForOne: true`. Determine it from the pool key:
```typescript
const zeroForOne = poolKey.currency0.toLowerCase() === EXTERNAL.WETH.toLowerCase();
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
| `nextAuctionBlock` | `bigint` | The ONE block where bids are valid |
| `round` | `bigint` | Current round number (must match when bidding) |
| `gasPeg` | `bigint` | Base gas price reference — you bid by exceeding this |
| `currentFee` | `number` | Current MEV fee in uniBps (decays from 800000→400000) |

### Step 2: Get Pool Key and Determine Swap Direction

```typescript
const rewards = await sdk.getTokenRewards(tokenAddress);
const poolKey = rewards.poolKey;

// Determine swap direction from token sort order
const zeroForOne = poolKey.currency0.toLowerCase() === EXTERNAL.WETH.toLowerCase();
// true  = WETH is currency0, buying token (most common)
// false = token is currency0, buying with WETH from currency1 side
```

### Step 3: Calculate Gas Price for Your Bid

```typescript
const desiredBidAmount = parseEther("0.001"); // How much ETH you want to bid

// SDK calculates the exact gas price needed
const requiredGasPrice = await sdk.getAuctionGasPriceForBid(
  auction.gasPeg,
  desiredBidAmount,
);

console.log("Required gas price:", requiredGasPrice);
```

**The formula:** `bidAmount = (txGasPrice - gasPeg) * paymentPerGasUnit` where `paymentPerGasUnit = 0.0001 ETH (1e14 wei)`. The utility contract solves for `txGasPrice` given your desired `bidAmount`.

### Step 4: Wait for the Auction Block

```typescript
// Poll until we're one block before the auction
while (true) {
  const currentBlock = await publicClient.getBlockNumber();
  const gap = Number(auction.nextAuctionBlock - currentBlock);

  if (gap <= 0) {
    console.log("Missed this round");
    break;
  }
  if (gap === 1) {
    console.log("Next block is auction — fire!");
    break;
  }

  // Wait ~2s (Base block time)
  await new Promise(r => setTimeout(r, gap > 2 ? 500 : 200));
}
```

### Step 5: Execute the Bid

```typescript
// The SDK handles WETH wrapping + approval automatically
const result = await sdk.bidInAuction(
  {
    poolKey: rewards.poolKey,
    zeroForOne,                      // determined in step 2
    amountIn: parseEther("0.001"),   // WETH to swap (auto-wrapped from ETH)
    amountOutMinimum: 0n,            // set slippage protection in production!
    round: auction.round,            // must match current on-chain round
    bidAmount: desiredBidAmount,     // ETH bid (sent as msg.value)
  },
  requiredGasPrice,                  // from step 3
);

console.log("Bid tx:", result.txHash);

const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash });
console.log("Status:", receipt.status); // "success" or "reverted"
```

## Complete Example: Automated Auction Sniper

```typescript
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK, EXTERNAL, ERC20Abi } from "liquid-sdk";

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

  // 4. Get pool key and determine swap direction
  const rewards = await sdk.getTokenRewards(tokenAddress);
  const zeroForOne = rewards.poolKey.currency0.toLowerCase() === EXTERNAL.WETH.toLowerCase();

  // 5. Calculate gas price for desired bid
  const bidAmount = parseEther(bidETH);
  const gasPrice = await sdk.getAuctionGasPriceForBid(auction.gasPeg, bidAmount);

  console.log(`Bid: ${formatEther(bidAmount)} ETH | Swap: ${swapETH} ETH`);
  console.log(`Gas price: ${gasPrice} (peg: ${auction.gasPeg})`);

  // 6. Wait for the auction block
  while (true) {
    const currentBlock = await publicClient.getBlockNumber();
    const gap = Number(auction.nextAuctionBlock - currentBlock);
    if (gap <= 0) { console.log("Missed this round"); return; }
    if (gap === 1) break; // next block is auction — fire!
    await new Promise(r => setTimeout(r, gap > 2 ? 500 : 200));
  }

  // 7. Execute the bid (SDK auto-wraps WETH + approves SniperUtil)
  const result = await sdk.bidInAuction(
    {
      poolKey: rewards.poolKey,
      zeroForOne,
      amountIn: parseEther(swapETH),
      amountOutMinimum: 0n,       // In production, calculate proper slippage!
      round: auction.round,
      bidAmount,
    },
    gasPrice,
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash });
  console.log(`Bid ${receipt.status === "success" ? "WON" : "FAILED"}: ${result.txHash}`);

  if (receipt.status === "success") {
    const tokenBal = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    console.log(`Tokens received: ${formatEther(tokenBal as bigint)}`);
  }
}

// Usage: bid 0.001 ETH, swap 0.001 ETH for tokens
await snipeToken("0x...", "0.001", "0.001");
```

## The Working Bid Flow (Summary)

1. Get auction state (`getAuctionState`) — need `gasPeg`, `round`, `nextAuctionBlock`
2. Get pool key (`getTokenRewards`) — need `poolKey` for the swap
3. Determine `zeroForOne` from pool key token sort order
4. Calculate gas price (`getAuctionGasPriceForBid`)
5. Wait until `currentBlock === nextAuctionBlock - 1`
6. Call `sdk.bidInAuction(params, gasPrice)` — SDK handles:
   - Auto-wrapping ETH → WETH for `amountIn`
   - Auto-approving SniperUtilV2 for WETH
   - Setting `gas: 800_000n` (skipping estimation)
   - Setting `maxFeePerGas` and `maxPriorityFeePerGas` to the calculated value
7. Transaction lands in `nextAuctionBlock` → snipe complete

## BidInAuctionParams Reference

```typescript
interface BidInAuctionParams {
  poolKey: PoolKey;        // Uniswap V4 pool key (get from getTokenRewards)
  zeroForOne: boolean;     // true if WETH is currency0 (buying token)
  amountIn: bigint;        // WETH to swap — pulled via transferFrom (auto-wrapped by SDK)
  amountOutMinimum: bigint;// Minimum output (slippage protection)
  round: bigint;           // Must match current on-chain auction round
  bidAmount: bigint;       // ETH bid amount (sent as msg.value)
}

interface BidInAuctionResult {
  txHash: Hash;
}
```

## Auction Constants (Current Deployment)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Max rounds | 5 | Total auction rounds per token |
| Blocks between auctions | 2 | Rounds occur every 2 blocks |
| Blocks before first auction | 2 | First auction = deploy block + 2 |
| Payment per gas unit | 0.0001 ETH (1e14 wei) | Converts gas delta to bid ETH |
| Starting fee | 800,000 (80%) | Fee at auction start |
| Ending fee | 400,000 (40%) | Fee floor after decay |
| Decay period | 20 seconds | Time for fee to decay from start to end |
| Gas peg | ~6.3M wei (dynamic) | Set at pool creation, equals Base baseFee |

## Timing Strategy

The auction fee **decays over time**, so there's a tradeoff:

- **Bid early** (high fee): You pay up to 80% of the swap as a fee, but you get the tokens before others. Useful if you expect rapid price appreciation.
- **Bid late** (lower fee): The fee decays to 40% over 20 seconds. You pay less in fees but risk being outbid or missing the auction window.
- **Wait for auction to end**: After all 5 rounds complete, trading is at normal pool fees (typically 1%). No auction mechanics apply.

```typescript
// Check current fee percentage
const feePercent = auction.currentFee / 10000; // e.g., 80.0, 60.5, 40.0
console.log(`Current fee: ${feePercent}%`);
```

## Common Errors

| Error | Selector | Cause | Fix |
|-------|----------|-------|-----|
| `GasPriceTooLow()` | `0x8c19df83` | `tx.gasprice ≤ gasPeg` | Use `getAuctionGasPriceForBid()` and set both `maxFeePerGas` + `maxPriorityFeePerGas` |
| `Unauthorized()` | `0x82b42900` | Fee Locker hasn't authorized the Sniper Auction as depositor | Protocol admin must call `FeeLocker.addDepositor(SniperAuctionAddress)` |
| `NotAuctionBlock()` | — | Tx didn't land in `nextAuctionBlock` | Submit 1 block early, tx must mine in the exact auction block |
| WETH `transferFrom` revert | — | Insufficient WETH balance or allowance | SDK handles this automatically; ensure enough ETH for wrap |
| Gas estimation failure | — | `eth_estimateGas` runs at baseFee < gasPeg | SDK sets `gas: 800_000n` manually |

## Read-Only Auction Queries (No Wallet Needed)

```typescript
const sdk = new LiquidSDK({ publicClient }); // read-only

const auction = await sdk.getAuctionState(poolId);
const feeConfig = await sdk.getAuctionFeeConfig(poolId);
const decayStart = await sdk.getAuctionDecayStartTime(poolId);
const maxRounds = await sdk.getAuctionMaxRounds();
const gasPrice = await sdk.getAuctionGasPriceForBid(auction.gasPeg, parseEther("0.001"));
```

## Contract Addresses

```typescript
import { ADDRESSES } from "liquid-sdk";

ADDRESSES.SNIPER_AUCTION_V2  // 0x187e8627... — Auction state contract
ADDRESSES.SNIPER_UTIL_V2     // 0x2B6cd5Be... — Bid execution contract
```
