import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiquidSDK } from "../../src/client";

const MOCK_ACCOUNT = "0x1234567890abcdef1234567890abcdef12345678" as const;
const MOCK_ADDR2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

function createSDK() {
  const writeContractMock = vi.fn().mockResolvedValue("0xdeadbeef" as const);
  const publicClient = {
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      logs: [{ data: "0x", topics: [] }],
    }),
  };
  const walletClient = {
    writeContract: writeContractMock,
    account: { address: MOCK_ACCOUNT },
  };
  return new LiquidSDK({ publicClient, walletClient });
}

async function expectDeployError(
  sdk: LiquidSDK,
  params: Parameters<LiquidSDK["deployToken"]>[0],
  errorMsg: string
) {
  await expect(sdk.deployToken(params)).rejects.toThrow(errorMsg);
}

describe("deployToken client-side validation", () => {
  let sdk: LiquidSDK;

  beforeEach(() => {
    sdk = createSDK();
  });

  // ── Position array validation ───────────────────────────────────

  it("rejects mismatched position array lengths", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [-230400, -198600],
        tickUpper: [-198600],
        positionBps: [5000, 5000],
      },
      "same length"
    );
  });

  it("rejects empty position arrays", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [],
        tickUpper: [],
        positionBps: [],
      },
      "At least one position"
    );
  });

  it("rejects more than 7 positions", async () => {
    const ticks = Array.from({ length: 8 }, (_, i) => -230400 + i * 200);
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: ticks.slice(0, 8),
        tickUpper: ticks.slice(1, 9).concat([-120000]),
        positionBps: Array(8).fill(1250),
      },
      "Maximum 7"
    );
  });

  it("rejects positionBps that don't sum to 10000", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [-230400],
        tickUpper: [-120000],
        positionBps: [5000], // only 50%
      },
      "must sum to 10000"
    );
  });

  it("rejects tickLower >= tickUpper", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [-120000],
        tickUpper: [-230400],
        positionBps: [10000],
        tickIfToken0IsLiquid: -230400,
      },
      "tickLower"
    );
  });

  it("rejects ticks not aligned to tickSpacing", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [-230401], // not a multiple of 200
        tickUpper: [-120000],
        positionBps: [10000],
        tickIfToken0IsLiquid: -230401,
        tickSpacing: 200,
      },
      "not a multiple of tickSpacing"
    );
  });

  it("rejects when no position touches the starting tick", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [-200000],
        tickUpper: [-120000],
        positionBps: [10000],
        tickIfToken0IsLiquid: -230400,
      },
      "must equal tickIfToken0IsLiquid"
    );
  });

  it("rejects tickLower below starting tick", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        tickLower: [-230600],
        tickUpper: [-120000],
        positionBps: [10000],
        tickIfToken0IsLiquid: -230400,
      },
      "below the starting tick"
    );
  });

  // ── Reward array validation ─────────────────────────────────────

  it("rejects mismatched reward array lengths", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        rewardAdmins: [MOCK_ACCOUNT, MOCK_ADDR2],
        rewardRecipients: [MOCK_ACCOUNT],
        rewardBps: [10000],
      },
      "same length"
    );
  });

  it("rejects empty reward arrays", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        rewardAdmins: [],
        rewardRecipients: [],
        rewardBps: [],
      },
      "At least one reward recipient"
    );
  });

  it("rejects rewardBps that don't sum to 10000", async () => {
    await expectDeployError(
      sdk,
      {
        name: "Test",
        symbol: "TST",
        rewardAdmins: [MOCK_ACCOUNT, MOCK_ADDR2],
        rewardRecipients: [MOCK_ACCOUNT, MOCK_ADDR2],
        rewardBps: [5000, 3000], // only 8000
      },
      "rewardBps must sum to 10000"
    );
  });

  // ── Extension validation ────────────────────────────────────────

  it("rejects more than 10 extensions", async () => {
    const extensions = Array.from({ length: 11 }, () => ({
      extension: MOCK_ADDR2,
      msgValue: 0n,
      extensionBps: 0,
      extensionData: "0x" as const,
    }));

    await expectDeployError(
      sdk,
      { name: "Test", symbol: "TST", extensions },
      "Maximum 10 extensions"
    );
  });

  it("rejects total extensionBps exceeding 9000", async () => {
    const extensions = [
      {
        extension: MOCK_ADDR2,
        msgValue: 0n,
        extensionBps: 5000,
        extensionData: "0x" as const,
      },
      {
        extension: MOCK_ADDR2,
        msgValue: 0n,
        extensionBps: 5000,
        extensionData: "0x" as const,
      },
    ];

    await expectDeployError(
      sdk,
      { name: "Test", symbol: "TST", extensions },
      "exceeds maximum"
    );
  });

  // ── Valid config passes validation ──────────────────────────────

  it("accepts valid default config (no errors thrown before writeContract)", async () => {
    // With defaults, validation should pass. The call will fail at
    // the event parsing stage, not at validation.
    await expect(
      sdk.deployToken({ name: "Test", symbol: "TST" })
    ).rejects.toThrow("TokenCreated event not found");
  });

  it("accepts valid custom single-position config", async () => {
    await expect(
      sdk.deployToken({
        name: "Test",
        symbol: "TST",
        tickLower: [-230400],
        tickUpper: [-120000],
        positionBps: [10000],
        tickIfToken0IsLiquid: -230400,
      })
    ).rejects.toThrow("TokenCreated event not found");
  });

  it("accepts valid multi-position config", async () => {
    await expect(
      sdk.deployToken({
        name: "Test",
        symbol: "TST",
        tickLower: [-230400, -198600, -168600],
        tickUpper: [-198600, -168600, -122600],
        positionBps: [4000, 5000, 1000],
        tickIfToken0IsLiquid: -230400,
      })
    ).rejects.toThrow("TokenCreated event not found");
  });

  it("accepts valid multi-recipient reward config", async () => {
    await expect(
      sdk.deployToken({
        name: "Test",
        symbol: "TST",
        rewardAdmins: [MOCK_ACCOUNT, MOCK_ADDR2],
        rewardRecipients: [MOCK_ACCOUNT, MOCK_ADDR2],
        rewardBps: [7000, 3000],
      })
    ).rejects.toThrow("TokenCreated event not found");
  });
});
