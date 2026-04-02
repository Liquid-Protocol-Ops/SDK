# Concept: Tick Math

Detailed explanation of how Uniswap V4 ticks relate to token prices and market caps in Liquid Protocol. Includes formulas, constants, and worked examples.

## Core Formulas

### Constants

```
Total supply     = 100,000,000,000 (100 billion, 1e11)
Decimals         = 18
Tick base        = 1.0001
Tick spacing     = 200 (default)
LOG_BASE         = ln(1.0001) = 0.000099995...
```

### Market Cap to Price

```
price = marketCapETH / totalSupply
price = marketCapETH / 1e11
```

Price is in WETH per token (how much WETH one token costs).

### Price to Tick

```
rawTick = ln(price) / ln(1.0001)
tick = floor(rawTick / tickSpacing) * tickSpacing
```

The floor + alignment ensures ticks are always multiples of `tickSpacing`.

### Tick to Price

```
price = 1.0001^tick
```

### Tick to Market Cap

```
marketCapETH = 1.0001^tick * totalSupply
marketCapETH = 1.0001^tick * 1e11
```

### USD Conversion

```
marketCapUSD = marketCapETH * ethPriceUSD
tickFromUSD = tickFromETH(marketCapUSD / ethPriceUSD)
```

## SDK Helper Functions

```typescript
import {
  getTickFromMarketCapETH,
  getTickFromMarketCapUSD,
  marketCapFromTickETH,
  marketCapFromTickUSD,
} from "liquid-sdk";

// Market cap -> Tick
getTickFromMarketCapETH(10)              // -230400
getTickFromMarketCapETH(200)             // -200200
getTickFromMarketCapUSD(500_000, 2070)   // -198600 (approx)
getTickFromMarketCapUSD(10_000_000, 2070) // -168600 (approx)

// Tick -> Market cap
marketCapFromTickETH(-230400)            // ~9.99 ETH
marketCapFromTickUSD(-230400, 2070)      // ~$20,680
marketCapFromTickETH(-120000)            // ~603,000 ETH
marketCapFromTickUSD(-120000, 2070)      // ~$1.25B
```

## Worked Examples

### Example 1: Default Starting Tick

**Given:** Starting market cap = 10 ETH, tick spacing = 200

```
price = 10 / 1e11 = 1e-10
rawTick = ln(1e-10) / ln(1.0001)
        = -23.0259 / 0.000099995
        = -230,268.5
tick = floor(-230268.5 / 200) * 200
     = floor(-1151.34) * 200
     = -1152 * 200
     = -230,400
```

**Result:** tick = -230,400 (the SDK default `DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID`)

### Example 2: $500K Market Cap at $2070/ETH

```
marketCapETH = 500,000 / 2,070 = 241.55 ETH
price = 241.55 / 1e11 = 2.4155e-9
rawTick = ln(2.4155e-9) / ln(1.0001) = -198,549
tick = floor(-198549 / 200) * 200 = -198,600
```

**Result:** tick = -198,600

### Example 3: $10M Market Cap at $2070/ETH

```
marketCapETH = 10,000,000 / 2,070 = 4,830.9 ETH
price = 4830.9 / 1e11 = 4.831e-8
rawTick = ln(4.831e-8) / ln(1.0001) = -168,537
tick = floor(-168537 / 200) * 200 = -168,600
```

**Result:** tick = -168,600

### Example 4: $1B Market Cap at $2070/ETH

```
marketCapETH = 1,000,000,000 / 2,070 = 483,092 ETH
price = 483092 / 1e11 = 4.831e-6
rawTick = ln(4.831e-6) / ln(1.0001) = -122,337
tick = floor(-122337 / 200) * 200 = -122,400
```

**Result:** tick = -122,400

## Reference Table

| Market Cap (ETH) | Market Cap (~$2000/ETH) | Tick | Price (WETH/token) |
|------------------|------------------------|------|-------------------|
| 1 | $2,000 | -253,400 | 1e-11 |
| 10 | $20,000 | -230,400 | 1e-10 |
| 100 | $200,000 | -207,200 | 1e-9 |
| 250 | $500,000 | -198,000 | 2.5e-9 |
| 1,000 | $2,000,000 | -184,400 | 1e-8 |
| 5,000 | $10,000,000 | -168,200 | 5e-8 |
| 10,000 | $20,000,000 | -161,200 | 1e-7 |
| 50,000 | $100,000,000 | -145,000 | 5e-7 |
| 100,000 | $200,000,000 | -138,000 | 1e-6 |
| 250,000 | $500,000,000 | -128,800 | 2.5e-6 |
| 500,000 | $1,000,000,000 | -122,000 | 5e-6 |
| 1,000,000 | $2,000,000,000 | -115,000 | 1e-5 |

*Note: Exact tick values depend on tickSpacing alignment.*

## Tick Spacing

Ticks must be multiples of `tickSpacing` (default: 200). This means:

- Prices can only exist at discrete points: 1.0001^0, 1.0001^200, 1.0001^400, ...
- Each "step" represents a ~2% price change (1.0001^200 = 1.0202)
- Finer tick spacing (e.g., 60) allows tighter ranges but costs more gas
- Coarser tick spacing (e.g., 200) is more gas-efficient but less precise

## Why Ticks Are Negative

In Uniswap V4, prices are expressed as `currency0 / currency1`. Since:
- currency0 = WETH (numerically lower address)
- currency1 = liquid token (numerically higher address)

The price represents "WETH per token." Since tokens have 100B supply, the price per token is extremely small (e.g., 1e-10), resulting in a very negative tick.

As the token's market cap increases:
- Price per token increases
- Tick moves toward zero (becomes less negative)

## Position Building with Tick Math

```typescript
import { createPositionsUSD, describePositions } from "liquid-sdk";

// Define positions using USD market caps
const positions = createPositionsUSD(20_000, 2070, [
  { upperMarketCapUSD: 500_000, supplyPct: 40 },
  { upperMarketCapUSD: 10_000_000, supplyPct: 50 },
  { upperMarketCapUSD: 1_000_000_000, supplyPct: 10 },
]);

// See what was generated
const desc = describePositions(positions, 2070);
desc.forEach(p => {
  console.log(`Position ${p.index}: ${p.supplyPct}%`);
  console.log(`  Ticks: ${p.tickLower} to ${p.tickUpper}`);
  console.log(`  ETH: ${p.marketCapLowerETH.toFixed(2)} to ${p.marketCapUpperETH.toFixed(2)}`);
  console.log(`  USD: $${p.marketCapLowerUSD?.toFixed(0)} to $${p.marketCapUpperUSD?.toFixed(0)}`);
});
```

## Stablecoin Pairing

For tokens paired with stablecoins instead of WETH:

```typescript
import { getTickFromMarketCapStable } from "liquid-sdk";

// USDC (6 decimals)
const tick = getTickFromMarketCapStable(500_000, 6);

// DAI (18 decimals)
const tick = getTickFromMarketCapStable(500_000, 18);
```

## Implementation

The tick math utilities are in `src/utils/tick-math.ts`:

```typescript
const LOG_BASE = Math.log(1.0001);
const TOTAL_SUPPLY = 1e11;

function getTickFromMarketCapETH(marketCapETH, tickSpacing = 200) {
  const price = marketCapETH / TOTAL_SUPPLY;
  const rawTick = Math.log(price) / LOG_BASE;
  return Math.floor(rawTick / tickSpacing) * tickSpacing;
}

function marketCapFromTickETH(tick) {
  const price = Math.pow(1.0001, tick);
  return price * TOTAL_SUPPLY;
}
```

## See Also

- [lp-positions.md](lp-positions.md) -- LP position concepts
- [../sdk/position-builder.md](../sdk/position-builder.md) -- SDK position builder
- [fee-system.md](fee-system.md) -- How positions earn fees
