import { describe, it, expect, vi } from "vitest";
import { LiquidSDK } from "../../src/client";
import { EXTERNAL } from "../../src/constants";

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
    await expect(sdk.claimFees(addr)).rejects.toThrow(
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

  it("updateImage throws 'walletClient with account required'", async () => {
    await expect(sdk.updateImage(addr, "https://new.png")).rejects.toThrow(
      "walletClient with account required for updateImage"
    );
  });

  it("updateMetadata throws 'walletClient with account required'", async () => {
    await expect(
      sdk.updateMetadata(addr, '{"description":"new"}')
    ).rejects.toThrow(
      "walletClient with account required for updateMetadata"
    );
  });
});

describe("updateImage with walletClient", () => {
  it("calls writeContract with correct args", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    walletClient.writeContract.mockResolvedValue("0xmockhash");
    const sdk = new LiquidSDK({ publicClient, walletClient });
    const addr = "0x0000000000000000000000000000000000000001" as const;

    const result = await sdk.updateImage(addr, "https://new-image.png");
    expect(result).toBe("0xmockhash");
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: addr,
        functionName: "updateImage",
        args: ["https://new-image.png"],
      })
    );
  });
});

describe("Fee helpers", () => {
  const owner = "0x0000000000000000000000000000000000000001" as const;
  const alternateFeeToken = "0x0000000000000000000000000000000000000002" as const;

  it("defaults getAvailableFees to WETH", async () => {
    const publicClient = createMockPublicClient();
    publicClient.readContract.mockResolvedValue(123n);
    const sdk = new LiquidSDK({ publicClient });

    const result = await sdk.getAvailableFees(owner);

    expect(result).toBe(123n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "availableFees",
        args: [owner, EXTERNAL.WETH],
      })
    );
  });

  it("defaults getFeesToClaim to WETH", async () => {
    const publicClient = createMockPublicClient();
    publicClient.readContract.mockResolvedValue(456n);
    const sdk = new LiquidSDK({ publicClient });

    const result = await sdk.getFeesToClaim(owner);

    expect(result).toBe(456n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "feesToClaim",
        args: [owner, EXTERNAL.WETH],
      })
    );
  });

  it("defaults claimFees to WETH", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    walletClient.writeContract.mockResolvedValue("0xmockhash");
    const sdk = new LiquidSDK({ publicClient, walletClient });

    const result = await sdk.claimFees(owner);

    expect(result).toBe("0xmockhash");
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "claim",
        args: [owner, EXTERNAL.WETH],
      })
    );
  });

  it("still allows overriding the fee token explicitly", async () => {
    const publicClient = createMockPublicClient();
    publicClient.readContract.mockResolvedValue(789n);
    const sdk = new LiquidSDK({ publicClient });

    const result = await sdk.getFeesToClaim(owner, alternateFeeToken);

    expect(result).toBe(789n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "feesToClaim",
        args: [owner, alternateFeeToken],
      })
    );
  });
});

describe("updateMetadata with walletClient", () => {
  it("calls writeContract with correct args", async () => {
    const publicClient = createMockPublicClient();
    const walletClient = createMockWalletClient();
    walletClient.writeContract.mockResolvedValue("0xmockhash");
    const sdk = new LiquidSDK({ publicClient, walletClient });
    const addr = "0x0000000000000000000000000000000000000001" as const;

    const result = await sdk.updateMetadata(addr, '{"description":"Updated"}');
    expect(result).toBe("0xmockhash");
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: addr,
        functionName: "updateMetadata",
        args: ['{"description":"Updated"}'],
      })
    );
  });
});

describe("getDeployedTokens", () => {
  it("filters logs by deployer address", async () => {
    const deployer = "0x1234567890abcdef1234567890abcdef12345678" as const;
    const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
    const publicClient = createMockPublicClient();
    (publicClient as any).getLogs = vi.fn().mockResolvedValue([
      {
        args: {
          msgSender: deployer,
          tokenAddress: "0x0000000000000000000000000000000000000001",
          tokenAdmin: deployer,
          tokenImage: "",
          tokenName: "Token1",
          tokenSymbol: "TK1",
          tokenMetadata: "",
          tokenContext: "",
          startingTick: -230400,
          poolHook: "0x0000000000000000000000000000000000000002",
          poolId: "0x0000000000000000000000000000000000000000000000000000000000000001",
          pairedToken: "0x0000000000000000000000000000000000000003",
          locker: "0x0000000000000000000000000000000000000004",
          mevModule: "0x0000000000000000000000000000000000000005",
          extensionsSupply: 0n,
          extensions: [],
        },
      },
      {
        args: {
          msgSender: other,
          tokenAddress: "0x0000000000000000000000000000000000000009",
          tokenAdmin: other,
          tokenImage: "",
          tokenName: "Token2",
          tokenSymbol: "TK2",
          tokenMetadata: "",
          tokenContext: "",
          startingTick: -230400,
          poolHook: "0x0000000000000000000000000000000000000002",
          poolId: "0x0000000000000000000000000000000000000000000000000000000000000002",
          pairedToken: "0x0000000000000000000000000000000000000003",
          locker: "0x0000000000000000000000000000000000000004",
          mevModule: "0x0000000000000000000000000000000000000005",
          extensionsSupply: 0n,
          extensions: [],
        },
      },
    ]);
    const sdk = new LiquidSDK({ publicClient });

    const tokens = await sdk.getDeployedTokens(deployer);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenName).toBe("Token1");
    expect(tokens[0].msgSender).toBe(deployer);
  });
});
