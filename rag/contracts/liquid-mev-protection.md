# MEV Protection Modules

Liquid Protocol provides two MEV protection modules that activate at token launch to prevent sniper bots from extracting value in the first seconds of trading.

## Why MEV Protection Matters

When a new token is deployed, its pool starts at a low market cap. Without protection:
- Sniper bots detect the deployment transaction in the mempool
- They immediately buy large amounts at the lowest price
- They dump on retail traders who arrive seconds later
- The deployer and community get worse prices

MEV protection taxes early trading activity, making sniping unprofitable.

## Module 1: SniperAuctionV2 (Default)

An auction-based system where early traders compete via gas price bidding.

- **Address:** `0x187e8627c02c58F31831953C1268e157d3BfCefd`
- **SDK Constant:** `ADDRESSES.SNIPER_AUCTION_V2`
- **Utility contract:** `0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f` (`SNIPER_UTIL_V2`)

### Default Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| Starting fee | 800,000 (80%) | Fee at auction start |
| Ending fee | 400,000 (40%) | Fee floor after decay |
| Decay period | 20 seconds | Linear decay from start to end |
| Max rounds | 5 | Total auction rounds |
| Blocks between rounds | 2 | One round every 2 blocks |
| First auction block | Deploy block + 2 | Auction starts 2 blocks after deployment |
| Payment per gas unit | 0.0001 ETH (1e14 wei) | Converts gas price delta to bid amount |

### How It Works

1. **Token deploys** -- Pool is created, sniper auction activates
2. **Fee decay begins** -- MEV fee starts at 80% and decays linearly to 40% over 20 seconds
3. **Rounds** -- Every 2 blocks, an auction round opens for exactly 1 block
4. **Gas price bidding** -- Bidders set their gas price above the `gasPeg` (base fee at deployment). The difference encodes their bid: `bidAmount = (txGasPrice - gasPeg) * paymentPerGasUnit`
5. **Winner** -- Highest gas price transaction in each auction block wins the swap
6. **Revenue** -- Bid amounts (ETH) flow to protocol and LP holders via the Fee Locker
7. **Auction ends** -- After 5 rounds (~10 blocks, ~20 seconds), normal trading resumes at standard LP fees

### Bid Encoding Formula

```
bidAmount = (txGasPrice - gasPeg) * paymentPerGasUnit

Where:
  txGasPrice = both maxFeePerGas AND maxPriorityFeePerGas (must be equal)
  gasPeg = base fee recorded at pool creation (~6.3M wei on Base)
  paymentPerGasUnit = 0.0001 ETH (1e14 wei)
```

### Fee Impact

| Time | Fee | Tokens Received | Breakeven Multiple |
|------|-----|-----------------|-------------------|
| 0s (start) | 80% | 20% of fair value | 5x |
| 5s | 70% | 30% of fair value | 3.3x |
| 10s | 60% | 40% of fair value | 2.5x |
| 15s | 50% | 50% of fair value | 2x |
| 20s (end) | 40% | 60% of fair value | 1.7x |
| After auction | 1% (LP fee) | 99% of fair value | 1.01x |

### SDK Methods

```typescript
// Read auction state
const auction = await sdk.getAuctionState(poolId);
// auction.nextAuctionBlock, auction.round, auction.gasPeg, auction.currentFee

// Read fee config
const feeConfig = await sdk.getAuctionFeeConfig(poolId);
// feeConfig.startingFee, feeConfig.endingFee, feeConfig.secondsToDecay

// Get decay start time
const startTime = await sdk.getAuctionDecayStartTime(poolId);

// Get max rounds
const maxRounds = await sdk.getAuctionMaxRounds();

// Calculate gas price for desired bid
const gasPrice = await sdk.getAuctionGasPriceForBid(auction.gasPeg, parseEther("0.001"));

// Execute bid (auto-wraps WETH, approves SniperUtil, sets gas)
const result = await sdk.bidInAuction({
  poolKey: rewards.poolKey,
  zeroForOne,
  amountIn: parseEther("0.001"),
  amountOutMinimum: 0n,
  round: auction.round,
  bidAmount: parseEther("0.0005"),
}, gasPrice);
```

### Custom Sniper Auction Config

```typescript
import { encodeSniperAuctionData, ADDRESSES } from "liquid-sdk";

const mevModuleData = encodeSniperAuctionData({
  startingFee: 800_000,  // 80% starting fee
  endingFee: 400_000,    // 40% ending fee
  secondsToDecay: 20,    // 20 seconds decay
});

const result = await sdk.deployToken({
  name: "Custom MEV Token",
  symbol: "CMEV",
  mevModule: ADDRESSES.SNIPER_AUCTION_V2,
  mevModuleData,
});
```

## Module 2: MevDescendingFees

A simpler time-based MEV protection without auction mechanics. Fee decays parabolically from a high starting point.

- **Address:** `0x8D6B080e48756A99F3893491D556B5d6907b6910`
- **SDK Constant:** `ADDRESSES.MEV_DESCENDING_FEES`

### Configuration

| Parameter | Constraint |
|-----------|------------|
| Max initial fee | 800,000 (80%) |
| Max decay duration | 2 minutes (120 seconds) |
| Decay curve | Parabolic (quadratic) |
| Auction mechanics | None -- purely time-based |

### How It Works

1. **Token deploys** -- Descending fee module activates
2. **High initial fee** -- Swaps are taxed at up to 80%
3. **Parabolic decay** -- Fee decreases over time following a quadratic curve (faster at start, slower at end)
4. **Normal trading** -- After the decay period (max 2 min), standard LP fees apply

### Key Differences from Sniper Auction

| Aspect | Sniper Auction | Descending Fees |
|--------|---------------|-----------------|
| Mechanism | Gas price bidding | Time-based decay |
| Competition | Highest gas wins | First-come, first-served |
| Revenue | Bid ETH to protocol/LP | Fees from swaps only |
| Complexity | Complex (rounds, gas encoding) | Simple (just time) |
| Duration | ~20s (5 rounds) | Up to 2 minutes |
| Decay curve | Linear | Parabolic |

## MEV Block Delay

Both modules interact with the MEV block delay system:

```typescript
// Check block delay
const delay = await sdk.getMevBlockDelay();

// Check when pool unlocks
const unlockTime = await sdk.getPoolUnlockTime(poolId);
const now = BigInt(Math.floor(Date.now() / 1000));

if (now < unlockTime) {
  console.log("Pool still locked -- collectRewards will revert");
  // Use collectRewardsWithoutUnlock instead
}
```

## See Also

- [../sdk/sniper-auction.md](../sdk/sniper-auction.md) -- SDK auction guide
- [../concepts/mev-protection.md](../concepts/mev-protection.md) -- Conceptual overview
- [liquid-hooks.md](liquid-hooks.md) -- Hook integration with MEV modules
