import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiquidSDK } from "../../src/client";
import { ADDRESSES, EXTERNAL } from "../../src/constants";

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

  it("defaults hook to ADDRESSES.HOOK_DYNAMIC_FEE_V2", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.hook).toBe(ADDRESSES.HOOK_DYNAMIC_FEE_V2);
  });

  it("defaults pairedToken to EXTERNAL.WETH", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.pairedToken).toBe(EXTERNAL.WETH);
  });

  it("defaults locker to ADDRESSES.LP_LOCKER", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.locker).toBe(ADDRESSES.LP_LOCKER);
  });

  it("defaults mevModule to ADDRESSES.MEV_BLOCK_DELAY", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.mevModuleConfig.mevModule).toBe(ADDRESSES.MEV_BLOCK_DELAY);
  });

  it("defaults tickIfToken0IsLiquid to -198720", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.tickIfToken0IsLiquid).toBe(-198720);
  });

  it("defaults tickSpacing to 60", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.poolConfig.tickSpacing).toBe(60);
  });

  it("defaults rewardBps to [10000]", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.rewardBps).toEqual([10000]);
  });

  it("defaults positionBps to [10000]", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.positionBps).toEqual([10000]);
  });

  it("defaults tickLower to [-887220]", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.tickLower).toEqual([-887220]);
  });

  it("defaults tickUpper to [887220]", async () => {
    const config = await callDeployAndGetArgs({ name: "Test", symbol: "TST" });
    expect(config.lockerConfig.tickUpper).toEqual([887220]);
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
});
