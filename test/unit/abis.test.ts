import { describe, it, expect } from "vitest";
import {
  LiquidFactoryAbi,
  LiquidFeeLockerAbi,
  LiquidHookDynamicFeeV2Abi,
  LiquidVaultAbi,
  LiquidSniperAuctionV2Abi,
  LiquidSniperUtilV2Abi,
  LiquidAirdropV2Abi,
  LiquidPoolExtensionAllowlistAbi,
  LiquidMevBlockDelayAbi,
  LiquidLpLockerAbi,
  ERC20Abi,
} from "../../src/abis";

function hasFunction(abi: readonly any[], name: string): boolean {
  return abi.some((item) => item.type === "function" && item.name === name);
}

function hasEvent(abi: readonly any[], name: string): boolean {
  return abi.some((item) => item.type === "event" && item.name === name);
}

describe("ABI exports are non-empty arrays", () => {
  const abis = {
    LiquidFactoryAbi,
    LiquidFeeLockerAbi,
    LiquidHookDynamicFeeV2Abi,
    LiquidVaultAbi,
    LiquidSniperAuctionV2Abi,
    LiquidSniperUtilV2Abi,
    LiquidAirdropV2Abi,
    LiquidPoolExtensionAllowlistAbi,
    LiquidMevBlockDelayAbi,
    LiquidLpLockerAbi,
    ERC20Abi,
  };

  it.each(Object.entries(abis))("%s is a non-empty array", (_name, abi) => {
    expect(Array.isArray(abi)).toBe(true);
    expect(abi.length).toBeGreaterThan(0);
  });
});

describe("LiquidFactoryAbi", () => {
  it("contains deployToken function", () => {
    expect(hasFunction(LiquidFactoryAbi, "deployToken")).toBe(true);
  });

  it("contains TokenCreated event", () => {
    expect(hasEvent(LiquidFactoryAbi, "TokenCreated")).toBe(true);
  });

  it("contains tokenDeploymentInfo function", () => {
    expect(hasFunction(LiquidFactoryAbi, "tokenDeploymentInfo")).toBe(true);
  });
});

describe("LiquidFeeLockerAbi", () => {
  it.each(["availableFees", "feesToClaim", "claim"])(
    "contains %s function",
    (name) => {
      expect(hasFunction(LiquidFeeLockerAbi, name)).toBe(true);
    }
  );
});

describe("LiquidHookDynamicFeeV2Abi", () => {
  it.each([
    "poolConfigVars",
    "poolFeeVars",
    "poolCreationTimestamp",
    "liquidIsToken0",
  ])("contains %s function", (name) => {
    expect(hasFunction(LiquidHookDynamicFeeV2Abi, name)).toBe(true);
  });
});

describe("LiquidVaultAbi", () => {
  it.each(["allocation", "amountAvailableToClaim", "claim"])(
    "contains %s function",
    (name) => {
      expect(hasFunction(LiquidVaultAbi, name)).toBe(true);
    }
  );
});

describe("LiquidSniperAuctionV2Abi", () => {
  it.each([
    "nextAuctionBlock",
    "round",
    "gasPeg",
    "getFee",
    "feeConfig",
    "poolDecayStartTime",
    "maxRounds",
  ])("contains %s function", (name) => {
    expect(hasFunction(LiquidSniperAuctionV2Abi, name)).toBe(true);
  });
});

describe("LiquidSniperUtilV2Abi", () => {
  it("contains getTxGasPriceForBidAmount function", () => {
    expect(hasFunction(LiquidSniperUtilV2Abi, "getTxGasPriceForBidAmount")).toBe(
      true
    );
  });
});

describe("LiquidAirdropV2Abi", () => {
  it.each(["airdrops", "amountAvailableToClaim", "claim"])(
    "contains %s function",
    (name) => {
      expect(hasFunction(LiquidAirdropV2Abi, name)).toBe(true);
    }
  );
});

describe("LiquidPoolExtensionAllowlistAbi", () => {
  it("contains enabledExtensions function", () => {
    expect(
      hasFunction(LiquidPoolExtensionAllowlistAbi, "enabledExtensions")
    ).toBe(true);
  });
});

describe("LiquidMevBlockDelayAbi", () => {
  it.each(["blockDelay", "poolUnlockTime"])(
    "contains %s function",
    (name) => {
      expect(hasFunction(LiquidMevBlockDelayAbi, name)).toBe(true);
    }
  );
});

describe("LiquidLpLockerAbi", () => {
  it.each([
    "tokenRewards",
    "collectRewards",
    "collectRewardsWithoutUnlock",
    "updateRewardRecipient",
  ])("contains %s function", (name) => {
    expect(hasFunction(LiquidLpLockerAbi, name)).toBe(true);
  });
});

describe("ERC20Abi", () => {
  it.each([
    "name",
    "symbol",
    "decimals",
    "totalSupply",
    "balanceOf",
    "transfer",
    "approve",
    "allowance",
  ])("contains %s function", (name) => {
    expect(hasFunction(ERC20Abi, name)).toBe(true);
  });
});
