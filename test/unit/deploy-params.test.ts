import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiquidSDK } from "../../src/client";
import { ADDRESSES, EXTERNAL, DEFAULTS, POOL_POSITIONS } from "../../src/constants";

const MOCK_ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678" as const;

function createSDKWithCapture() {
  const writeContractMock = vi.fn().mockResolvedValue("0xdeadbeef" as const);
  const publicClient = {
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      logs: [
        {
          // We won't parse the event in these tests; deployToken will throw
          // "TokenCreated event not found" after writeContract resolves.
          // That's fine — we only care about the args passed to writeContract.
          data: "0x",
          topics: [],
        },
      ],
    }),
  };
  const walletClient = {
    writeContract: writeContractMock,
    account: { address: MOCK_ACCOUNT },
  };
  const sdk = new LiquidSDK({ publicClient, walletClient });
  return { sdk, writeContractMock };
}

describe("deployToken parameter defaults", () => {
  let sdk: LiquidSDK;
  let writeContractMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const result = createSDKWithCapture();
    sdk = result.sdk;
    writeContractMock = result.writeContractMock;
  });

  async function callDeployAndGetArgs(
    params: Parameters<LiquidSDK["deployToken"]>[0]
  ) {
    // deployToken will throw because our mock logs don't contain a real
    // TokenCreated event. We catch the error and inspect the writeContract call.
    try {
      await sdk.deployToken(params);
    } catch {
      // expected — TokenCreated event not found
    }
    expect(writeContractMock).toHaveBeenCalledOnce();
    const call = writeContractMock.mock.calls[0][0];
    return call.args[0]; // DeploymentConfig
  }

  it("defaults hook to ADDRESSES.HOOK_STATIC_FEE_V2", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.hook).toBe(ADDRESSES.HOOK_STATIC_FEE_V2);
  });

  it("defaults pairedToken to EXTERNAL.WETH", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.pairedToken).toBe(EXTERNAL.WETH);
  });

  it("defaults locker to ADDRESSES.LP_LOCKER_FEE_CONVERSION", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.locker).toBe(ADDRESSES.LP_LOCKER_FEE_CONVERSION);
  });

  it("defaults mevModule to ADDRESSES.SNIPER_AUCTION_V2", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.mevModuleConfig.mevModule).toBe(ADDRESSES.SNIPER_AUCTION_V2);
  });

  it("defaults tickIfToken0IsLiquid to -230400", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.tickIfToken0IsLiquid).toBe(-230400);
  });

  it("defaults tickSpacing to 200", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.tickSpacing).toBe(200);
  });

  it("defaults rewardBps to [10000]", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.rewardBps).toEqual([10000]);
  });

  it("defaults positionBps to Liquid 5-position [1000, 5000, 1500, 2000, 500]", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.positionBps).toEqual([1000, 5000, 1500, 2000, 500]);
  });

  it("defaults tickLower to Liquid preset", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.tickLower).toEqual(
      POOL_POSITIONS.Liquid.map((p) => p.tickLower)
    );
  });

  it("defaults tickUpper to Liquid preset", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.tickUpper).toEqual(
      POOL_POSITIONS.Liquid.map((p) => p.tickUpper)
    );
  });

  it("defaults poolData to encoded static 1% fee (not empty 0x)", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.poolData).not.toBe("0x");
    // Should be a valid hex-encoded ABI string
    expect(config.poolConfig.poolData).toMatch(/^0x[0-9a-f]+$/);
  });

  it("defaults mevModuleData to encoded sniper auction (not empty 0x)", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.mevModuleConfig.mevModuleData).not.toBe("0x");
    expect(config.mevModuleConfig.mevModuleData).toMatch(/^0x[0-9a-f]+$/);
  });

  it("generates salt from keccak256(encodePacked(name, symbol, timestamp))", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    // Salt should be a 32-byte hex string (66 chars with 0x prefix)
    expect(config.tokenConfig.salt).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("defaults tokenAdmin to wallet account address", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.tokenConfig.tokenAdmin).toBe(MOCK_ACCOUNT);
  });

  it("extensionConfigs reduces msgValue correctly with 2 extensions", async () => {
    const extensions = [
      {
        extension: "0x0000000000000000000000000000000000000001" as const,
        msgValue: 100n,
        extensionBps: 500,
        extensionData: "0x" as const,
      },
      {
        extension: "0x0000000000000000000000000000000000000002" as const,
        msgValue: 200n,
        extensionBps: 300,
        extensionData: "0x" as const,
      },
    ];

    try {
      await sdk.deployToken({ name: "Test", symbol: "TST", extensions });
    } catch {
      // expected
    }

    const call = writeContractMock.mock.calls[0][0];
    expect(call.value).toBe(300n);
  });

  describe("non-WETH pair starting-tick guard", () => {
    it("throws when pairedToken is DIEM and no tickIfToken0IsLiquid is given", async () => {
      await expect(
        sdk.deployToken({
          name: "Test",
          symbol: "TST",
          pairedToken: EXTERNAL.DIEM,
        })
      ).rejects.toThrow(/createLiquidPositionsUSD/);
      // Fail closed: nothing reaches the chain.
      expect(writeContractMock).not.toHaveBeenCalled();
    });

    it("throws for any non-WETH pair, case-insensitively", async () => {
      await expect(
        sdk.deployToken({
          name: "Test",
          symbol: "TST",
          pairedToken: EXTERNAL.DIEM.toLowerCase() as `0x${string}`,
        })
      ).rejects.toThrow(/not WETH/);
      expect(writeContractMock).not.toHaveBeenCalled();
    });

    it("allows a DIEM pair when the starting tick is explicit", async () => {
      const config = await callDeployAndGetArgs({
        name: "Test",
        symbol: "TST",
        pairedToken: EXTERNAL.DIEM,
        tickIfToken0IsLiquid: -100000,
        tickLower: [-100000],
        tickUpper: [-80000],
        positionBps: [10000],
      });
      expect(config.poolConfig.pairedToken).toBe(EXTERNAL.DIEM);
      expect(config.poolConfig.tickIfToken0IsLiquid).toBe(-100000);
    });

    it("still applies the default tick for WETH pairs (explicit or omitted)", async () => {
      const config = await callDeployAndGetArgs({
        name: "Test",
        symbol: "TST",
        pairedToken: EXTERNAL.WETH,
      });
      expect(config.poolConfig.tickIfToken0IsLiquid).toBe(
        DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID
      );
    });
  });
});
