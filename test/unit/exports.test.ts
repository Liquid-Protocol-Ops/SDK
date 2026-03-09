import { describe, it, expect } from "vitest";
import {
  LiquidSDK,
  ADDRESSES,
  EXTERNAL,
  FEE,
  TOKEN,
  DEFAULT_CHAIN,
  DEFAULT_CHAIN_ID,
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
} from "../../src/index";

// Type imports — just verifying they compile without error
import type {
  AirdropInfo,
  DeployTokenParams,
  DeployTokenResult,
  DeploymentConfig,
  DeploymentInfo,
  ExtensionConfig,
  LiquidSDKConfig,
  LockerConfig,
  MevModuleConfig,
  PoolConfig,
  PoolDynamicConfigVars,
  PoolDynamicFeeVars,
  PoolKey,
  SniperAuctionFeeConfig,
  SniperAuctionState,
  TokenConfig,
  TokenCreatedEvent,
  TokenRewardInfo,
  VaultAllocation,
} from "../../src/index";

describe("Named exports from index.ts", () => {
  it("LiquidSDK is defined and is a constructor", () => {
    expect(LiquidSDK).toBeDefined();
    expect(typeof LiquidSDK).toBe("function");
  });

  it("ADDRESSES is defined", () => {
    expect(ADDRESSES).toBeDefined();
    expect(typeof ADDRESSES).toBe("object");
  });

  it("EXTERNAL is defined", () => {
    expect(EXTERNAL).toBeDefined();
    expect(typeof EXTERNAL).toBe("object");
  });

  it("FEE is defined", () => {
    expect(FEE).toBeDefined();
    expect(typeof FEE).toBe("object");
  });

  it("TOKEN is defined", () => {
    expect(TOKEN).toBeDefined();
    expect(typeof TOKEN).toBe("object");
  });

  it("DEFAULT_CHAIN is defined", () => {
    expect(DEFAULT_CHAIN).toBeDefined();
  });

  it("DEFAULT_CHAIN_ID is defined", () => {
    expect(DEFAULT_CHAIN_ID).toBeDefined();
  });

  const abiExports = {
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

  it.each(Object.entries(abiExports))(
    "%s is exported and defined",
    (_name, abi) => {
      expect(abi).toBeDefined();
      expect(Array.isArray(abi)).toBe(true);
    }
  );
});

describe("Type exports compile correctly", () => {
  it("type imports do not throw", () => {
    // If this test file compiles and runs, type exports are valid.
    // We use a trivial type assertion to prove the types exist.
    const _check: DeployTokenParams = { name: "a", symbol: "b" };
    expect(_check.name).toBe("a");
  });
});
