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
│   │   ├── tick-math.ts         # Import from liquid-sdk or port
│   │   ├── positions.ts         # Import from liquid-sdk or port
│   │   ├── simulation.ts        # Buy simulation engine
│   │   ├── fee-calculator.ts    # Fee projection math
│   │   └── constants.ts         # Liquid Protocol defaults
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
  tokensRemaining: bigint[]; // per position
  cumulativeFees: number;
}

function simulateBuy(state: SimState, ethAmount: number, feeRate: number): SimState {
  let remainingETH = ethAmount;
  const fee = remainingETH * feeRate;
  remainingETH -= fee;
  
  // Walk through positions from current tick upward
  // Each position has a token reserve that gets consumed
  // Price increases as tokens are bought within each range
  // When a position is exhausted, move to the next one
  
  // Uses concentrated liquidity math:
  // For each position: L = supply / (sqrt(price_upper) - sqrt(price_lower))
  // Tokens out = L * (sqrt(price_current) - sqrt(price_lower))
  // ETH in = L * (1/sqrt(price_lower) - 1/sqrt(price_current))
  
  return newState;
}
```

Key math from Uniswap V4 concentrated liquidity:
- `price = 1.0001^tick`
- `L (liquidity) = tokenReserve / (sqrt(priceUpper) - sqrt(priceLower))`
- `ETH needed = L * (sqrt(priceAfter) - sqrt(priceBefore))` (simplified for token0/token1 ordering)

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
  tickIfToken0IsLiquid: -226600,  // from simulator
  tickSpacing: 200,
  tickLower: [-226600, -216000, -202000, -155000, -141000],
  tickUpper: [-216000, -155000, -155000, -120000, -120000],
  positionBps: [1000, 5000, 1500, 2000, 500],
  // ... extensions if configured
};

const result = await sdk.deployToken(config);
```

## State Management

Single `useSimulator` hook manages all state:

```typescript
interface SimulatorState {
  // Config
  startingMcapUSD: number;
  ethPriceUSD: number;
  feeRate: number; // 0.01, 0.02, or 0.03
  tickSpacing: number;
  
  // Supply
  airdropPct: number;
  vaultPct: number;
  presalePct: number;
  
  // Positions
  positions: { tickLower: number; tickUpper: number; positionBps: number }[];
  
  // Simulation
  buys: number[]; // ETH amounts
  simState: SimState;
}
```

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

```typescript
// Token
const TOTAL_SUPPLY = 100_000_000_000n * 10n ** 18n; // 100B tokens

// Fees
const FEE_DENOMINATOR = 1_000_000;     // 100%
const PROTOCOL_FEE = 200_000;          // 20% of LP fees
const MAX_LP_FEE = 100_000;            // 10%
const MAX_MEV_FEE = 800_000;           // 80%

// Positions
const MAX_POSITIONS = 7;
const BPS_DENOMINATOR = 10_000;
const DEFAULT_TICK_SPACING = 200;

// Default: 5-position Liquid layout
const DEFAULT_POSITIONS = [
  { tickLower: -230400, tickUpper: -216000, positionBps: 1000 },  // 10%
  { tickLower: -216000, tickUpper: -155000, positionBps: 5000 },  // 50%
  { tickLower: -202000, tickUpper: -155000, positionBps: 1500 },  // 15%
  { tickLower: -155000, tickUpper: -120000, positionBps: 2000 },  // 20%
  { tickLower: -141000, tickUpper: -120000, positionBps: 500 },   // 5%
];
```

## Deployment

- Host on Vercel (already connected via MCP)
- Domain: `simulator.liquidprotocol.xyz` or similar
- Add to SDK README and llms.txt as a tool reference
