import { describe, it, expect, vi } from "vitest";
import { LiquidSDK } from "../../src/client";

function createMockPublicClient() {
  return {
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  };
}

function createMockWalletClient(withAccount = true) {
  return {
    writeContract: vi.fn(),
    account: withAccount
      ? { address: "0x1234567890abcdef1234567890abcdef12345678" as const }
      : undefined,
  };
}

describe("LiquidSDK constructor", () => {
  it("accepts publicClient only without error", () => {
    const publicClient = createMockPublicClient();
    const sdk = new LiquidSDK({ publicClient });
    expect(sdk.publicClient).toBe(publicClient);
    expect(sdk.walletClient).toBeUndefined();
  });

  it("accepts both publicClient and walletClient", () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    const sdk = new LiquidSDK({ publicClient, walletClient });
    expect(sdk.publicClient).toBe(publicClient);
    expect(sdk.walletClient).toBe(walletClient);
  });
});

describe("Write methods throw without walletClient", () => {
  const publicClient = createMockPublicClient();
  const sdk = new LiquidSDK({ publicClient });
  const addr = "0x0000000000000000000000000000000000000001" as const;

  it("deployToken throws 'walletClient with account required'", async () => {
    await expect(
      sdk.deployToken({ name: "Test", symbol: "TST" })
    ).rejects.toThrow("walletClient with account required for deployToken");
  });

  it("claimFees throws 'walletClient with account required'", async () => {
    await expect(sdk.claimFees(addr, addr)).rejects.toThrow(
      "walletClient with account required for claimFees"
    );
  });

  it("claimVault throws 'walletClient with account required'", async () => {
    await expect(sdk.claimVault(addr)).rejects.toThrow(
      "walletClient with account required for claimVault"
    );
  });

  it("claimAirdrop throws 'walletClient with account required'", async () => {
    await expect(sdk.claimAirdrop(addr, addr, 0n, [])).rejects.toThrow(
      "walletClient with account required for claimAirdrop"
    );
  });

  it("collectRewards throws 'walletClient with account required'", async () => {
    await expect(sdk.collectRewards(addr)).rejects.toThrow(
      "walletClient with account required for collectRewards"
    );
  });

  it("collectRewardsWithoutUnlock throws 'walletClient with account required'", async () => {
    await expect(sdk.collectRewardsWithoutUnlock(addr)).rejects.toThrow(
      "walletClient with account required for collectRewardsWithoutUnlock"
    );
  });

  it("updateRewardRecipient throws 'walletClient with account required'", async () => {
    await expect(sdk.updateRewardRecipient(addr, 0n, addr)).rejects.toThrow(
      "walletClient with account required for updateRewardRecipient"
    );
  });
});
