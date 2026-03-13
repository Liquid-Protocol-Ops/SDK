import { describe, it, expect } from "vitest";
import { decodeAbiParameters } from "viem";
import {
  encodeStaticFeePoolData,
  encodeDynamicFeePoolData,
  encodeSniperAuctionData,
} from "../../src/utils/encoding";

describe("encodeStaticFeePoolData", () => {
  it("encodes 1% fee both directions", () => {
    const result = encodeStaticFeePoolData(100, 100);
    expect(result).toMatch(/^0x[0-9a-f]+$/);
  });

  it("encodes a non-trivial hex string (two-layer encoding)", () => {
    const result = encodeStaticFeePoolData(100, 100);
    // Two-layer encoding should produce substantial hex data
    expect(result.length).toBeGreaterThan(200);
  });

  it("different fees produce different encodings", () => {
    const fee100 = encodeStaticFeePoolData(100, 100);
    const fee200 = encodeStaticFeePoolData(200, 200);
    expect(fee100).not.toBe(fee200);
  });

  it("outer layer decodes to PoolInitializationData struct", () => {
    const result = encodeStaticFeePoolData(100, 100);
    const decoded = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "extension", type: "address" },
            { name: "extensionData", type: "bytes" },
            { name: "feeData", type: "bytes" },
          ],
        },
      ],
      result
    );

    expect(decoded[0].extension).toBe("0x0000000000000000000000000000000000000000");
    expect(decoded[0].extensionData).toBe("0x");

    // Inner feeData should decode to [uint24, uint24]
    const feeData = decodeAbiParameters(
      [{ type: "uint24" }, { type: "uint24" }],
      decoded[0].feeData as `0x${string}`
    );

    // 100 bps * 100 = 10000 uniBps
    expect(feeData[0]).toBe(10000);
    expect(feeData[1]).toBe(10000);
  });

  it("converts bps to uniBps correctly (multiplies by 100)", () => {
    const result = encodeStaticFeePoolData(50, 150);
    const decoded = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "extension", type: "address" },
            { name: "extensionData", type: "bytes" },
            { name: "feeData", type: "bytes" },
          ],
        },
      ],
      result
    );

    const feeData = decodeAbiParameters(
      [{ type: "uint24" }, { type: "uint24" }],
      decoded[0].feeData as `0x${string}`
    );

    expect(feeData[0]).toBe(5000);  // 50 bps * 100
    expect(feeData[1]).toBe(15000); // 150 bps * 100
  });
});

describe("encodeDynamicFeePoolData", () => {
  it("encodes dynamic fee config", () => {
    const result = encodeDynamicFeePoolData({
      baseFeeBps: 100,
      maxFeeBps: 500,
      referenceTickFilterPeriod: 30,
      resetPeriod: 120,
      resetTickFilter: 200,
      feeControlNumerator: 500000000n,
      decayFilterBps: 7500,
    });
    expect(result).toMatch(/^0x[0-9a-f]+$/);
    expect(result.length).toBeGreaterThan(200);
  });
});

describe("encodeSniperAuctionData", () => {
  it("encodes 80% → 40% over 32 seconds (default)", () => {
    const result = encodeSniperAuctionData({
      startingFee: 800_000,
      endingFee: 400_000,
      secondsToDecay: 32,
    });
    expect(result).toMatch(/^0x[0-9a-f]+$/);
  });

  it("decodes back to correct values", () => {
    const result = encodeSniperAuctionData({
      startingFee: 800_000,
      endingFee: 400_000,
      secondsToDecay: 32,
    });

    const decoded = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "startingFee", type: "uint24" },
            { name: "endingFee", type: "uint24" },
            { name: "secondsToDecay", type: "uint256" },
          ],
        },
      ],
      result
    );

    expect(decoded[0].startingFee).toBe(800_000);
    expect(decoded[0].endingFee).toBe(400_000);
    expect(decoded[0].secondsToDecay).toBe(32n);
  });

  it("throws if startingFee <= endingFee", () => {
    expect(() =>
      encodeSniperAuctionData({
        startingFee: 400_000,
        endingFee: 800_000,
        secondsToDecay: 32,
      })
    ).toThrow("startingFee must be greater than endingFee");
  });

  it("throws if secondsToDecay is not positive", () => {
    expect(() =>
      encodeSniperAuctionData({
        startingFee: 800_000,
        endingFee: 400_000,
        secondsToDecay: 0,
      })
    ).toThrow("secondsToDecay must be positive");
  });
});
