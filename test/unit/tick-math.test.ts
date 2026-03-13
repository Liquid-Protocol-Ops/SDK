import { describe, it, expect } from "vitest";
import {
  getTickFromMarketCapETH,
  getTickFromMarketCapUSD,
  getTickFromMarketCapStable,
  marketCapFromTickETH,
  marketCapFromTickUSD,
} from "../../src/utils/tick-math";

describe("getTickFromMarketCapETH", () => {
  it("returns -230400 for 10 ETH market cap (standard starting tick)", () => {
    expect(getTickFromMarketCapETH(10)).toBe(-230400);
  });

  it("returns a more negative tick for smaller market caps", () => {
    const tick5 = getTickFromMarketCapETH(5);
    const tick10 = getTickFromMarketCapETH(10);
    expect(tick5).toBeLessThan(tick10);
  });

  it("returns a less negative tick for larger market caps", () => {
    const tick10 = getTickFromMarketCapETH(10);
    const tick100 = getTickFromMarketCapETH(100);
    expect(tick100).toBeGreaterThan(tick10);
  });

  it("aligns to tick spacing of 200 by default", () => {
    const tick = getTickFromMarketCapETH(10);
    expect(tick % 200 === 0).toBe(true);
  });

  it("aligns to custom tick spacing", () => {
    const tick = getTickFromMarketCapETH(10, 60);
    expect(tick % 60 === 0).toBe(true);
  });

  it("throws for non-positive market cap", () => {
    expect(() => getTickFromMarketCapETH(0)).toThrow("must be positive");
    expect(() => getTickFromMarketCapETH(-1)).toThrow("must be positive");
  });

  it("produces correct tick for 20 ETH (TwentyETH preset range)", () => {
    // Clanker's TwentyETH uses -223400 for starting tick
    const tick = getTickFromMarketCapETH(20);
    // Should be close to -223400 (within one tick spacing)
    expect(tick).toBeGreaterThanOrEqual(-223600);
    expect(tick).toBeLessThanOrEqual(-223200);
  });
});

describe("getTickFromMarketCapUSD", () => {
  const ethPrice = 2070;

  it("converts USD market cap to tick via ETH", () => {
    // $20,700 at $2070/ETH = 10 ETH → should give -230400
    const tick = getTickFromMarketCapUSD(20_700, ethPrice);
    expect(tick).toBe(-230400);
  });

  it("$500K market cap produces a tick between -200000 and -196000", () => {
    const tick = getTickFromMarketCapUSD(500_000, ethPrice);
    expect(tick).toBeGreaterThan(-200000);
    expect(tick).toBeLessThan(-196000);
  });

  it("$10M market cap produces a tick around -168000 to -170000", () => {
    const tick = getTickFromMarketCapUSD(10_000_000, ethPrice);
    expect(tick).toBeGreaterThan(-170000);
    expect(tick).toBeLessThan(-166000);
  });

  it("$1B market cap produces a tick around -122000 to -124000", () => {
    const tick = getTickFromMarketCapUSD(1_000_000_000, ethPrice);
    expect(tick).toBeGreaterThan(-124000);
    expect(tick).toBeLessThan(-120000);
  });

  it("throws for non-positive ETH price", () => {
    expect(() => getTickFromMarketCapUSD(500_000, 0)).toThrow("must be positive");
  });
});

describe("marketCapFromTickETH", () => {
  it("round-trips with getTickFromMarketCapETH (within tick spacing precision)", () => {
    const originalMarketCap = 10;
    const tick = getTickFromMarketCapETH(originalMarketCap);
    const recovered = marketCapFromTickETH(tick);
    // Due to tick spacing alignment, recovered won't be exactly 10
    // but should be within ~2% (one tick spacing = 200 ticks ≈ 2% price)
    expect(recovered).toBeGreaterThan(originalMarketCap * 0.97);
    expect(recovered).toBeLessThan(originalMarketCap * 1.03);
  });

  it("returns approximately 10 ETH for tick -230400", () => {
    const mcap = marketCapFromTickETH(-230400);
    expect(mcap).toBeGreaterThan(9);
    expect(mcap).toBeLessThan(11);
  });
});

describe("marketCapFromTickUSD", () => {
  it("multiplies ETH market cap by ETH price", () => {
    const ethPrice = 2070;
    const mcapETH = marketCapFromTickETH(-230400);
    const mcapUSD = marketCapFromTickUSD(-230400, ethPrice);
    expect(mcapUSD).toBeCloseTo(mcapETH * ethPrice, 0);
  });
});

describe("getTickFromMarketCapStable", () => {
  it("works for USDC (6 decimals)", () => {
    const tick = getTickFromMarketCapStable(10_000, 6);
    expect(tick % 200 === 0).toBe(true);
    // Should be a very negative tick for a small market cap
    expect(tick).toBeLessThan(-400000);
  });

  it("produces different ticks for different decimal stablecoins", () => {
    const tick6 = getTickFromMarketCapStable(10_000, 6);
    const tick18 = getTickFromMarketCapStable(10_000, 18);
    expect(tick6).not.toBe(tick18);
  });
});
