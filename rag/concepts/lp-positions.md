# Concept: LP Positions

How concentrated liquidity positions work in Liquid Protocol: multi-tranche layouts, tick math, position BPS, and market cap ranges.

## What Are LP Positions?

Liquid Protocol uses Uniswap V4 concentrated liquidity. Instead of spreading liquidity across all prices (like V2), liquidity is concentrated into specific price ranges called "positions" or "tranches."

Each position is defined by:
- **tickLower:** The lower bound (lower market cap)
- **tickUpper:** The upper bound (higher market cap)
- **positionBps:** The percentage of pool supply allocated (in basis points, sum = 10000)

## Why Multiple Positions?

Different market cap ranges need different liquidity depths:

- **Low cap ($20K-$500K):** Tokens spend most of their life here. Needs deep liquidity for smooth trading.
- **Mid cap ($500K-$10M):** Growth phase. Still needs significant liquidity.
- **High cap ($10M-$1B):** Aspirational range. Less liquidity needed since few tokens reach here.

By allocating more supply to lower ranges, the protocol ensures:
- Better price execution for everyday trading
- Less slippage at common market caps
- Some liquidity at high caps for when tokens "moon"

## Default Position Layouts

### 5-Position "Liquid" Layout (SDK Default)

This is the hardcoded default when no positions are specified:

| # | Supply | Tick Range | MC Range (~$2000/ETH) | Notes |
|---|--------|-----------|----------------------|-------|
| 1 | 10% | -230,400 to -216,000 | $20K to $83K | Launch range |
| 2 | 50% | -216,000 to -155,000 | $83K to $37M | Core range (50%!) |
| 3 | 15% | -202,000 to -155,000 | $338K to $37M | Overlaps with P2 |
| 4 | 20% | -155,000 to -120,000 | $37M to $1.2B | High cap |
| 5 | 5% | -141,000 to -120,000 | $151M to $1.2B | Overlaps with P4 |

Positions 2-3 and 4-5 overlap, creating deeper liquidity in their intersection zones.

```typescript
import { POOL_POSITIONS } from "liquid-sdk";
const layout = POOL_POSITIONS.Liquid;
```

### 3-Tranche Default (via createDefaultPositions)

Generated dynamically based on current ETH price:

| # | Supply | USD Range |
|---|--------|-----------|
| 1 | 40% | Starting to $500K |
| 2 | 50% | $500K to $10M |
| 3 | 10% | $10M to $1B |

```typescript
import { createDefaultPositions } from "liquid-sdk";
const positions = createDefaultPositions(20_000, 2070); // $20K start, $2070/ETH
```

### Single Position (Standard)

100% of supply in one wide range:

```typescript
import { POOL_POSITIONS } from "liquid-sdk";
const standard = POOL_POSITIONS.Standard;
// { tickLower: -230400, tickUpper: -120000, positionBps: 10000 }
```

## Position BPS

BPS (basis points) determine how the pool supply is split across positions:

```
Total pool supply = TOKEN_SUPPLY - extensionAllocations
Pool supply distributed per positionBps:
  Position 1: poolSupply * positionBps[0] / 10000
  Position 2: poolSupply * positionBps[1] / 10000
  ...
```

**Rules:**
- BPS must sum to exactly 10000 (100%)
- Minimum 1 position, maximum 7
- Each position creates a Uniswap V4 LP NFT held by the LP Locker

## Market Cap to Tick Conversion

The relationship between market cap and Uniswap V4 ticks:

```
Total supply = 100,000,000,000 (100 billion)
Price per token = marketCapETH / totalSupply
Tick = floor(log(price) / log(1.0001) / tickSpacing) * tickSpacing
```

See [tick-math.md](tick-math.md) for detailed formulas and worked examples.

### Quick Reference Table

| Market Cap (ETH) | Market Cap (~$2000/ETH) | Tick (spacing=200) |
|------------------|------------------------|---------------------|
| 10 | $20,000 | -230,400 |
| 100 | $200,000 | -207,200 |
| 250 | $500,000 | -198,600 |
| 1,000 | $2,000,000 | -184,400 |
| 5,000 | $10,000,000 | -168,600 |
| 50,000 | $100,000,000 | -145,400 |
| 250,000 | $500,000,000 | -129,000 |
| 500,000 | $1,000,000,000 | -122,200 |

## Building Custom Positions

### From USD Market Caps

```typescript
import { createPositionsUSD } from "liquid-sdk";

const positions = createPositionsUSD(20_000, 2070, [
  { upperMarketCapUSD: 100_000, supplyPct: 30 },
  { upperMarketCapUSD: 1_000_000, supplyPct: 40 },
  { upperMarketCapUSD: 100_000_000, supplyPct: 30 },
]);

await sdk.deployToken({
  ...positions,
  tickIfToken0IsLiquid: positions.tickLower[0],
});
```

### From ETH Market Caps

```typescript
import { createPositions } from "liquid-sdk";

const positions = createPositions(10, [
  { upperMarketCapETH: 100, supplyPct: 40 },
  { upperMarketCapETH: 5000, supplyPct: 50 },
  { upperMarketCapETH: 500000, supplyPct: 10 },
]);
```

### Describing Positions

```typescript
import { describePositions } from "liquid-sdk";

const desc = describePositions(positions, 2070);
for (const p of desc) {
  console.log(`P${p.index + 1}: ${p.supplyPct}% | ` +
    `$${p.marketCapLowerUSD?.toFixed(0)} - $${p.marketCapUpperUSD?.toFixed(0)}`);
}
```

## How Concentrated Liquidity Works

In a concentrated liquidity position:
- Liquidity is only active when the current price is within the tick range
- Tokens earn fees only while active
- As price moves through the range, the position converts from one token to the other

For a Liquid token (token/WETH pair):
- At launch (low tick): position is mostly token
- As price rises (tick increases): token converts to WETH through trades
- At upper tick: position is fully WETH (all token sold)

This means:
- Lower positions "sell" token supply as the price rises
- Higher positions provide liquidity for larger swaps at higher prices
- Overlapping positions create extra depth in their intersection

## Validation Rules

When deploying with custom positions:

1. 1-7 positions allowed
2. `positionBps` must sum to 10000
3. All ticks divisible by `tickSpacing` (default 200)
4. All `tickLower` values >= `tickIfToken0IsLiquid`
5. At least one position must have `tickLower == tickIfToken0IsLiquid`
6. Tranches must be ordered by ascending market cap (for builder functions)

## See Also

- [tick-math.md](tick-math.md) -- Detailed tick math formulas
- [fee-system.md](fee-system.md) -- How positions earn fees
- [../sdk/position-builder.md](../sdk/position-builder.md) -- SDK position builder guide
