# Concept: MEV Protection

Why MEV protection matters for token launches and how Liquid Protocol implements it.

## The Problem

When a new token is deployed with a Uniswap V4 pool:

1. The deployment transaction appears in the mempool
2. Sniper bots detect it and prepare buy transactions
3. They buy large amounts at the lowest price in the next block
4. Retail traders arriving seconds later face inflated prices
5. Snipers dump on retail for profit

This extracts value from both the deployer and the community. Without protection, the first seconds of a token's life are a race won by bots with the fastest infrastructure.

## Solution: Taxing Early Trading

Liquid Protocol makes sniping unprofitable by applying extremely high fees during the first seconds after launch. Two modules are available:

### Module 1: Sniper Auction V2 (Default)

An auction-based system combining high fees with gas-price bidding.

**Address:** `0x187e8627c02c58F31831953C1268e157d3BfCefd`

**Mechanism:**
- Fee starts at **80%** and decays linearly to **40%** over 20 seconds
- Runs in **5 rounds**, every 2 blocks (~4 seconds per round)
- Bidders compete via gas price -- highest gas price wins each round
- Bid amount is encoded as: `(txGasPrice - gasPeg) * paymentPerGasUnit`
- Revenue from bids goes to protocol and LP holders

**Why it works:**
- At 80% fee, a sniper needs a **5x price increase** just to break even
- The gas price auction ensures only one buyer per round (no sandwich attacks)
- Bid revenue compensates the protocol and LP holders for early trading risk

**Timeline:**
```
Deploy (block N)
  |
  2 blocks
  |
Round 1 (block N+2) -- Fee: ~80%
  |
  2 blocks
  |
Round 2 (block N+4) -- Fee: ~70%
  |
  2 blocks
  |
Round 3 (block N+6) -- Fee: ~60%
  |
  2 blocks
  |
Round 4 (block N+8) -- Fee: ~50%
  |
  2 blocks
  |
Round 5 (block N+10) -- Fee: ~40%
  |
Normal trading at 1% LP fee
```

### Module 2: MevDescendingFees

A simpler time-based approach without auction mechanics.

**Address:** `0x8D6B080e48756A99F3893491D556B5d6907b6910`

**Mechanism:**
- Fee starts at up to **80%** and decays **parabolically** (quadratic curve)
- Maximum decay duration: **2 minutes**
- No auction rounds or gas price bidding
- First-come, first-served -- anyone can swap, but at the high fee

**Why it works:**
- The parabolic curve means fees drop fast at first, then slow down
- This gives a natural price discovery window
- Simpler to understand and configure than the auction

**Comparison:**

| Aspect | Sniper Auction | Descending Fees |
|--------|---------------|-----------------|
| Complexity | High | Low |
| Competition | Gas price bidding | First-come |
| Extra revenue | Yes (bid ETH) | No |
| Duration | ~20s (5 rounds) | Up to 2 min |
| Decay curve | Linear | Parabolic |
| Default | Yes | No |

## Dev Buy: The Best Alternative

If you are the token deployer and want to acquire tokens early, use the `devBuy` parameter:

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

The dev buy executes in the **same transaction** as deployment:
- Uses normal 1% LP fee (NOT auction fees)
- Atomic -- no front-running risk
- Cheapest way to get tokens at launch

## MEV Block Delay

Both modules interact with the MEV block delay system. During the delay:
- `collectRewards()` may revert with `ManagerLocked`
- Use `collectRewardsWithoutUnlock()` as an alternative

```typescript
const delay = await sdk.getMevBlockDelay();
const unlockTime = await sdk.getPoolUnlockTime(poolId);

const now = BigInt(Math.floor(Date.now() / 1000));
if (now < unlockTime) {
  console.log("Pool locked, use collectRewardsWithoutUnlock");
}
```

## Custom MEV Configuration

```typescript
import { encodeSniperAuctionData, ADDRESSES } from "liquid-sdk";

// Custom sniper auction: 60% to 20% over 30s
const result = await sdk.deployToken({
  mevModule: ADDRESSES.SNIPER_AUCTION_V2,
  mevModuleData: encodeSniperAuctionData({
    startingFee: 600_000,  // 60%
    endingFee: 200_000,    // 20%
    secondsToDecay: 30,    // 30 seconds
  }),
  // ...other params
});

// Or use descending fees instead
const result2 = await sdk.deployToken({
  mevModule: ADDRESSES.MEV_DESCENDING_FEES,
  // ...other params
});
```

## See Also

- [../contracts/liquid-mev-protection.md](../contracts/liquid-mev-protection.md) -- Contract details
- [../sdk/sniper-auction.md](../sdk/sniper-auction.md) -- SDK auction guide
- [token-lifecycle.md](token-lifecycle.md) -- Full lifecycle including MEV phase
