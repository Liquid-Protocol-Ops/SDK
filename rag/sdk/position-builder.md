# SDK Guide: Position Builder

How to create custom liquidity position layouts using market cap targets.

## Overview

Liquid Protocol deploys tokens with concentrated liquidity across multiple tick ranges ("positions" or "tranches"). Each position covers a market cap range and holds a percentage of the pool supply.

The SDK provides helpers to convert market cap targets (USD or ETH) into the tick arrays needed by `deployToken()`.

## Key Functions

### `createPositions(startingCapETH, tranches, tickSpacing?)`

Builds position arrays from ETH-denominated market cap tranches.

```typescript
import { createPositions } from "liquid-sdk";

const positions = createPositions(10, [
  { upperMarketCapETH: 241.5, supplyPct: 40 },  // ~$500K @ $2070/ETH
  { upperMarketCapETH: 4830,  supplyPct: 50 },   // ~$10M
  { upperMarketCapETH: 483050, supplyPct: 10 },   // ~$1B
]);

// Returns:
// {
//   tickLower: [-230400, -198600, -168600],
//   tickUpper: [-198600, -168600, -122400],
//   positionBps: [4000, 5000, 1000]
// }
```

### `createPositionsUSD(startingCapUSD, ethPriceUSD, tranches, tickSpacing?)`

Builds positions from USD-denominated market caps. Convenience wrapper that converts USD to ETH.

```typescript
import { createPositionsUSD } from "liquid-sdk";

const positions = createPositionsUSD(20_000, 2070, [
  { upperMarketCapUSD: 500_000,       supplyPct: 40 },
  { upperMarketCapUSD: 10_000_000,    supplyPct: 50 },
  { upperMarketCapUSD: 1_000_000_000, supplyPct: 10 },
]);

const result = await sdk.deployToken({
  name: "Custom Positions",
  symbol: "CPS",
  ...positions,
  tickIfToken0IsLiquid: positions.tickLower[0],
});
```

### `createDefaultPositions(startingCapUSD, ethPriceUSD, tickSpacing?)`

Builds the standard 3-tranche Liquid layout:
- 40% of pool supply: Starting to $500K market cap
- 50% of pool supply: $500K to $10M market cap
- 10% of pool supply: $10M to $1B market cap

```typescript
import { createDefaultPositions } from "liquid-sdk";

const positions = createDefaultPositions(20_000, 2070);
// Returns: { tickLower, tickUpper, positionBps, tickIfToken0IsLiquid }

const result = await sdk.deployToken({
  name: "Default Layout",
  symbol: "DEF",
  ...positions,
});
```

### `describePositions(positions, ethPriceUSD?)`

Returns human-readable descriptions of position ranges.

```typescript
import { describePositions } from "liquid-sdk";

const desc = describePositions(positions, 2070);
for (const p of desc) {
  console.log(`Position ${p.index}: ${p.supplyPct}%`);
  console.log(`  Ticks: ${p.tickLower} -> ${p.tickUpper}`);
  console.log(`  Market cap: ${p.marketCapLowerETH.toFixed(1)} ETH -> ${p.marketCapUpperETH.toFixed(1)} ETH`);
  if (p.marketCapLowerUSD) {
    console.log(`  USD: $${p.marketCapLowerUSD.toFixed(0)} -> $${p.marketCapUpperUSD.toFixed(0)}`);
  }
}
```

## Default Position Layouts

### 5-Position "Liquid" Layout (SDK Default)

This is the hardcoded default used when no positions are specified:

| # | Supply | Tick Range | Market Cap Range (~$2000/ETH) |
|---|--------|-----------|------------------------------|
| 1 | 10% | -230,400 to -216,000 | ~$20K to ~$83K |
| 2 | 50% | -216,000 to -155,000 | ~$83K to ~$37M |
| 3 | 15% | -202,000 to -155,000 | ~$338K to ~$37M |
| 4 | 20% | -155,000 to -120,000 | ~$37M to ~$1.2B |
| 5 | 5% | -141,000 to -120,000 | ~$151M to ~$1.2B |

Note: Positions 2-3 and 4-5 overlap, concentrating more liquidity in the mid-range.

### Standard Single Position

```typescript
import { POOL_POSITIONS } from "liquid-sdk";

const standard = POOL_POSITIONS.Standard;
// Single position: -230400 to -120000, 100% of supply
```

### Default 3-Tranche (via createDefaultPositions)

| # | Supply | USD Range |
|---|--------|-----------|
| 1 | 40% | Starting to $500K |
| 2 | 50% | $500K to $10M |
| 3 | 10% | $10M to $1B |

## Tick Math Primer

See [../concepts/tick-math.md](../concepts/tick-math.md) for full details.

**Quick formulas:**

```
Total supply = 100,000,000,000 (100B)
Price per token = marketCapETH / totalSupply
Tick = floor(log(price) / log(1.0001) / tickSpacing) * tickSpacing

Reverse:
Price = 1.0001^tick
MarketCapETH = price * totalSupply
MarketCapUSD = marketCapETH * ethPriceUSD
```

**Helper functions:**

```typescript
import {
  getTickFromMarketCapETH,
  getTickFromMarketCapUSD,
  marketCapFromTickETH,
  marketCapFromTickUSD,
} from "liquid-sdk";

getTickFromMarketCapETH(10)           // -230400  (~10 ETH)
getTickFromMarketCapUSD(500_000, 2070) // tick for $500K
marketCapFromTickETH(-230400)          // ~10 ETH
marketCapFromTickUSD(-230400, 2070)    // ~$20,700
```

## Validation Rules

- 1-7 positions allowed (max 7)
- `positionBps` must sum to exactly 10000 (100%)
- `supplyPct` in tranches must sum to 100
- All ticks must be divisible by `tickSpacing` (default 200)
- Tranches must be ordered by ascending market cap
- Each tranche's upper tick must be above the previous

## See Also

- [../concepts/tick-math.md](../concepts/tick-math.md) -- Detailed tick math formulas
- [../concepts/lp-positions.md](../concepts/lp-positions.md) -- Position concepts
- [deploy-token.md](deploy-token.md) -- Deploying with custom positions
