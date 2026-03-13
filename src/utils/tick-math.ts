/**
 * Tick ↔ market cap conversion utilities for Uniswap V4 concentrated liquidity.
 *
 * All tokens have 100B supply (10^11) with 18 decimals.
 * Price per token = marketCap / totalSupply.
 * Tick = log(price) / log(1.0001), aligned to tickSpacing.
 */

const LOG_BASE = Math.log(1.0001);
const DEFAULT_TICK_SPACING = 200;

/**
 * Total human-readable supply for every Liquid token: 100 billion.
 * Used to derive price-per-token from market cap.
 */
const TOTAL_SUPPLY = 1e11; // 100,000,000,000

/**
 * Convert an ETH-denominated market cap to a Uniswap V4 tick.
 *
 * @param marketCapETH - Market cap in ETH (e.g. 10 for a 10 ETH starting cap)
 * @param tickSpacing - Tick spacing to align to (default 200)
 * @returns Tick value (int24) aligned to tickSpacing
 *
 * @example
 * ```ts
 * getTickFromMarketCapETH(10)   // → -230400  (≈10 ETH market cap)
 * getTickFromMarketCapETH(200)  // → -200200  (≈200 ETH)
 * ```
 */
export function getTickFromMarketCapETH(
  marketCapETH: number,
  tickSpacing: number = DEFAULT_TICK_SPACING,
): number {
  if (marketCapETH <= 0) throw new Error("marketCapETH must be positive");
  const price = marketCapETH / TOTAL_SUPPLY; // WETH per token
  const rawTick = Math.log(price) / LOG_BASE;
  return Math.floor(rawTick / tickSpacing) * tickSpacing;
}

/**
 * Convert a USD-denominated market cap to a Uniswap V4 tick.
 *
 * @param marketCapUSD - Market cap in USD (e.g. 500_000 for $500K)
 * @param ethPriceUSD - Current ETH price in USD (e.g. 2070)
 * @param tickSpacing - Tick spacing to align to (default 200)
 * @returns Tick value (int24) aligned to tickSpacing
 *
 * @example
 * ```ts
 * getTickFromMarketCapUSD(500_000, 2070)    // tick for $500K market cap
 * getTickFromMarketCapUSD(10_000_000, 2070) // tick for $10M market cap
 * ```
 */
export function getTickFromMarketCapUSD(
  marketCapUSD: number,
  ethPriceUSD: number,
  tickSpacing: number = DEFAULT_TICK_SPACING,
): number {
  if (ethPriceUSD <= 0) throw new Error("ethPriceUSD must be positive");
  return getTickFromMarketCapETH(marketCapUSD / ethPriceUSD, tickSpacing);
}

/**
 * Convert a tick back to an ETH-denominated market cap.
 *
 * @param tick - Uniswap V4 tick value
 * @returns Market cap in ETH
 *
 * @example
 * ```ts
 * marketCapFromTickETH(-230400)  // ≈ 10 ETH
 * ```
 */
export function marketCapFromTickETH(tick: number): number {
  const price = Math.pow(1.0001, tick);
  return price * TOTAL_SUPPLY;
}

/**
 * Convert a tick to a USD-denominated market cap.
 *
 * @param tick - Uniswap V4 tick value
 * @param ethPriceUSD - Current ETH price in USD
 * @returns Market cap in USD
 */
export function marketCapFromTickUSD(tick: number, ethPriceUSD: number): number {
  return marketCapFromTickETH(tick) * ethPriceUSD;
}

/**
 * Convert a market cap in a stablecoin to a tick.
 * Supports any stablecoin decimal count (6 for USDC, 18 for DAI, etc.)
 *
 * @param marketCap - Market cap in stablecoin units
 * @param stableDecimals - Decimals of the stablecoin (e.g. 6 for USDC)
 * @param tickSpacing - Tick spacing (default 200)
 * @returns Tick value aligned to tickSpacing
 */
export function getTickFromMarketCapStable(
  marketCap: number,
  stableDecimals: number,
  tickSpacing: number = DEFAULT_TICK_SPACING,
): number {
  if (marketCap <= 0) throw new Error("marketCap must be positive");
  // price = (marketCap * 10^stableDecimals) / 10^29
  const price = marketCap / Math.pow(10, 29 - stableDecimals);
  const rawTick = Math.log(price) / LOG_BASE;
  return Math.floor(rawTick / tickSpacing) * tickSpacing;
}
