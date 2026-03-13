import { describe, it, expect } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { LiquidSDK } from "../../src/client";
import { ADDRESSES } from "../../src/constants";

const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const sdk = new LiquidSDK({ publicClient });

/** Retry a function up to `retries` times with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === retries - 1) throw err;
      const msg = err?.message ?? "";
      if (msg.includes("429") || msg.includes("rate limit")) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

describe(
  "Integration: read contract calls against Base mainnet",
  { timeout: 30_000, sequential: true },
  () => {
    it("isFactoryDeprecated returns a boolean", async () => {
      const result = await withRetry(() => sdk.isFactoryDeprecated());
      expect(typeof result).toBe("boolean");
    });

    it("getAuctionMaxRounds returns a bigint > 0", async () => {
      const result = await withRetry(() => sdk.getAuctionMaxRounds());
      expect(typeof result).toBe("bigint");
      expect(result).toBeGreaterThan(0n);
    });

    it("isExtensionEnabled(VAULT) returns a boolean", async () => {
      const result = await withRetry(() =>
        sdk.isExtensionEnabled(ADDRESSES.VAULT)
      );
      expect(typeof result).toBe("boolean");
    });

    it("isExtensionEnabled(AIRDROP_V2) returns a boolean", async () => {
      const result = await withRetry(() =>
        sdk.isExtensionEnabled(ADDRESSES.AIRDROP_V2)
      );
      expect(typeof result).toBe("boolean");
    });

    it("isLockerEnabled(LP_LOCKER_FEE_CONVERSION, HOOK_DYNAMIC_FEE_V2) returns a boolean", async () => {
      const result = await withRetry(() =>
        sdk.isLockerEnabled(
          ADDRESSES.LP_LOCKER_FEE_CONVERSION,
          ADDRESSES.HOOK_DYNAMIC_FEE_V2
        )
      );
      expect(typeof result).toBe("boolean");
    });
  }
);
