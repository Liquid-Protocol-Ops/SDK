# LP Position Simulator — Technical Plan

> Build an interactive LP position simulator for Liquid Protocol, equivalent to the Clanker LP Simulator.

## Overview

The LP Simulator lets creators model token launch configurations before deploying. It visualizes how liquidity is distributed across price ranges, simulates how ETH buys move through positions, and projects creator fee revenue.

## Architecture

```
lp-simulator/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Dark theme shell, metadata
│   │   └── page.tsx            # Main simulator page (single-page app)
│   ├── components/
│   │   ├── QuickPresets.tsx     # Preset selector (Legacy / Liquid 5-pos / Custom)
│   │   ├── MarketCapInput.tsx   # Starting market cap (USD + ETH) input
│   │   ├── SupplyAllocations.tsx # Airdrop %, Vault %, Presale %, Pool %
│   │   ├── PositionEditor.tsx   # Add/remove/edit LP positions with tick ranges
│   │   ├── LiquidityChart.tsx   # Area chart: supply % vs market cap
│   │   ├── SimulateBuys.tsx     # Quick buy buttons (+0.1, +0.5, +1, +5, +10, +50 ETH)
│   │   ├── SimulationResults.tsx # Total ETH, USD value, starting/current mcap
│   │   ├── FeeProjection.tsx    # Static fee rate toggle (1%/2%/3%) + projected fees
│   │   └── ExportConfig.tsx     # Show/copy SDK DeployTokenParams config
│   ├── lib/
│   │   ├── simulation.ts        # Buy simulation engine (uses liquid-sdk tick math)
│   │   └── fee-calculator.ts    # Fee projection (uses liquid-sdk FEE constants)
│   └── hooks/
│       └── useSimulator.ts      # Main state management hook
├── public/
│   └── og-image.png
└── README.md
```

## Tech Stack

- **Next.js 14+** (App Router, React Server Components where appropriate)
- **Tailwind CSS** (dark theme matching Liquid Protocol branding)
- **Recharts** or **lightweight-charts** for the liquidity distribution visualization
- **liquid-sdk** utilities (tick-math, positions, encoding — can be imported directly)
- **Deployed on Vercel**

## Core Components

### 1. Quick Presets (`QuickPresets.tsx`)

Three presets matching Liquid Protocol's standard configurations:

| Preset | Description | Positions |
|--------|-------------|-----------|
| Legacy (Single Position) | Single wide range | 1 position, 100% |
| Liquid 5-Position (Default) | Optimized for price discovery | 5 positions: 10%/50%/15%/20%/5% |
| Custom | User-defined | Editable |

### 2. Market Cap & Price Input (`MarketCapInput.tsx`)

- **Starting Market Cap**: USD input, auto-converts to ETH using live or manual ETH price
- **ETH Price**: Fetched from CoinGecko/DeFi Llama API, or manually overridable
- Output: starting tick via `getTickFromMarketCapUSD()`

### 3. Supply Allocations (`SupplyAllocations.tsx`)

| Field | Default | Constraint |
|-------|---------|-----------|
| Airdrop % | 0 | 0-90% |
| Vault % | 0 | 0-90% |
| Presale % | 0 | 0-90% |
| Pool % | 100 | = 100 - airdrop - vault - presale |

Total supply: 100B tokens. Pool supply is what goes into LP positions.

### 4. Position Editor (`PositionEditor.tsx`)

Each position has:
- **Lower bound**: Market cap (auto-converts to tick)
- **Upper bound**: Market cap (auto-converts to tick)
- **Supply %**: Percentage of pool supply allocated (slider)
- **Delete button**
- **Add position button** (max 7 positions per SDK constraint)

Validation: positionBps must sum to 10,000.

### 5. Liquidity Distribution Chart (`LiquidityChart.tsx`)

Multi-series area chart:
- **X-axis**: Market cap (log scale, from starting mcap to $1B+)
- **Left Y-axis**: Supply in pool (% of total)
- **Right Y-axis**: Cumulative % sold
- **Series**: One colored area per position + "Supply Sold" line
- **Annotations**: Position boundaries marked

### 6. Buy Simulation Engine (`simulation.ts`)

Core algorithm:
```typescript
interface SimState {
  currentTick: number;
  currentMcapETH: number;
  totalETHBought: number;
  tokensRemaining: number[]; // per position; number is enough for projection precision
  currentPositionIndex: number; // resume point — never revisit exhausted positions
  cumulativeFees: number;
}

interface PositionPrecomputed {
  tickLower: number;
  tickUpper: number;
  sqrtPriceLower: number;
  sqrtPriceUpper: number;
  liquidityL: number;
}

// Precompute sqrt(price) and L per position when positions change.
// Memoize keyed on the positions array so per-buy work stays O(1) for the active range.
function precomputePositions(positions: Position[]): PositionPrecomputed[] { /* ... */ }

function simulateBuy(state: SimState, ethAmount: number, feeRate: number, pre: PositionPrecomputed[]): SimState {
  const fee = ethAmount * feeRate;
  let remainingETH = ethAmount - fee;
  // Resume from the active position — exhausted ranges are never re-scanned.
  // ...consume ETH against pre[currentPositionIndex], advance index when reserve hits zero.
}
```

Key math from Uniswap V4 concentrated liquidity (note: WETH/token sort order is set by `isLiquidToken0` at deploy time — the simulator must mirror that to pick the right side of the formula):
- `price = 1.0001^tick`
- `L = tokenReserve / (sqrt(priceUpper) - sqrt(priceLower))`
- `ETH needed = L * (sqrt(priceAfter) - sqrt(priceBefore))` when WETH is token1
- `ETH needed = L * (1/sqrt(priceBefore) - 1/sqrt(priceAfter))` when WETH is token0

### 7. Fee Projection (`FeeProjection.tsx`)

- **Static Fee Rate**: Toggle between 1%, 2%, 3% (matching SDK's `encodeStaticFeePoolData`)
- **Swap Volume**: Input or derived from simulated buys
- **Fee Rate**: Selected rate
- **Your Fees**: `swapVolume * feeRate * (1 - protocolFee)`
  - Protocol fee = 20% (PROTOCOL_FEE_NUMERATOR = 200,000 / 1,000,000)
  - Creator keeps 80% of LP fees
- **In ETH**: Convert using ETH price

### 8. Export Config (`ExportConfig.tsx`)

Generate a ready-to-use SDK config:
```typescript
import { LiquidSDK } from "liquid-sdk";

const config = {
  name: "MyToken",
  symbol: "MTK",
  tickIfToken0IsLiquid: -230400,  // from simulator (SDK default starting tick)
  tickSpacing: 200,
  tickLower: [-230400, -216000, -202000, -155000, -141000],
  tickUpper: [-216000, -155000, -155000, -120000, -120000],
  positionBps: [1000, 5000, 1500, 2000, 500],
  // ... extensions if configured
};

const result = await sdk.deployToken(config);
```

## State Management

Single `useSimulator` hook manages all state:

Only inputs are real state — `simState` and chart series are derived via `useMemo` so they cannot drift from inputs.

```typescript
interface SimulatorInputs {
  startingMcapUSD: number;
  ethPriceUSD: number;
  feeRate: number; // 0.01, 0.02, or 0.03
  tickSpacing: number;
  airdropPct: number;
  vaultPct: number;
  presalePct: number;
  positions: { tickLower: number; tickUpper: number; positionBps: number }[];
  buys: number[]; // ETH amounts in append order; cap to last 50 for replay cost
}

// Derived (never stored):
//   precomputed = useMemo(() => precomputePositions(positions), [positions])
//   simState    = useMemo(() => buys.reduce((s, eth) => simulateBuy(s, eth, feeRate, precomputed), initial), [buys, feeRate, precomputed])
//   chartSeries = useMemo(() => buildSeries(precomputed, simState.currentTick, ethPriceUSD), [precomputed, simState.currentTick, ethPriceUSD])
```

ETH price is fetched once on mount via SWR (5-min cache) with manual override; do not refetch on input keystrokes.

## Data Flow

```
User Input (mcap, positions, allocations)
  → tick-math conversion
  → position arrays
  → liquidity distribution calculation
  → chart data
  
User clicks "Simulate Buy"
  → simulation engine processes buy
  → updates current tick / mcap
  → updates chart (supply sold line)
  → updates fee projection
  
User clicks "Export"
  → generates DeployTokenParams
  → displays as code block
  → copy to clipboard
```

## SDK Integration Points

| Simulator Feature | SDK Function | File |
|-------------------|-------------|------|
| Market cap → tick | `getTickFromMarketCapUSD()` | `src/utils/tick-math.ts` |
| Tick → market cap | `marketCapFromTickUSD()` | `src/utils/tick-math.ts` |
| Position building | `createPositionsUSD()` | `src/utils/positions.ts` |
| Default positions | `createDefaultPositions()` | `src/utils/positions.ts` |
| Position descriptions | `describePositions()` | `src/utils/positions.ts` |
| Fee encoding | `encodeStaticFeePoolData()` | `src/utils/encoding.ts` |
| MEV encoding | `encodeSniperAuctionData()` | `src/utils/encoding.ts` |
| Constants | `ADDRESSES`, `DEFAULTS`, `FEE`, `TOKEN` | `src/constants.ts` |

## Implementation Phases

### Phase 1: Core simulator (MVP)
- Position editor with presets
- Liquidity distribution chart
- Starting market cap input
- Export SDK config

### Phase 2: Buy simulation
- Simulate ETH buys
- Track price movement through positions
- Cumulative sold line on chart

### Phase 3: Fee projection
- Static fee rate selector
- Fee calculation with protocol fee deduction
- Projected revenue at various volumes

### Phase 4: Polish
- Supply allocations (airdrop/vault/presale)
- Custom buy amounts
- Live ETH price fetch
- Mobile responsive
- Deploy to Vercel

## Key Constants (from SDK)

Import directly from `liquid-sdk` — do not redefine in the simulator. The SDK is the single source of truth and bumps with protocol changes.

```typescript
import { TOKEN, FEE, DEFAULTS, POOL_POSITIONS } from "liquid-sdk";

// TOKEN.SUPPLY                       // 100B * 10^18
// TOKEN.DECIMALS                     // 18
// TOKEN.MAX_EXTENSIONS               // 10
// TOKEN.MAX_EXTENSION_BPS            // 9000

// FEE.DENOMINATOR                    // 1_000_000 (100%)
// FEE.PROTOCOL_FEE_NUMERATOR         // 200_000 (20% of LP fees)
// FEE.MAX_LP_FEE                     // 100_000 (10%)
// FEE.MAX_MEV_FEE                    // 800_000 (80%)
// FEE.BPS                            // 10_000

// DEFAULTS.TICK_SPACING              // 200
// DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID  // -230400
// DEFAULTS.PAIRED_FEE_BPS            // 100 (1%)
// DEFAULTS.LIQUID_FEE_BPS            // 100 (1%)

// POOL_POSITIONS.Liquid              // 5-position layout used in Export examples
// POOL_POSITIONS.Standard            // single full-range position
```

`MAX_POSITIONS = 7` is enforced by `createPositions()` in `liquid-sdk/src/utils/positions.ts`; reuse that helper for validation rather than duplicating the constant.

## Deployment

- Host on Vercel (already connected via MCP)
- Domain: `simulator.liquidprotocol.xyz` or similar
- Add to SDK README and llms.txt as a tool reference
