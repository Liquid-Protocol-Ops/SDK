import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  getAddress,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { ADDRESSES, EXTERNAL, DEFAULT_CHAIN_ID } from "./constants";
import { LiquidFactoryAbi } from "./abis/LiquidFactory";
import { LiquidFeeLockerAbi } from "./abis/LiquidFeeLocker";
import { LiquidHookDynamicFeeV2Abi } from "./abis/LiquidHookDynamicFeeV2";
import { LiquidVaultAbi } from "./abis/LiquidVault";
import { LiquidSniperAuctionV2Abi } from "./abis/LiquidSniperAuctionV2";
import { LiquidSniperUtilV2Abi } from "./abis/LiquidSniperUtilV2";
import { LiquidAirdropV2Abi } from "./abis/LiquidAirdropV2";
import { LiquidPoolExtensionAllowlistAbi } from "./abis/LiquidPoolExtensionAllowlist";
import { LiquidMevBlockDelayAbi } from "./abis/LiquidMevBlockDelay";
import { LiquidLpLockerAbi } from "./abis/LiquidLpLocker";
import { ERC20Abi } from "./abis/ERC20";
import type {
  AirdropInfo,
  DeployTokenParams,
  DeployTokenResult,
  DevBuyParams,
  DeploymentInfo,
  DeploymentConfig,
  ExtensionConfig,
  LiquidSDKConfig,
  PoolDynamicConfigVars,
  PoolDynamicFeeVars,
  SniperAuctionFeeConfig,
  SniperAuctionState,
  TokenCreatedEvent,
  TokenRewardInfo,
  VaultAllocation,
} from "./types";

export class LiquidSDK {
  public readonly publicClient: PublicClient;
  public readonly walletClient?: WalletClient;

  constructor(config: LiquidSDKConfig) {
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
  }

  // ── Dev Buy Helper ───────────────────────────────────────────────

  /**
   * Build an ExtensionConfig for a dev buy (buy tokens with ETH at launch).
   * The paired token must be WETH for simple dev buys.
   */
  buildDevBuyExtension(devBuy: DevBuyParams): ExtensionConfig {
    // Encode Univ4EthDevBuyExtensionData struct:
    // { PoolKey pairedTokenPoolKey, uint128 pairedTokenAmountOutMinimum, address recipient }
    // For WETH-paired tokens, pairedTokenPoolKey is zeroed out (not used)
    const extensionData = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            {
              type: "tuple",
              name: "pairedTokenPoolKey",
              components: [
                { type: "address", name: "currency0" },
                { type: "address", name: "currency1" },
                { type: "uint24", name: "fee" },
                { type: "int24", name: "tickSpacing" },
                { type: "address", name: "hooks" },
              ],
            },
            { type: "uint128", name: "pairedTokenAmountOutMinimum" },
            { type: "address", name: "recipient" },
          ],
        },
      ],
      [
        {
          pairedTokenPoolKey: {
            currency0: zeroAddress,
            currency1: zeroAddress,
            fee: 0,
            tickSpacing: 0,
            hooks: zeroAddress,
          },
          pairedTokenAmountOutMinimum: 0n,
          recipient: devBuy.recipient,
        },
      ]
    );

    return {
      extension: ADDRESSES.UNIV4_ETH_DEV_BUY,
      msgValue: devBuy.ethAmount,
      extensionBps: 0,
      extensionData,
    };
  }

  // ── Token Deployment ─────────────────────────────────────────────

  async deployToken(params: DeployTokenParams): Promise<DeployTokenResult> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for deployToken");
    }

    const account = this.walletClient.account.address;

    const deploymentConfig: DeploymentConfig = {
      tokenConfig: {
        tokenAdmin: params.tokenAdmin ?? account,
        name: params.name,
        symbol: params.symbol,
        salt:
          params.salt ??
          keccak256(
            encodePacked(
              ["string", "string", "uint256"],
              [params.name, params.symbol, BigInt(Date.now())]
            )
          ),
        image: params.image ?? "",
        metadata: params.metadata ?? "",
        context: params.context ?? "",
        originatingChainId: BigInt(DEFAULT_CHAIN_ID),
      },
      poolConfig: {
        hook: params.hook ?? ADDRESSES.HOOK_DYNAMIC_FEE_V2,
        pairedToken: params.pairedToken ?? EXTERNAL.WETH,
        tickIfToken0IsLiquid: params.tickIfToken0IsLiquid ?? -198720,
        tickSpacing: params.tickSpacing ?? 60,
        poolData: params.poolData ?? "0x",
      },
      lockerConfig: {
        locker: params.locker ?? ADDRESSES.LP_LOCKER,
        rewardAdmins: params.rewardAdmins ?? [account],
        rewardRecipients: params.rewardRecipients ?? [account],
        rewardBps: params.rewardBps ?? [10000],
        tickLower: params.tickLower ?? [-887220],
        tickUpper: params.tickUpper ?? [887220],
        positionBps: params.positionBps ?? [10000],
        lockerData: params.lockerData ?? "0x",
      },
      mevModuleConfig: {
        mevModule: params.mevModule ?? ADDRESSES.MEV_BLOCK_DELAY,
        mevModuleData: params.mevModuleData ?? "0x",
      },
      extensionConfigs: [...(params.extensions ?? [])],
    };

    // Append dev buy extension if specified
    if (params.devBuy) {
      deploymentConfig.extensionConfigs.push(
        this.buildDevBuyExtension(params.devBuy)
      );
    }

    // Calculate total msg.value from extensions
    const msgValue = deploymentConfig.extensionConfigs.reduce(
      (sum, ext) => sum + ext.msgValue,
      0n
    );

    const txHash = await this.walletClient.writeContract({
      address: ADDRESSES.FACTORY,
      abi: LiquidFactoryAbi,
      functionName: "deployToken",
      args: [deploymentConfig],
      value: msgValue,
      chain: base,
      account: this.walletClient.account,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Parse TokenCreated event from logs
    const tokenCreatedLog = receipt.logs.find((log) => {
      try {
        const decoded = decodeEventLog({
          abi: LiquidFactoryAbi,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === "TokenCreated";
      } catch {
        return false;
      }
    });

    if (!tokenCreatedLog) {
      throw new Error("TokenCreated event not found in transaction receipt");
    }

    const decoded = decodeEventLog({
      abi: LiquidFactoryAbi,
      data: tokenCreatedLog.data,
      topics: tokenCreatedLog.topics,
    });

    const args = decoded.args as any;

    return {
      tokenAddress: getAddress(args.tokenAddress),
      txHash,
      event: {
        msgSender: args.msgSender,
        tokenAddress: args.tokenAddress,
        tokenAdmin: args.tokenAdmin,
        tokenImage: args.tokenImage,
        tokenName: args.tokenName,
        tokenSymbol: args.tokenSymbol,
        tokenMetadata: args.tokenMetadata,
        tokenContext: args.tokenContext,
        startingTick: args.startingTick,
        poolHook: args.poolHook,
        poolId: args.poolId,
        pairedToken: args.pairedToken,
        locker: args.locker,
        mevModule: args.mevModule,
        extensionsSupply: args.extensionsSupply,
        extensions: args.extensions,
      },
    };
  }

  // ── Token Info ────────────────────────────────────────────────────

  async getDeploymentInfo(tokenAddress: Address): Promise<DeploymentInfo> {
    const result = await this.publicClient.readContract({
      address: ADDRESSES.FACTORY,
      abi: LiquidFactoryAbi,
      functionName: "tokenDeploymentInfo",
      args: [tokenAddress],
    });

    const data = result as any;
    return {
      token: data.token,
      hook: data.hook,
      locker: data.locker,
      extensions: data.extensions,
    };
  }

  async getTokenInfo(tokenAddress: Address) {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: "name",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: "symbol",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: "decimals",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20Abi,
        functionName: "totalSupply",
      }),
    ]);

    const deployment = await this.getDeploymentInfo(tokenAddress);

    return {
      address: tokenAddress,
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
      totalSupply: totalSupply as bigint,
      deployment,
    };
  }

  // ── Pool Info ─────────────────────────────────────────────────────

  async getPoolConfig(
    poolId: Hex,
    hookAddress?: Address
  ): Promise<PoolDynamicConfigVars> {
    const hook = hookAddress ?? ADDRESSES.HOOK_DYNAMIC_FEE_V2;
    const result = await this.publicClient.readContract({
      address: hook,
      abi: LiquidHookDynamicFeeV2Abi,
      functionName: "poolConfigVars",
      args: [poolId],
    });

    const data = result as any;
    return {
      baseFee: data.baseFee,
      maxLpFee: data.maxLpFee,
      referenceTickFilterPeriod: data.referenceTickFilterPeriod,
      resetPeriod: data.resetPeriod,
      resetTickFilter: data.resetTickFilter,
      feeControlNumerator: data.feeControlNumerator,
      decayFilterBps: data.decayFilterBps,
    };
  }

  async getPoolFeeState(
    poolId: Hex,
    hookAddress?: Address
  ): Promise<PoolDynamicFeeVars> {
    const hook = hookAddress ?? ADDRESSES.HOOK_DYNAMIC_FEE_V2;
    const result = await this.publicClient.readContract({
      address: hook,
      abi: LiquidHookDynamicFeeV2Abi,
      functionName: "poolFeeVars",
      args: [poolId],
    });

    const data = result as any;
    return {
      referenceTick: data.referenceTick,
      resetTick: data.resetTick,
      resetTickTimestamp: data.resetTickTimestamp,
      lastSwapTimestamp: data.lastSwapTimestamp,
      appliedVR: data.appliedVR,
      prevVA: data.prevVA,
    };
  }

  async getPoolCreationTimestamp(
    poolId: Hex,
    hookAddress?: Address
  ): Promise<bigint> {
    const hook = hookAddress ?? ADDRESSES.HOOK_DYNAMIC_FEE_V2;
    return (await this.publicClient.readContract({
      address: hook,
      abi: LiquidHookDynamicFeeV2Abi,
      functionName: "poolCreationTimestamp",
      args: [poolId],
    })) as bigint;
  }

  async isLiquidToken0(
    poolId: Hex,
    hookAddress?: Address
  ): Promise<boolean> {
    const hook = hookAddress ?? ADDRESSES.HOOK_DYNAMIC_FEE_V2;
    return (await this.publicClient.readContract({
      address: hook,
      abi: LiquidHookDynamicFeeV2Abi,
      functionName: "liquidIsToken0",
      args: [poolId],
    })) as boolean;
  }

  // ── Fee Claims ────────────────────────────────────────────────────

  async getAvailableFees(
    feeOwner: Address,
    tokenAddress: Address
  ): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.FEE_LOCKER,
      abi: LiquidFeeLockerAbi,
      functionName: "availableFees",
      args: [feeOwner, tokenAddress],
    })) as bigint;
  }

  async getFeesToClaim(
    feeOwner: Address,
    tokenAddress: Address
  ): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.FEE_LOCKER,
      abi: LiquidFeeLockerAbi,
      functionName: "feesToClaim",
      args: [feeOwner, tokenAddress],
    })) as bigint;
  }

  async claimFees(feeOwner: Address, tokenAddress: Address): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for claimFees");
    }

    return this.walletClient.writeContract({
      address: ADDRESSES.FEE_LOCKER,
      abi: LiquidFeeLockerAbi,
      functionName: "claim",
      args: [feeOwner, tokenAddress],
      chain: base,
      account: this.walletClient.account,
    });
  }

  // ── Vault ─────────────────────────────────────────────────────────

  async getVaultAllocation(
    tokenAddress: Address
  ): Promise<VaultAllocation> {
    const result = await this.publicClient.readContract({
      address: ADDRESSES.VAULT,
      abi: LiquidVaultAbi,
      functionName: "allocation",
      args: [tokenAddress],
    });

    const data = result as any;
    return {
      token: data[0] ?? data.token,
      amountTotal: data[1] ?? data.amountTotal,
      amountClaimed: data[2] ?? data.amountClaimed,
      lockupEndTime: data[3] ?? data.lockupEndTime,
      vestingEndTime: data[4] ?? data.vestingEndTime,
      admin: data[5] ?? data.admin,
    };
  }

  async getVaultClaimable(tokenAddress: Address): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.VAULT,
      abi: LiquidVaultAbi,
      functionName: "amountAvailableToClaim",
      args: [tokenAddress],
    })) as bigint;
  }

  async claimVault(tokenAddress: Address): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for claimVault");
    }

    return this.walletClient.writeContract({
      address: ADDRESSES.VAULT,
      abi: LiquidVaultAbi,
      functionName: "claim",
      args: [tokenAddress],
      chain: base,
      account: this.walletClient.account,
    });
  }

  // ── Factory Status ────────────────────────────────────────────────

  async isFactoryDeprecated(): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.FACTORY,
      abi: LiquidFactoryAbi,
      functionName: "deprecated",
    })) as boolean;
  }

  async isLockerEnabled(
    locker: Address,
    hook: Address
  ): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.FACTORY,
      abi: LiquidFactoryAbi,
      functionName: "enabledLockers",
      args: [locker, hook],
    })) as boolean;
  }

  // ── Sniper Auction ─────────────────────────────────────────────────

  async getAuctionState(poolId: Hex): Promise<SniperAuctionState> {
    const [nextAuctionBlock, round, gasPeg, currentFee] = await Promise.all([
      this.publicClient.readContract({
        address: ADDRESSES.SNIPER_AUCTION_V2,
        abi: LiquidSniperAuctionV2Abi,
        functionName: "nextAuctionBlock",
        args: [poolId],
      }),
      this.publicClient.readContract({
        address: ADDRESSES.SNIPER_AUCTION_V2,
        abi: LiquidSniperAuctionV2Abi,
        functionName: "round",
        args: [poolId],
      }),
      this.publicClient.readContract({
        address: ADDRESSES.SNIPER_AUCTION_V2,
        abi: LiquidSniperAuctionV2Abi,
        functionName: "gasPeg",
        args: [poolId],
      }),
      this.publicClient.readContract({
        address: ADDRESSES.SNIPER_AUCTION_V2,
        abi: LiquidSniperAuctionV2Abi,
        functionName: "getFee",
        args: [poolId],
      }),
    ]);

    return {
      nextAuctionBlock: nextAuctionBlock as bigint,
      round: round as bigint,
      gasPeg: gasPeg as bigint,
      currentFee: currentFee as number,
    };
  }

  async getAuctionFeeConfig(poolId: Hex): Promise<SniperAuctionFeeConfig> {
    const result = await this.publicClient.readContract({
      address: ADDRESSES.SNIPER_AUCTION_V2,
      abi: LiquidSniperAuctionV2Abi,
      functionName: "feeConfig",
      args: [poolId],
    });

    const data = result as any;
    return {
      startingFee: Array.isArray(data) ? data[0] : data.startingFee,
      endingFee: Array.isArray(data) ? data[1] : data.endingFee,
      secondsToDecay: Array.isArray(data) ? data[2] : data.secondsToDecay,
    };
  }

  async getAuctionDecayStartTime(poolId: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.SNIPER_AUCTION_V2,
      abi: LiquidSniperAuctionV2Abi,
      functionName: "poolDecayStartTime",
      args: [poolId],
    })) as bigint;
  }

  async getAuctionMaxRounds(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.SNIPER_AUCTION_V2,
      abi: LiquidSniperAuctionV2Abi,
      functionName: "maxRounds",
    })) as bigint;
  }

  async getAuctionGasPriceForBid(
    auctionGasPeg: bigint,
    desiredBidAmount: bigint
  ): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.SNIPER_UTIL_V2,
      abi: LiquidSniperUtilV2Abi,
      functionName: "getTxGasPriceForBidAmount",
      args: [auctionGasPeg, desiredBidAmount],
    })) as bigint;
  }

  // ── Airdrop ─────────────────────────────────────────────────────────

  async getAirdropInfo(tokenAddress: Address): Promise<AirdropInfo> {
    const result = await this.publicClient.readContract({
      address: ADDRESSES.AIRDROP_V2,
      abi: LiquidAirdropV2Abi,
      functionName: "airdrops",
      args: [tokenAddress],
    });

    const data = result as any;
    return {
      admin: Array.isArray(data) ? data[0] : data.admin,
      merkleRoot: Array.isArray(data) ? data[1] : data.merkleRoot,
      totalSupply: Array.isArray(data) ? data[2] : data.totalSupply,
      totalClaimed: Array.isArray(data) ? data[3] : data.totalClaimed,
      lockupEndTime: Array.isArray(data) ? data[4] : data.lockupEndTime,
      vestingEndTime: Array.isArray(data) ? data[5] : data.vestingEndTime,
      adminClaimTime: Array.isArray(data) ? data[6] : data.adminClaimTime,
      adminClaimed: Array.isArray(data) ? data[7] : data.adminClaimed,
    };
  }

  async getAirdropClaimable(
    tokenAddress: Address,
    recipient: Address,
    allocatedAmount: bigint
  ): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.AIRDROP_V2,
      abi: LiquidAirdropV2Abi,
      functionName: "amountAvailableToClaim",
      args: [tokenAddress, recipient, allocatedAmount],
    })) as bigint;
  }

  async claimAirdrop(
    tokenAddress: Address,
    recipient: Address,
    allocatedAmount: bigint,
    proof: Hex[]
  ): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for claimAirdrop");
    }

    return this.walletClient.writeContract({
      address: ADDRESSES.AIRDROP_V2,
      abi: LiquidAirdropV2Abi,
      functionName: "claim",
      args: [tokenAddress, recipient, allocatedAmount, proof],
      chain: base,
      account: this.walletClient.account,
    });
  }

  // ── LP Locker ───────────────────────────────────────────────────────

  async getTokenRewards(
    tokenAddress: Address,
    lockerAddress?: Address
  ): Promise<TokenRewardInfo> {
    const locker = lockerAddress ?? ADDRESSES.LP_LOCKER;
    const result = await this.publicClient.readContract({
      address: locker,
      abi: LiquidLpLockerAbi,
      functionName: "tokenRewards",
      args: [tokenAddress],
    });

    const data = result as any;
    return {
      token: data.token,
      poolKey: data.poolKey,
      positionId: data.positionId,
      numPositions: data.numPositions,
      rewardBps: [...data.rewardBps],
      rewardAdmins: [...data.rewardAdmins],
      rewardRecipients: [...data.rewardRecipients],
    };
  }

  async collectRewards(
    tokenAddress: Address,
    lockerAddress?: Address
  ): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for collectRewards");
    }

    const locker = lockerAddress ?? ADDRESSES.LP_LOCKER;
    return this.walletClient.writeContract({
      address: locker,
      abi: LiquidLpLockerAbi,
      functionName: "collectRewards",
      args: [tokenAddress],
      chain: base,
      account: this.walletClient.account,
    });
  }

  async collectRewardsWithoutUnlock(
    tokenAddress: Address,
    lockerAddress?: Address
  ): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error(
        "walletClient with account required for collectRewardsWithoutUnlock"
      );
    }

    const locker = lockerAddress ?? ADDRESSES.LP_LOCKER;
    return this.walletClient.writeContract({
      address: locker,
      abi: LiquidLpLockerAbi,
      functionName: "collectRewardsWithoutUnlock",
      args: [tokenAddress],
      chain: base,
      account: this.walletClient.account,
    });
  }

  async updateRewardRecipient(
    tokenAddress: Address,
    rewardIndex: bigint,
    newRecipient: Address,
    lockerAddress?: Address
  ): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error(
        "walletClient with account required for updateRewardRecipient"
      );
    }

    const locker = lockerAddress ?? ADDRESSES.LP_LOCKER;
    return this.walletClient.writeContract({
      address: locker,
      abi: LiquidLpLockerAbi,
      functionName: "updateRewardRecipient",
      args: [tokenAddress, rewardIndex, newRecipient],
      chain: base,
      account: this.walletClient.account,
    });
  }

  // ── Pool Extension Allowlist ────────────────────────────────────────

  async isExtensionEnabled(extensionAddress: Address): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.POOL_EXTENSION_ALLOWLIST,
      abi: LiquidPoolExtensionAllowlistAbi,
      functionName: "enabledExtensions",
      args: [extensionAddress],
    })) as boolean;
  }

  // ── MEV Block Delay ─────────────────────────────────────────────────

  async getMevBlockDelay(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.MEV_BLOCK_DELAY,
      abi: LiquidMevBlockDelayAbi,
      functionName: "blockDelay",
    })) as bigint;
  }

  async getPoolUnlockTime(poolId: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.MEV_BLOCK_DELAY,
      abi: LiquidMevBlockDelayAbi,
      functionName: "poolUnlockTime",
      args: [poolId],
    })) as bigint;
  }
}
