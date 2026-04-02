# SDK Guide: Sniper Auction

How to read auction state, calculate bids, and participate in MEV sniper auctions.

## Overview

The Sniper Auction V2 is an MEV protection mechanism that runs for the first ~20 seconds after token deployment. Early traders compete via gas price bidding, with fees starting at 80% and decaying to 40%.

**Important:** In most cases, waiting for the auction to end and trading at normal 1% fees is the better strategy. The auction is designed to extract value from snipers, not help them.

## SDK Methods

### `getAuctionState(poolId)`

Returns the current auction state.

```typescript
const auction = await sdk.getAuctionState(poolId);

auction.nextAuctionBlock  // bigint -- the ONE block where bids are valid
auction.round             // bigint -- current round number
auction.gasPeg            // bigint -- base gas price reference
auction.currentFee        // number -- current fee in uniBps (800000 = 80%)
```

### `getAuctionFeeConfig(poolId)`

Returns the fee decay configuration.

```typescript
const feeConfig = await sdk.getAuctionFeeConfig(poolId);

feeConfig.startingFee     // number -- e.g., 800000 (80%)
feeConfig.endingFee       // number -- e.g., 400000 (40%)
feeConfig.secondsToDecay  // bigint -- e.g., 20n
```

### `getAuctionDecayStartTime(poolId)`

Returns the unix timestamp when fee decay started.

```typescript
const startTime = await sdk.getAuctionDecayStartTime(poolId);
```

### `getAuctionMaxRounds()`

Returns the maximum number of auction rounds.

```typescript
const maxRounds = await sdk.getAuctionMaxRounds();
// maxRounds: bigint -- typically 5n
```

### `getAuctionGasPriceForBid(gasPeg, bidAmount)`

Calculates the exact gas price needed for a desired bid amount.

```typescript
const gasPrice = await sdk.getAuctionGasPriceForBid(
  auction.gasPeg,
  parseEther("0.001"),  // desired bid in ETH
);
```

**Formula:** `bidAmount = (txGasPrice - gasPeg) * paymentPerGasUnit` where `paymentPerGasUnit = 0.0001 ETH (1e14 wei)`.

### `bidInAuction(params, gasPrice)`

Executes an auction bid + swap. The SDK handles:
- Auto-wrapping ETH to WETH for `amountIn`
- Auto-approving SniperUtilV2 for WETH spending
- Setting `gas: 800_000n` (skips estimation)
- Setting both `maxFeePerGas` and `maxPriorityFeePerGas` to `gasPrice`

```typescript
const result = await sdk.bidInAuction({
  poolKey: rewards.poolKey,
  zeroForOne,                      // true if WETH is currency0
  amountIn: parseEther("0.001"),   // WETH to swap
  amountOutMinimum: 0n,            // set slippage in production!
  round: auction.round,            // must match current on-chain round
  bidAmount: parseEther("0.0005"), // ETH bid (sent as msg.value)
}, gasPrice);

console.log("Tx:", result.txHash);
```

## Complete Bidding Flow

```typescript
import { LiquidSDK, EXTERNAL } from "liquid-sdk";
import { parseEther, formatEther } from "viem";

const sdk = new LiquidSDK({ publicClient, walletClient });

// 1. Get token event for pool ID
const tokenEvent = await sdk.getTokenEvent(tokenAddress);
const poolId = tokenEvent.poolId;

// 2. Get auction state
const auction = await sdk.getAuctionState(poolId);
const maxRounds = await sdk.getAuctionMaxRounds();

if (auction.round >= maxRounds) {
  console.log("Auction ended -- trade at normal fees");
  return;
}

console.log("Fee:", Number(auction.currentFee) / 10000, "%");
console.log("Round:", auction.round.toString());

// 3. Get pool key and swap direction
const rewards = await sdk.getTokenRewards(tokenAddress);
const zeroForOne = rewards.poolKey.currency0.toLowerCase() === EXTERNAL.WETH.toLowerCase();

// 4. Calculate gas price
const bidAmount = parseEther("0.001");
const gasPrice = await sdk.getAuctionGasPriceForBid(auction.gasPeg, bidAmount);

// 5. Wait for auction block
while (true) {
  const currentBlock = await publicClient.getBlockNumber();
  const gap = Number(auction.nextAuctionBlock - currentBlock);
  if (gap <= 0) { console.log("Missed this round"); return; }
  if (gap === 1) break;
  await new Promise(r => setTimeout(r, gap > 2 ? 500 : 200));
}

// 6. Fire bid
const result = await sdk.bidInAuction({
  poolKey: rewards.poolKey,
  zeroForOne,
  amountIn: parseEther("0.001"),
  amountOutMinimum: 0n,
  round: auction.round,
  bidAmount,
}, gasPrice);

const receipt = await publicClient.waitForTransactionReceipt({ hash: result.txHash });
console.log(receipt.status === "success" ? "WON" : "FAILED");
```

## Two Separate ETH Costs

- **`bidAmount` (msg.value):** ETH sent to the auction as your bid. Goes to protocol/LP.
- **`amountIn` (WETH transfer):** The actual swap input. Pulled from your WETH balance via `transferFrom`. Separate from the bid.

Total ETH needed: `bidAmount + amountIn + gas fees`

## Auction Constants

| Parameter | Value |
|-----------|-------|
| Max rounds | 5 |
| Blocks between rounds | 2 |
| First auction block | Deploy block + 2 |
| Payment per gas unit | 0.0001 ETH (1e14 wei) |
| Default starting fee | 800,000 (80%) |
| Default ending fee | 400,000 (40%) |
| Default decay period | 20 seconds |
| Gas peg | ~6.3M wei (set at pool creation) |

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `GasPriceTooLow()` | txGasPrice <= gasPeg | Use `getAuctionGasPriceForBid()` |
| `NotAuctionBlock()` | Wrong block | Submit 1 block before `nextAuctionBlock` |
| `Unauthorized()` | Fee Locker not configured | Protocol admin issue |
| WETH transferFrom revert | Insufficient WETH | SDK handles auto-wrap |

## Contract Addresses

| Contract | Address |
|----------|---------|
| Sniper Auction V2 | `0x187e8627c02c58F31831953C1268e157d3BfCefd` |
| Sniper Util V2 | `0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f` |

## See Also

- [../contracts/liquid-mev-protection.md](../contracts/liquid-mev-protection.md) -- MEV contract details
- [../concepts/mev-protection.md](../concepts/mev-protection.md) -- Conceptual overview
