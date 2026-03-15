import { describe, it, expect } from "vitest";
import {
  createPositions,
  createPositionsUSD,
  createDefaultPositions,
  describePositions,
  DEFAULT_TRANCHES_USD,
} from "../../src/utils/positions";
import { getTickFromMarketCapETH } from "../../src/utils/tick-math";
import { POOL_POSITIONS } from "../../src/constants";

describe("createPositions", () => {
  it("creates 3 positions from default-style tranches", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    expect(result.tickLower).toHaveLength(3);
    expect(result.tickUpper).toHaveLength(3);
    expect(result.positionBps).toHaveLength(3);
  });

  it("positions are contiguous (each upper = next lower)", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    expect(result.tickLower[1]).toBe(result.tickUpper[0]);
    expect(result.tickLower[2]).toBe(result.tickUpper[1]);
  });

  it("first position starts at the starting tick", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    expect(result.tickLower[0]).toBe(getTickFromMarketCapETH(10));
  });

  it("positionBps sum to 10000", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    const total = result.positionBps.reduce((s, b) => s + b, 0);
    expect(total).toBe(10_000);
  });

  it("converts percentages to bps correctly", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    expect(result.positionBps[0]).toBe(4000);
    expect(result.positionBps[1]).toBe(5000);
    expect(result.positionBps[2]).toBe(1000);
  });

  it("all ticks are aligned to tick spacing", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    for (const t of [...result.tickLower, ...result.tickUpper]) {
      expect(t % 200 === 0).toBe(true);
    }
  });

  it("all tickLower < tickUpper per position", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 250, supplyPct: 40 },
      { upperMarketCapETH: 5000, supplyPct: 50 },
      { upperMarketCapETH: 500_000, supplyPct: 10 },
    ]);

    for (let i = 0; i < result.tickLower.length; i++) {
      expect(result.tickLower[i]).toBeLessThan(result.tickUpper[i]);
    }
  });

  it("throws if percentages don't sum to 100", () => {
    expect(() =>
      createPositions(10, [
        { upperMarketCapETH: 250, supplyPct: 40 },
        { upperMarketCapETH: 5000, supplyPct: 50 },
      ])
    ).toThrow("must sum to 100");
  });

  it("throws if tranches are not ordered by ascending market cap", () => {
    expect(() =>
      createPositions(10, [
        { upperMarketCapETH: 5000, supplyPct: 50 },
        { upperMarketCapETH: 250, supplyPct: 40 },
        { upperMarketCapETH: 500_000, supplyPct: 10 },
      ])
    ).toThrow("ascending");
  });

  it("throws if more than 7 tranches", () => {
    const tranches = Array.from({ length: 8 }, (_, i) => ({
      upperMarketCapETH: (i + 1) * 100,
      supplyPct: 12.5,
    }));
    expect(() => createPositions(10, tranches)).toThrow("Maximum 7");
  });

  it("throws for empty tranches", () => {
    expect(() => createPositions(10, [])).toThrow("At least one");
  });

  it("works with a single tranche (100%)", () => {
    const result = createPositions(10, [
      { upperMarketCapETH: 500_000, supplyPct: 100 },
    ]);

    expect(result.tickLower).toHaveLength(1);
    expect(result.positionBps[0]).toBe(10_000);
  });
});

describe("createPositionsUSD", () => {
  const ethPrice = 2070;

  it("produces same result as manual ETH conversion", () => {
    const fromUSD = createPositionsUSD(20_700, ethPrice, [
      { upperMarketCapUSD: 500_000, supplyPct: 40 },
      { upperMarketCapUSD: 10_000_000, supplyPct: 50 },
      { upperMarketCapUSD: 1_000_000_000, supplyPct: 10 },
    ]);

    const fromETH = createPositions(10, [
      { upperMarketCapETH: 500_000 / ethPrice, supplyPct: 40 },
      { upperMarketCapETH: 10_000_000 / ethPrice, supplyPct: 50 },
      { upperMarketCapETH: 1_000_000_000 / ethPrice, supplyPct: 10 },
    ]);

    expect(fromUSD).toEqual(fromETH);
  });

  it("throws for non-positive ETH price", () => {
    expect(() =>
      createPositionsUSD(20_000, 0, [{ upperMarketCapUSD: 500_000, supplyPct: 100 }])
    ).toThrow("must be positive");
  });
});

describe("createDefaultPositions", () => {
  const ethPrice = 2070;

  it("creates 3 positions with 40/50/10 split", () => {
    const result = createDefaultPositions(20_700, ethPrice);

    expect(result.tickLower).toHaveLength(3);
    expect(result.positionBps).toEqual([4000, 5000, 1000]);
  });

  it("includes tickIfToken0IsLiquid equal to first tickLower", () => {
    const result = createDefaultPositions(20_700, ethPrice);
    expect(result.tickIfToken0IsLiquid).toBe(result.tickLower[0]);
  });

  it("starting tick is -230400 for ~10 ETH at $2070", () => {
    const result = createDefaultPositions(20_700, ethPrice);
    expect(result.tickIfToken0IsLiquid).toBe(-230400);
  });

  it("adapts ticks when ETH price changes", () => {
    const at2000 = createDefaultPositions(20_000, 2000);
    const at4000 = createDefaultPositions(20_000, 4000);

    // Same USD starting market cap but different ETH prices
    // → different ETH market caps → different starting ticks
    expect(at2000.tickIfToken0IsLiquid).not.toBe(at4000.tickIfToken0IsLiquid);
  });
});

describe("describePositions", () => {
  it("returns human-readable position info", () => {
    const positions = createDefaultPositions(20_700, 2070);
    const described = describePositions(positions);

    expect(described).toHaveLength(3);
    expect(described[0].supplyPct).toBe(40);
    expect(described[1].supplyPct).toBe(50);
    expect(described[2].supplyPct).toBe(10);
  });

  it("includes USD market caps when ethPriceUSD is provided", () => {
    const positions = createDefaultPositions(20_700, 2070);
    const described = describePositions(positions, 2070);

    expect(described[0].marketCapLowerUSD).toBeDefined();
    expect(described[0].marketCapUpperUSD).toBeDefined();

    // First position upper should be around $500K
    expect(described[0].marketCapUpperUSD!).toBeGreaterThan(400_000);
    expect(described[0].marketCapUpperUSD!).toBeLessThan(600_000);
  });

  it("omits USD values when ethPriceUSD is not provided", () => {
    const positions = createDefaultPositions(20_700, 2070);
    const described = describePositions(positions);

    expect(described[0].marketCapLowerUSD).toBeUndefined();
  });
});

describe("DEFAULT_TRANCHES_USD", () => {
  it("has 3 tranches summing to 100%", () => {
    expect(DEFAULT_TRANCHES_USD).toHaveLength(3);
    const total = DEFAULT_TRANCHES_USD.reduce((s, t) => s + t.supplyPct, 0);
    expect(total).toBe(100);
  });

  it("has market cap milestones at $500K, $10M, $1B", () => {
    expect(DEFAULT_TRANCHES_USD[0].upperMarketCapUSD).toBe(500_000);
    expect(DEFAULT_TRANCHES_USD[1].upperMarketCapUSD).toBe(10_000_000);
    expect(DEFAULT_TRANCHES_USD[2].upperMarketCapUSD).toBe(1_000_000_000);
  });
});

describe("POOL_POSITIONS presets", () => {
  it("Standard has 1 position with 10000 bps", () => {
    expect(POOL_POSITIONS.Standard).toHaveLength(1);
    expect(POOL_POSITIONS.Standard[0].positionBps).toBe(10_000);
  });

  it("Liquid has 5 positions with 10/50/15/20/5 split", () => {
    expect(POOL_POSITIONS.Liquid).toHaveLength(5);
    const bps = POOL_POSITIONS.Liquid.map((p) => p.positionBps);
    expect(bps).toEqual([1000, 5000, 1500, 2000, 500]);
    expect(bps.reduce((s, b) => s + b, 0)).toBe(10_000);
  });

  it("Liquid positions all have valid tick ranges", () => {
    for (const pos of POOL_POSITIONS.Liquid) {
      expect(pos.tickLower).toBeLessThan(pos.tickUpper);
    }
  });

  it("all position ticks are aligned to 200", () => {
    for (const preset of Object.values(POOL_POSITIONS)) {
      for (const pos of preset) {
        expect(pos.tickLower % 200 === 0).toBe(true);
        expect(pos.tickUpper % 200 === 0).toBe(true);
      }
    }
  });
});
