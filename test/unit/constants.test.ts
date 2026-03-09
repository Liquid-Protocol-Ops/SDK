import { describe, it, expect } from "vitest";
import { isAddress, getAddress } from "viem";
import {
  ADDRESSES,
  EXTERNAL,
  FEE,
  TOKEN,
  DEFAULT_CHAIN_ID,
  DEFAULT_CHAIN,
} from "../../src/constants";

describe("ADDRESSES", () => {
  const addressEntries = Object.entries(ADDRESSES);

  it("contains at least 12 addresses", () => {
    expect(addressEntries.length).toBeGreaterThanOrEqual(12);
  });

  it.each(addressEntries)(
    "%s is a valid checksummed address",
    (_key, value) => {
      expect(isAddress(value)).toBe(true);
      expect(getAddress(value)).toBe(value);
    }
  );
});

describe("EXTERNAL", () => {
  const externalEntries = Object.entries(EXTERNAL);

  it.each(externalEntries)(
    "%s is a valid checksummed address",
    (_key, value) => {
      expect(isAddress(value)).toBe(true);
      expect(getAddress(value)).toBe(value);
    }
  );
});

describe("FEE", () => {
  it("DENOMINATOR is 1,000,000", () => {
    expect(FEE.DENOMINATOR).toBe(1_000_000);
  });

  it("PROTOCOL_FEE_NUMERATOR is 200,000", () => {
    expect(FEE.PROTOCOL_FEE_NUMERATOR).toBe(200_000);
  });

  it("MAX_LP_FEE is 100,000", () => {
    expect(FEE.MAX_LP_FEE).toBe(100_000);
  });

  it("MAX_MEV_FEE is 800,000", () => {
    expect(FEE.MAX_MEV_FEE).toBe(800_000);
  });

  it("BPS is 10,000", () => {
    expect(FEE.BPS).toBe(10_000);
  });
});

describe("TOKEN", () => {
  it("SUPPLY is 100 billion with 18 decimals", () => {
    expect(TOKEN.SUPPLY).toBe(100_000_000_000n * 10n ** 18n);
  });

  it("DECIMALS is 18", () => {
    expect(TOKEN.DECIMALS).toBe(18);
  });

  it("MAX_EXTENSIONS is 10", () => {
    expect(TOKEN.MAX_EXTENSIONS).toBe(10);
  });

  it("MAX_EXTENSION_BPS is 9000", () => {
    expect(TOKEN.MAX_EXTENSION_BPS).toBe(9000);
  });
});

describe("Chain defaults", () => {
  it("DEFAULT_CHAIN_ID is 8453", () => {
    expect(DEFAULT_CHAIN_ID).toBe(8453);
  });

  it("DEFAULT_CHAIN is base", () => {
    expect(DEFAULT_CHAIN.id).toBe(8453);
    expect(DEFAULT_CHAIN.name).toBe("Base");
  });
});
