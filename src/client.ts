import {
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  http,
  decodeEventLog,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  getAddress,
  parseAbiItem,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { ADDRESSES, EXTERNAL, DEFAULT_CHAIN_ID, DEFAULTS, POOL_POSITIONS, FEE, TOKEN } from "./constants";
import { encodeStaticFeePoolData, encodeSniperAuctionData, encodeFeeConversionLockerData, FeePreference } from "./utils/encoding";
import { buildContext } from "./utils/context";
import { LiquidFactoryAbi } from "./abis/LiquidFactory";
import { LiquidFeeLockerAbi } from "./abis/LiquidFeeLocker";
import { LiquidHookDynamicFeeV2Abi } from "./abis/LiquidHookDynamicFeeV2";
import { LiquidVaultAbi } from "./abis/LiquidVault";
import { LiquidSniperAuctionV2Abi } from "./abis/LiquidSniperAuctionV2";
import { LiquidSniperUtilV2Abi } from "./abis/LiquidSniperUtilV2";
import { LiquidAirdropV2Abi } from "./abis/LiquidAirdropV2";
import { LiquidPoolExtensionAllowlistAbi } from "./abis/LiquidPoolExtensionAllowlist";
import { LiquidMevDescendingFeesAbi } from "./abis/LiquidMevDescendingFees";
import { LiquidLpLockerAbi } from "./abis/LiquidLpLocker";
import { LiquidTokenAbi } from "./abis/LiquidToken";
import { ERC20Abi } from "./abis/ERC20";
import type {
  AirdropInfo,
  BidInAuctionParams,
  BidInAuctionResult,
  DeployTokenParams,
  DeployTokenResult,
  DevBuyParams,
  VaultExtensionParams,
  AirdropExtensionParams,
  DeploymentInfo,
  DeploymentConfig,
  ExtensionConfig,
  GetTokensOptions,
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
    this.publicClient = config.publicClient ?? createPublicClient({
      chain: base,
      transport: http(),
    });
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

  /**
   * Build a vault extension config for token deployment.
   *
   * Locks a percentage of the token supply with a lockup period
   * followed by optional linear vesting.
   *
   * @param vault - Vault parameters
   * @returns ExtensionConfig to include in `deployToken({ extensions })`
   *
   * @example
   * ```typescript
   * const vaultExt = sdk.buildVaultExtension({
   *   admin: account.address,
   *   allocationBps: 2000,       // 20% of supply
   *   lockupDuration: 2592000,   // 30 days in seconds
   *   vestingDuration: 7776000,  // 90 days linear vesting after lockup
   * });
   * const result = await sdk.deployToken({
   *   name: "My Token", symbol: "MTK",
   *   extensions: [vaultExt],
   * });
   * ```
   */
  buildVaultExtension(vault: VaultExtensionParams): ExtensionConfig {
    // Validate constraints
    const MIN_LOCKUP = 604_800; // 7 days (from contract)
    const MAX_BPS = 9_000;      // 90% max allocation

    if (vault.allocationBps < 1 || vault.allocationBps > MAX_BPS) {
      throw new Error(`Vault allocationBps must be 1–${MAX_BPS} (0.01%–90%). Got ${vault.allocationBps}.`);
    }
    if (vault.lockupDuration < MIN_LOCKUP) {
      throw new Error(`Vault lockupDuration must be ≥ ${MIN_LOCKUP} seconds (7 days). Got ${vault.lockupDuration}.`);
    }
    if (vault.vestingDuration !== undefined && vault.vestingDuration < 0) {
      throw new Error("Vault vestingDuration cannot be negative.");
    }

    const extensionData = encodeAbiParameters(
      [
        { type: "address" },  // admin
        { type: "uint256" },  // lockupDuration
        { type: "uint256" },  // vestingDuration
      ],
      [
        vault.admin,
        BigInt(vault.lockupDuration),
        BigInt(vault.vestingDuration ?? 0),
      ]
    );

    return {
      extension: ADDRESSES.VAULT,
      msgValue: 0n,
      extensionBps: vault.allocationBps,
      extensionData,
    };
  }

  // ── Airdrop Extension ──────────────────────────────────────────

  /**
   * Build an ExtensionConfig that reserves a percentage of supply into
   * the LiquidAirdropV2 contract for merkle-tree-based distribution.
   *
   * The airdrop contract expects `AirdropV2ExtensionData`:
   *   { address admin, bytes32 merkleRoot, uint256 lockupDuration, uint256 vestingDuration }
   *
   * Leaf encoding used by LiquidAirdropV2.claim (note: **double hashed**
   * — OZ's standard 2nd-preimage-resistant pattern):
   *   leaf = keccak256(bytes.concat(keccak256(abi.encode(recipient, allocatedAmount))))
   *
   * @example
   * ```typescript
   * const airdropExt = sdk.buildAirdropExtension({
   *   admin: account.address,
   *   merkleRoot: "0x…",
   *   allocationBps: 2000,          // 20%
   *   lockupDuration: 86400,        // 1 day (minimum)
   *   vestingDuration: 0,           // instant claim after lockup
   * });
   * ```
   */
  buildAirdropExtension(airdrop: AirdropExtensionParams): ExtensionConfig {
    const MIN_LOCKUP = 86_400; // 1 day (from contract MIN_LOCKUP_DURATION)
    const MAX_BPS = 9_000;

    if (airdrop.allocationBps < 1 || airdrop.allocationBps > MAX_BPS) {
      throw new Error(
        `Airdrop allocationBps must be 1–${MAX_BPS} (0.01%–90%). Got ${airdrop.allocationBps}.`,
      );
    }
    if (airdrop.lockupDuration < MIN_LOCKUP) {
      throw new Error(
        `Airdrop lockupDuration must be ≥ ${MIN_LOCKUP} seconds (1 day). Got ${airdrop.lockupDuration}.`,
      );
    }
    if (airdrop.vestingDuration !== undefined && airdrop.vestingDuration < 0) {
      throw new Error("Airdrop vestingDuration cannot be negative.");
    }

    // Wrapped in a single tuple arg to match the contract's
    // `abi.decode(extensionData, (AirdropV2ExtensionData))` syntax.
    const extensionData = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "address", name: "admin" },
            { type: "bytes32", name: "merkleRoot" },
            { type: "uint256", name: "lockupDuration" },
            { type: "uint256", name: "vestingDuration" },
          ],
        },
      ],
      [
        {
          admin: airdrop.admin,
          merkleRoot: airdrop.merkleRoot,
          lockupDuration: BigInt(airdrop.lockupDuration),
          vestingDuration: BigInt(airdrop.vestingDuration ?? 0),
        },
      ],
    );

    return {
      extension: ADDRESSES.AIRDROP_V2,
      msgValue: 0n,
      extensionBps: airdrop.allocationBps,
      extensionData,
    };
  }

  // ── Validation ─────────────────────────────────────────────────

  /**
   * Validate a DeploymentConfig before sending to the contract.
   * Catches common mistakes client-side with clear error messages.
   */
  private validateDeploymentConfig(config: DeploymentConfig): void {
    const { lockerConfig, extensionConfigs } = config;
    const { tickSpacing } = config.poolConfig;

    // Position arrays must be the same length
    const posLen = lockerConfig.tickLower.length;
    if (
      lockerConfig.tickUpper.length !== posLen ||
      lockerConfig.positionBps.length !== posLen
    ) {
      throw new Error(
        `tickLower (${posLen}), tickUpper (${lockerConfig.tickUpper.length}), ` +
          `and positionBps (${lockerConfig.positionBps.length}) arrays must be the same length`
      );
    }

    if (posLen === 0) {
      throw new Error("At least one position is required");
    }

    if (posLen > 7) {
      throw new Error(`Maximum 7 positions allowed, got ${posLen}`);
    }

    // positionBps must sum to 10000
    const posBpsSum = lockerConfig.positionBps.reduce((s, b) => s + b, 0);
    if (posBpsSum !== FEE.BPS) {
      throw new Error(
        `positionBps must sum to ${FEE.BPS} (100%), got ${posBpsSum}`
      );
    }

    // Each position: tickLower < tickUpper
    for (let i = 0; i < posLen; i++) {
      if (lockerConfig.tickLower[i] >= lockerConfig.tickUpper[i]) {
        throw new Error(
          `Position ${i}: tickLower (${lockerConfig.tickLower[i]}) must be less than tickUpper (${lockerConfig.tickUpper[i]})`
        );
      }
    }

    // Ticks must be multiples of tickSpacing
    for (let i = 0; i < posLen; i++) {
      if (lockerConfig.tickLower[i] % tickSpacing !== 0) {
        throw new Error(
          `Position ${i}: tickLower (${lockerConfig.tickLower[i]}) is not a multiple of tickSpacing (${tickSpacing})`
        );
      }
      if (lockerConfig.tickUpper[i] % tickSpacing !== 0) {
        throw new Error(
          `Position ${i}: tickUpper (${lockerConfig.tickUpper[i]}) is not a multiple of tickSpacing (${tickSpacing})`
        );
      }
    }

    // All tickLower must be >= starting tick
    const startingTick = config.poolConfig.tickIfToken0IsLiquid;
    for (let i = 0; i < posLen; i++) {
      if (lockerConfig.tickLower[i] < startingTick) {
        throw new Error(
          `Position ${i}: tickLower (${lockerConfig.tickLower[i]}) is below the starting tick (${startingTick})`
        );
      }
    }

    // At least one position must start at the starting tick
    const touchesStart = lockerConfig.tickLower.some(
      (t) => t === startingTick
    );
    if (!touchesStart) {
      throw new Error(
        `At least one position's tickLower must equal tickIfToken0IsLiquid (${startingTick})`
      );
    }

    // Reward arrays must be the same length
    const rwdLen = lockerConfig.rewardAdmins.length;
    if (
      lockerConfig.rewardRecipients.length !== rwdLen ||
      lockerConfig.rewardBps.length !== rwdLen
    ) {
      throw new Error(
        `rewardAdmins (${rwdLen}), rewardRecipients (${lockerConfig.rewardRecipients.length}), ` +
          `and rewardBps (${lockerConfig.rewardBps.length}) arrays must be the same length`
      );
    }

    if (rwdLen === 0) {
      throw new Error("At least one reward recipient is required");
    }

    // rewardBps must sum to 10000
    const rwdBpsSum = lockerConfig.rewardBps.reduce((s, b) => s + b, 0);
    if (rwdBpsSum !== FEE.BPS) {
      throw new Error(
        `rewardBps must sum to ${FEE.BPS} (100%), got ${rwdBpsSum}`
      );
    }

    // Extensions count limit
    if (extensionConfigs.length > TOKEN.MAX_EXTENSIONS) {
      throw new Error(
        `Maximum ${TOKEN.MAX_EXTENSIONS} extensions allowed, got ${extensionConfigs.length}`
      );
    }

    // Total extension bps must not exceed max
    const extBpsSum = extensionConfigs.reduce(
      (s, e) => s + e.extensionBps,
      0
    );
    if (extBpsSum > TOKEN.MAX_EXTENSION_BPS) {
      throw new Error(
        `Total extensionBps (${extBpsSum}) exceeds maximum (${TOKEN.MAX_EXTENSION_BPS})`
      );
    }
  }

  // ── Token Deployment ─────────────────────────────────────────────

  async deployToken(params: DeployTokenParams): Promise<DeployTokenResult> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for deployToken");
    }

    // Non-WETH pairs must anchor their own starting tick. The tick prices
    // full supply in *paired-token* units, so the WETH-calibrated default
    // (-230400 ≈ 10 paired tokens FDV) only means "~10 ETH market cap" when
    // the pair IS WETH — for any other pair it silently prices the launch at
    // 10 × that token's market price, an accident rather than a choice. LP
    // is permanently locked, so a mispriced pool can't be fixed after the
    // fact. Fail closed and point at the USD-anchored helper.
    if (
      params.pairedToken !== undefined &&
      getAddress(params.pairedToken) !== getAddress(EXTERNAL.WETH) &&
      params.tickIfToken0IsLiquid === undefined
    ) {
      throw new Error(
        `deployToken: pairedToken ${params.pairedToken} is not WETH, but no ` +
          `tickIfToken0IsLiquid was provided. The default starting tick ` +
          `(${DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID}) prices full supply at ~10 of ` +
          `the paired token — a market cap accidentally pegged to that token's ` +
          `price instead of one you chose. Compute the anchor explicitly with ` +
          `createLiquidPositionsUSD(startingMarketCapUSD, pairedTokenPriceUSD) ` +
          `and pass its tickIfToken0IsLiquid (plus tickLower/tickUpper/` +
          `positionBps) to deployToken.`
      );
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
        context: params.context ?? buildContext(),
        originatingChainId: BigInt(DEFAULT_CHAIN_ID),
      },
      poolConfig: {
        hook: params.hook ?? DEFAULTS.HOOK,
        pairedToken: params.pairedToken ?? EXTERNAL.WETH,
        tickIfToken0IsLiquid:
          params.tickIfToken0IsLiquid ?? DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID,
        tickSpacing: params.tickSpacing ?? DEFAULTS.TICK_SPACING,
        poolData:
          params.poolData ??
          encodeStaticFeePoolData(
            DEFAULTS.LIQUID_FEE_BPS,
            DEFAULTS.PAIRED_FEE_BPS,
          ),
      },
      lockerConfig: (() => {
        const locker = params.locker ?? DEFAULTS.LOCKER;
        const rewardRecipients = params.rewardRecipients ?? [account];
        const rewardBps = params.rewardBps ?? [10000];

        // Auto-encode lockerData for fee conversion locker:
        // one FeePreference.Paired entry per reward recipient (fees → WETH)
        let lockerData = params.lockerData ?? "0x";
        if (lockerData === "0x" && getAddress(locker) === getAddress(ADDRESSES.LP_LOCKER_FEE_CONVERSION)) {
          lockerData = encodeFeeConversionLockerData(
            rewardRecipients.map(() => FeePreference.Paired),
          );
        }

        return {
          locker,
          rewardAdmins: params.rewardAdmins ?? [account],
          rewardRecipients,
          rewardBps,
          tickLower:
            params.tickLower ??
            POOL_POSITIONS.Liquid.map((p) => p.tickLower),
          tickUpper:
            params.tickUpper ??
            POOL_POSITIONS.Liquid.map((p) => p.tickUpper),
          positionBps:
            params.positionBps ??
            POOL_POSITIONS.Liquid.map((p) => p.positionBps),
          lockerData,
        };
      })(),
      mevModuleConfig: {
        mevModule: params.mevModule ?? DEFAULTS.MEV_MODULE,
        mevModuleData:
          params.mevModuleData ??
          encodeSniperAuctionData({
            startingFee: DEFAULTS.SNIPER_STARTING_FEE,
            endingFee: DEFAULTS.SNIPER_ENDING_FEE,
            secondsToDecay: DEFAULTS.SNIPER_SECONDS_TO_DECAY,
          }),
      },
      extensionConfigs: [...(params.extensions ?? [])],
    };

    // Append dev buy extension if specified
    if (params.devBuy) {
      deploymentConfig.extensionConfigs.push(
        this.buildDevBuyExtension(params.devBuy)
      );
    }

    // ── Client-side validation ────────────────────────────────────
    this.validateDeploymentConfig(deploymentConfig);

    // Calculate total msg.value from extensions
    const msgValue = deploymentConfig.extensionConfigs.reduce(
      (sum, ext) => sum + ext.msgValue,
      0n
    );

    // Deploy txs are complex (CREATE2 + pool init + LP lock + optional
    // extensions like AirdropV2) and real gas cost drifts as the factory
    // evolves. Estimate + 20% buffer instead of a hard-coded limit.
    //
    // If estimation fails with a revert reason (the contract would reject
    // the tx), bubble the error up — the previous silent fallback to 6M
    // would then fire the tx on-chain and burn real gas. Only fall back
    // to the static limit for transport-level errors (RPC timeout, node
    // quirks with eth_estimateGas).
    let gas: bigint;
    try {
      const estimated = await this.publicClient.estimateContractGas({
        address: ADDRESSES.FACTORY,
        abi: LiquidFactoryAbi,
        functionName: "deployToken",
        args: [deploymentConfig],
        value: msgValue,
        account: this.walletClient.account,
      });
      gas = (estimated * 120n) / 100n;
    } catch (err) {
      // Treat any error that looks like an on-chain revert as fatal
      // (don't paper over it by sending the tx anyway). Anything else —
      // RPC transport failures, method-not-supported — falls back to a
      // safe high limit.
      const e = err as { name?: string; shortMessage?: string; cause?: unknown };
      const looksLikeRevert =
        e?.name === "ContractFunctionExecutionError" ||
        e?.name === "CallExecutionError" ||
        (typeof e?.shortMessage === "string" &&
          /reverted|revert reason|execution reverted/i.test(e.shortMessage));
      if (looksLikeRevert) throw err;
      // Opt-in warn: only when a logger is attached. Default console is
      // fine for server-side diagnostics.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[liquid-sdk] deployToken gas estimation failed; falling back to 6M gas limit:",
          e?.shortMessage ?? err,
        );
      }
      gas = 6_000_000n;
    }

    const txHash = await this.walletClient.writeContract({
      address: ADDRESSES.FACTORY,
      abi: LiquidFactoryAbi,
      functionName: "deployToken",
      args: [deploymentConfig],
      value: msgValue,
      gas,
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

  /**
   * Get uncollected fees for a fee owner.
   * @param feeOwner - Address that receives fees (reward recipient)
   * @param feeToken - The token fees are denominated in. Defaults to WETH
   *   (correct for all pools using LP_LOCKER_FEE_CONVERSION).
   */
  async getAvailableFees(
    feeOwner: Address,
    feeToken: Address = EXTERNAL.WETH
  ): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.FEE_LOCKER,
      abi: LiquidFeeLockerAbi,
      functionName: "availableFees",
      args: [feeOwner, feeToken],
    })) as bigint;
  }

  /**
   * Get collected, claimable fees for a fee owner.
   * @param feeOwner - Address that receives fees (reward recipient)
   * @param feeToken - The token fees are denominated in. Defaults to WETH.
   */
  async getFeesToClaim(
    feeOwner: Address,
    feeToken: Address = EXTERNAL.WETH
  ): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.FEE_LOCKER,
      abi: LiquidFeeLockerAbi,
      functionName: "feesToClaim",
      args: [feeOwner, feeToken],
    })) as bigint;
  }

  /**
   * Claim all accumulated fees for a fee owner.
   * @param feeOwner - Address that receives fees (reward recipient)
   * @param feeToken - The token fees are denominated in. Defaults to WETH.
   */
  async claimFees(feeOwner: Address, feeToken: Address = EXTERNAL.WETH): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for claimFees");
    }

    return await this.walletClient.writeContract({
      address: ADDRESSES.FEE_LOCKER,
      abi: LiquidFeeLockerAbi,
      functionName: "claim",
      args: [feeOwner, feeToken],
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

    return await this.walletClient.writeContract({
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

  /**
   * Bid in a sniper auction for early access to a newly launched token.
   *
   * The auction lets bidders compete via gas price — the bid amount is
   * determined by how much your tx.gasprice exceeds the pool's gasPeg.
   *
   * **Important:** The `amountIn` (swap input) is pulled from the caller's
   * WETH balance via `transferFrom`. The SDK automatically wraps ETH → WETH
   * and approves the SniperUtilV2 if needed. The `bidAmount` is sent as
   * `msg.value` (separate from the swap).
   *
   * Gas price must exceed the pool's `gasPeg` — the delta encodes the bid.
   * Both `maxFeePerGas` and `maxPriorityFeePerGas` are set to ensure the
   * effective gas price matches on Base (EIP-1559). Gas estimation is skipped
   * because `eth_estimateGas` simulates at `baseFee` which is below `gasPeg`.
   *
   * @example
   * ```typescript
   * // 1. Get auction state & pool key
   * const state = await sdk.getAuctionState(poolId);
   * const rewards = await sdk.getTokenRewards(tokenAddress);
   *
   * // 2. Calculate gas price for desired bid
   * const gasPrice = await sdk.getAuctionGasPriceForBid(state.gasPeg, bidAmount);
   *
   * // 3. Bid (SDK auto-wraps WETH + approves if needed)
   * const result = await sdk.bidInAuction({
   *   poolKey: rewards.poolKey,
   *   zeroForOne: true,            // ETH → token
   *   amountIn: parseEther("0.1"), // swap 0.1 ETH (pulled from WETH balance)
   *   amountOutMinimum: 0n,        // set slippage
   *   round: state.round,
   *   bidAmount: parseEther("0.01"),
   * }, gasPrice);
   * ```
   */
  async bidInAuction(
    params: BidInAuctionParams,
    maxFeePerGas: bigint,
  ): Promise<BidInAuctionResult> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for bidInAuction");
    }

    const account = this.walletClient.account;
    const weth = EXTERNAL.WETH;

    // ── Auto-wrap ETH → WETH if needed ────────────────────────────────
    const wethBalance = (await this.publicClient.readContract({
      address: weth,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;

    if (wethBalance < params.amountIn) {
      const wrapAmount = params.amountIn - wethBalance;
      const wrapTx = await this.walletClient.writeContract({
        address: weth,
        abi: [{ type: "function", name: "deposit", inputs: [], outputs: [], stateMutability: "payable" }] as const,
        functionName: "deposit",
        args: [],
        value: wrapAmount,
        chain: base,
        account,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: wrapTx });
    }

    // ── Auto-approve SniperUtilV2 for WETH (EXACT amount — no standing) ──
    // Approves only what this bid needs. The bid's `transferFrom` consumes
    // the full allowance, so nothing survives the bid → no standing WETH
    // allowance for a "drain via standing approval" exploit to target.
    // (Defense-in-depth after a sibling Clanker fork was drained via that
    // pattern in 2026-05. The underlying protocol fix is owner setting
    // `paymentPerGasUnit = 0` on the auction contract.)
    //
    // Trade-off: prior versions approved `amountIn * 10n` so 9 subsequent
    // bids needed no approve. Sniper bots that previously relied on that
    // pre-approval should call `WETH.approve(SNIPER_UTIL_V2, amountIn)`
    // ahead of the auction window (and accept the brief standing-allowance
    // window), OR start `bidInAuction` ~1 block earlier so the approve
    // confirms in time. Existing residual allowances from older SDK
    // versions are NOT touched here — holders should revoke them.
    const allowance = (await this.publicClient.readContract({
      address: weth,
      abi: ERC20Abi,
      functionName: "allowance",
      args: [account.address, ADDRESSES.SNIPER_UTIL_V2],
    })) as bigint;

    if (allowance < params.amountIn) {
      const approveTx = await this.walletClient.writeContract({
        address: weth,
        abi: ERC20Abi,
        functionName: "approve",
        args: [ADDRESSES.SNIPER_UTIL_V2, params.amountIn],
        chain: base,
        account,
      });
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // ── Encode hookData ────────────────────────────────────────────────
    const hookData = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "bytes", name: "mevModuleSwapData" },
            { type: "bytes", name: "poolExtensionSwapData" },
          ],
        },
      ],
      [
        {
          mevModuleSwapData: encodeAbiParameters(
            [{ type: "address" }],
            [ADDRESSES.SNIPER_UTIL_V2]
          ),
          poolExtensionSwapData: "0x",
        },
      ]
    );

    // ── Execute bid ───────────────────────────────────────────────────
    // Both maxFeePerGas and maxPriorityFeePerGas must be set so that
    // effective gas price = maxFeePerGas on Base (EIP-1559 L2).
    // Gas is set manually because eth_estimateGas simulates at baseFee
    // which is below gasPeg, causing the auction check to fail.
    const txHash = await this.walletClient.writeContract({
      address: ADDRESSES.SNIPER_UTIL_V2,
      abi: LiquidSniperUtilV2Abi,
      functionName: "bidInAuction",
      args: [
        {
          poolKey: params.poolKey,
          zeroForOne: params.zeroForOne,
          amountIn: params.amountIn,
          amountOutMinimum: params.amountOutMinimum,
          hookData,
        },
        params.round,
      ],
      value: params.bidAmount,
      chain: base,
      account,
      gas: 800_000n,
      maxFeePerGas,
      maxPriorityFeePerGas: maxFeePerGas,
    });

    return { txHash };
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

    return await this.walletClient.writeContract({
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
    const locker = lockerAddress ?? DEFAULTS.LOCKER;
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

    const locker = lockerAddress ?? DEFAULTS.LOCKER;
    return await this.walletClient.writeContract({
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

    const locker = lockerAddress ?? DEFAULTS.LOCKER;
    return await this.walletClient.writeContract({
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

    const locker = lockerAddress ?? DEFAULTS.LOCKER;
    return await this.walletClient.writeContract({
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

  // ── MEV Descending Fees ─────────────────────────────────────────────

  async getMevDescendingFeesBlockDelay(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.MEV_DESCENDING_FEES,
      abi: LiquidMevDescendingFeesAbi,
      functionName: "blockDelay",
    })) as bigint;
  }

  /** @deprecated Use getMevDescendingFeesBlockDelay() */
  async getMevBlockDelay(): Promise<bigint> {
    return this.getMevDescendingFeesBlockDelay();
  }

  async getPoolUnlockTime(poolId: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: ADDRESSES.MEV_DESCENDING_FEES,
      abi: LiquidMevDescendingFeesAbi,
      functionName: "poolUnlockTime",
      args: [poolId],
    })) as bigint;
  }

  // ── Token Metadata Updates ──────────────────────────────────────────

  /**
   * Update a token's image. Must be called by the token admin.
   */
  async updateImage(tokenAddress: Address, newImage: string): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for updateImage");
    }

    return await this.walletClient.writeContract({
      address: tokenAddress,
      abi: LiquidTokenAbi,
      functionName: "updateImage",
      args: [newImage],
      chain: base,
      account: this.walletClient.account,
    });
  }

  /**
   * Update a token's metadata. Must be called by the token admin.
   */
  async updateMetadata(
    tokenAddress: Address,
    newMetadata: string
  ): Promise<Hash> {
    if (!this.walletClient?.account) {
      throw new Error("walletClient with account required for updateMetadata");
    }

    return await this.walletClient.writeContract({
      address: tokenAddress,
      abi: LiquidTokenAbi,
      functionName: "updateMetadata",
      args: [newMetadata],
      chain: base,
      account: this.walletClient.account,
    });
  }

  // ── Token Discovery ─────────────────────────────────────────────────

  /**
   * Get all tokens deployed by a specific address by querying TokenCreated events.
   * @param deployer - The address that deployed the tokens (msgSender)
   * @param fromBlock - Starting block to search from (defaults to 0n)
   * @param toBlock - Ending block to search to (defaults to 'latest')
   */
  async getDeployedTokens(
    deployer: Address,
    fromBlock?: bigint,
    toBlock?: bigint | "latest"
  ): Promise<TokenCreatedEvent[]> {
    return this.getTokens({ deployer, fromBlock, toBlock });
  }

  /**
   * Query TokenCreated events with optional filtering.
   *
   * Use this for token discovery, indexing, or building token lists.
   * Returns events in chronological order with block numbers for pagination.
   *
   * @example
   * // Get all tokens
   * const allTokens = await sdk.getTokens();
   *
   * // Get tokens by deployer
   * const myTokens = await sdk.getTokens({ deployer: myAddress });
   *
   * // Paginate with block ranges
   * const page1 = await sdk.getTokens({ fromBlock: 20000000n, toBlock: 20100000n });
   * const page2 = await sdk.getTokens({ fromBlock: 20100001n, toBlock: 20200000n });
   */
  async getTokens(options?: GetTokensOptions): Promise<TokenCreatedEvent[]> {
    const logs = await this.publicClient.getLogs({
      address: ADDRESSES.FACTORY,
      event: parseAbiItem(
        "event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)"
      ),
      fromBlock: options?.fromBlock ?? 0n,
      toBlock: options?.toBlock ?? "latest",
    });

    const deployer = options?.deployer;

    return logs
      .filter((log) => {
        if (!deployer) return true;
        // msgSender is not indexed, so we filter client-side
        const sender = (log.args as any).msgSender;
        return sender && getAddress(sender) === getAddress(deployer);
      })
      .map((log) => {
        const args = log.args as any;
        return {
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
          blockNumber: log.blockNumber,
        };
      });
  }

  /**
   * Look up a single token's on-chain event data by contract address.
   *
   * Returns the full TokenCreated event including metadata, context, poolId,
   * hook, locker, extensions — everything a wallet or aggregator needs to
   * display the token. Returns `null` if not found.
   *
   * This is indexed on-chain (tokenAddress is indexed in the event), so it's
   * a single RPC call regardless of how many tokens exist.
   */
  async getTokenEvent(tokenAddress: Address): Promise<TokenCreatedEvent | null> {
    const logs = await this.publicClient.getLogs({
      address: ADDRESSES.FACTORY,
      event: parseAbiItem(
        "event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)"
      ),
      args: { tokenAddress },
      fromBlock: 0n,
      toBlock: "latest",
    });

    if (logs.length === 0) return null;

    const log = logs[0];
    const args = log.args as any;
    return {
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
      blockNumber: log.blockNumber,
    };
  }
}
