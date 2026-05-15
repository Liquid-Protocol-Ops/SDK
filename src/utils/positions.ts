/**
 * Multi-tranche liquidity position builder.
 *
 * Creates position arrays (tickLower[], tickUpper[], positionBps[]) from
 * market cap milestones. Percentages represent share of the *pool supply*
 * (i.e. after dev buy, airdrop, and vault allocations are deducted).
 */

import { getTickFromMarketCapETH, getTickFromMarketCapUSD } from "./tick-math";
import { POOL_POSITIONS, DEFAULTS, type PoolPosition } from "../constants";

// ── Types ────────────────────────────────────────────────────────────

export interface MarketCapTranche {
  /** Upper bound market cap in ETH for this tranche */
  upperMarketCapETH: number;
  /** Percentage of pool supply allocated to this tranche (1-100) */
  supplyPct: number;
}

export interface MarketCapTrancheUSD {
  /** Upper bound market cap in USD for this tranche */
  upperMarketCapUSD: number;
  /** Percentage of pool supply allocated to this tranche (1-100) */
  supplyPct: number;
}

export interface PositionConfig {
  tickLower: number;
  tickUpper: number;
  positionBps: number;
}

export interface PositionArrays {
  tickLower: number[];
  tickUpper: number[];
  positionBps: number[];
}

// ── Default tranches ─────────────────────────────────────────────────

/**
 * Default Liquid tranches (USD-denominated).
 *
 * - Starting → $500K market cap: 40% of pool supply
 * - $500K → $10M market cap:     50% of pool supply
 * - $10M → $1B market cap:       10% of pool supply
 */
export const DEFAULT_TRANCHES_USD: MarketCapTrancheUSD[] = [
  { upperMarketCapUSD: 500_000, supplyPct: 40 },
  { upperMarketCapUSD: 10_000_000, supplyPct: 50 },
  { upperMarketCapUSD: 1_000_000_000, supplyPct: 10 },
];

// ── Builders ─────────────────────────────────────────────────────────

/**
 * Build position arrays from ETH-denominated market cap tranches.
 *
 * @param startingMarketCapETH - Initial market cap in ETH (determines the starting tick)
 * @param tranches - Array of tranches with upper market cap bounds and supply percentages
 * @param tickSpacing - Tick spacing (default 200)
 * @returns Position arrays ready to pass to `deployToken()`
 *
 * @example
 * ```ts
 * const positions = createPositions(10, [
 *   { upperMarketCapETH: 241.5, supplyPct: 40 },  // ~$500K at $2070/ETH
 *   { upperMarketCapETH: 4830,  supplyPct: 50 },   // ~$10M
 *   { upperMarketCapETH: 483050, supplyPct: 10 },   // ~$1B
 * ]);
 * // → { tickLower: [-230400, -198600, -168600],
 * //     tickUpper: [-198600, -168600, -122400],
 * //     positionBps: [4000, 5000, 1000] }
 * ```
 */
export function createPositions(
  startingMarketCapETH: number,
  tranches: MarketCapTranche[],
  tickSpacing: number = 200,
): PositionArrays {
  if (tranches.length === 0) throw new Error("At least one tranche is required");
  if (tranches.length > 7) throw new Error("Maximum 7 positions allowed");

  const totalPct = tranches.reduce((sum, t) => sum + t.supplyPct, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Tranche percentages must sum to 100, got ${totalPct}`);
  }

  // Validate tranches are ordered by ascending market cap
  for (let i = 1; i < tranches.length; i++) {
    if (tranches[i].upperMarketCapETH <= tranches[i - 1].upperMarketCapETH) {
      throw new Error("Tranches must be ordered by ascending upperMarketCapETH");
    }
  }

  const startingTick = getTickFromMarketCapETH(startingMarketCapETH, tickSpacing);

  const tickLower: number[] = [];
  const tickUpper: number[] = [];
  const positionBps: number[] = [];

  let prevTick = startingTick;

  for (const tranche of tranches) {
    const upperTick = getTickFromMarketCapETH(tranche.upperMarketCapETH, tickSpacing);

    if (upperTick <= prevTick) {
      throw new Error(
        `Tranche upper market cap ${tranche.upperMarketCapETH} ETH resolves to tick ${upperTick}, ` +
        `which is not above previous tick ${prevTick}. Increase the market cap or reduce tick spacing.`
      );
    }

    tickLower.push(prevTick);
    tickUpper.push(upperTick);
    positionBps.push(Math.round(tranche.supplyPct * 100)); // pct → bps

    prevTick = upperTick;
  }

  return { tickLower, tickUpper, positionBps };
}

/**
 * Build position arrays from USD-denominated market cap tranches.
 * Convenience wrapper that converts USD → ETH using the provided ETH price.
 *
 * @param startingMarketCapUSD - Initial market cap in USD
 * @param ethPriceUSD - Current ETH price in USD
 * @param tranches - Array of tranches with upper USD market cap bounds
 * @param tickSpacing - Tick spacing (default 200)
 * @returns Position arrays ready to pass to `deployToken()`
 *
 * @example
 * ```ts
 * const positions = createPositionsUSD(20_000, 2070, [
 *   { upperMarketCapUSD: 500_000,       supplyPct: 40 },
 *   { upperMarketCapUSD: 10_000_000,    supplyPct: 50 },
 *   { upperMarketCapUSD: 1_000_000_000, supplyPct: 10 },
 * ]);
 * ```
 */
export function createPositionsUSD(
  startingMarketCapUSD: number,
  ethPriceUSD: number,
  tranches: MarketCapTrancheUSD[],
  tickSpacing: number = 200,
): PositionArrays {
  if (ethPriceUSD <= 0) throw new Error("ethPriceUSD must be positive");

  const ethTranches: MarketCapTranche[] = tranches.map((t) => ({
    upperMarketCapETH: t.upperMarketCapUSD / ethPriceUSD,
    supplyPct: t.supplyPct,
  }));

  return createPositions(
    startingMarketCapUSD / ethPriceUSD,
    ethTranches,
    tickSpacing,
  );
}

/**
 * Build default Liquid positions using the standard 3-tranche split.
 *
 * - Starting → $500K:  40% of pool supply
 * - $500K → $10M:      50% of pool supply
 * - $10M → $1B:        10% of pool supply
 *
 * @param startingMarketCapUSD - Initial market cap in USD (e.g. 20_000 for ~10 ETH)
 * @param ethPriceUSD - Current ETH price in USD
 * @param tickSpacing - Tick spacing (default 200)
 *
 * @example
 * ```ts
 * const positions = createDefaultPositions(20_000, 2070);
 * const tx = await sdk.deployToken({
 *   name: "MyToken",
 *   symbol: "MTK",
 *   ...positions,
 * });
 * ```
 */
export function createDefaultPositions(
  startingMarketCapUSD: number,
  ethPriceUSD: number,
  tickSpacing: number = 200,
): PositionArrays & { tickIfToken0IsLiquid: number } {
  const positions = createPositionsUSD(
    startingMarketCapUSD,
    ethPriceUSD,
    DEFAULT_TRANCHES_USD,
    tickSpacing,
  );

  return {
    ...positions,
    tickIfToken0IsLiquid: positions.tickLower[0],
  };
}

/**
 * Shift every tick in a position layout by a fixed amount, preserving the
 * positionBps splits. The primitive behind `createLiquidPositionsUSD` — it
 * re-anchors a fixed-shape layout (e.g. `POOL_POSITIONS.Liquid`) to a
 * different starting tick.
 *
 * `shiftBy` should be a multiple of the pool's tick spacing so the shifted
 * ticks stay aligned. A difference of two aligned ticks is always aligned,
 * so deriving it as `targetTick - sourceBottomTick` is safe.
 *
 * @param positions - Source positions (e.g. `POOL_POSITIONS.Liquid`)
 * @param shiftBy - Ticks to add to every tickLower/tickUpper (may be negative)
 * @returns A fresh array — the source is not mutated
 */
export function shiftPositions(
  positions: readonly PoolPosition[],
  shiftBy: number,
): PoolPosition[] {
  return positions.map((p) => ({
    tickLower: p.tickLower + shiftBy,
    tickUpper: p.tickUpper + shiftBy,
    positionBps: p.positionBps,
  }));
}

/**
 * Build the canonical 5-position "Liquid" layout (10/50/15/20/5) re-anchored
 * to a starting market cap, denominated in the *paired token's* USD price.
 *
 * Works for any pair token — pass the price of whatever the pool is paired
 * against:
 *   - WETH-paired: `createLiquidPositionsUSD(20_000, ethPriceUSD)`
 *   - DIEM-paired: `createLiquidPositionsUSD(20_000, diemPriceUSD)`
 *
 * Unlike `createDefaultPositions` (a 3-tranche layout), this preserves the
 * exact shape of `POOL_POSITIONS.Liquid` — the same curve `deployToken()`
 * uses by default — just shifted so its bottom sits at the requested start.
 *
 * @param startingMarketCapUSD - Initial market cap in USD
 * @param pairedTokenPriceUSD - USD price of the token the pool is paired against
 * @param tickSpacing - Tick spacing (default 200)
 * @returns Position arrays + `tickIfToken0IsLiquid`, ready to spread into `deployToken()`
 *
 * @example
 * ```ts
 * import { LiquidSDK, EXTERNAL, createLiquidPositionsUSD } from "liquid-sdk";
 *
 * const positions = createLiquidPositionsUSD(20_000, diemPriceUSD);
 * await sdk.deployToken({
 *   name: "Agent Token",
 *   symbol: "AGENT",
 *   pairedToken: EXTERNAL.DIEM,
 *   ...positions,
 * });
 * ```
 */
export function createLiquidPositionsUSD(
  startingMarketCapUSD: number,
  pairedTokenPriceUSD: number,
  tickSpacing: number = 200,
): PositionArrays & { tickIfToken0IsLiquid: number } {
  if (pairedTokenPriceUSD <= 0) {
    throw new Error("pairedTokenPriceUSD must be positive");
  }

  const startingTick = getTickFromMarketCapUSD(
    startingMarketCapUSD,
    pairedTokenPriceUSD,
    tickSpacing,
  );
  const shifted = shiftPositions(
    POOL_POSITIONS.Liquid,
    startingTick - DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID,
  );

  return {
    tickLower: shifted.map((p) => p.tickLower),
    tickUpper: shifted.map((p) => p.tickUpper),
    positionBps: shifted.map((p) => p.positionBps),
    tickIfToken0IsLiquid: startingTick,
  };
}

/**
 * Describe positions as human-readable market cap ranges.
 * Useful for displaying position info in UIs.
 *
 * @param positions - Position arrays
 * @param ethPriceUSD - Optional ETH price for USD display
 */
export function describePositions(
  positions: PositionArrays,
  ethPriceUSD?: number,
): Array<{
  index: number;
  tickLower: number;
  tickUpper: number;
  supplyPct: number;
  marketCapLowerETH: number;
  marketCapUpperETH: number;
  marketCapLowerUSD?: number;
  marketCapUpperUSD?: number;
}> {
  return positions.tickLower.map((_, i) => {
    const lowerETH = Math.pow(1.0001, positions.tickLower[i]) * 1e11;
    const upperETH = Math.pow(1.0001, positions.tickUpper[i]) * 1e11;
    return {
      index: i,
      tickLower: positions.tickLower[i],
      tickUpper: positions.tickUpper[i],
      supplyPct: positions.positionBps[i] / 100,
      marketCapLowerETH: lowerETH,
      marketCapUpperETH: upperETH,
      ...(ethPriceUSD != null && {
        marketCapLowerUSD: lowerETH * ethPriceUSD,
        marketCapUpperUSD: upperETH * ethPriceUSD,
      }),
    };
  });
}
