import type { Address, Hash, Hex } from "viem";

// ── On-chain struct mirrors ──────────────────────────────────────────

export interface TokenConfig {
  tokenAdmin: Address;
  name: string;
  symbol: string;
  salt: Hex;
  image: string;
  metadata: string;
  context: string;
  originatingChainId: bigint;
}

export interface PoolConfig {
  hook: Address;
  pairedToken: Address;
  tickIfToken0IsLiquid: number;
  tickSpacing: number;
  poolData: Hex;
}

export interface LockerConfig {
  locker: Address;
  rewardAdmins: Address[];
  rewardRecipients: Address[];
  rewardBps: number[];
  tickLower: number[];
  tickUpper: number[];
  positionBps: number[];
  lockerData: Hex;
}

export interface MevModuleConfig {
  mevModule: Address;
  mevModuleData: Hex;
}

export interface ExtensionConfig {
  extension: Address;
  msgValue: bigint;
  extensionBps: number;
  extensionData: Hex;
}

export interface DeploymentConfig {
  tokenConfig: TokenConfig;
  poolConfig: PoolConfig;
  lockerConfig: LockerConfig;
  mevModuleConfig: MevModuleConfig;
  extensionConfigs: ExtensionConfig[];
}

// ── Dev Buy types ───────────────────────────────────────────────────

export interface DevBuyParams {
  /** Amount of ETH to spend on the dev buy */
  ethAmount: bigint;
  /** Address to receive the purchased tokens */
  recipient: Address;
}

// ── SDK-level simplified params ──────────────────────────────────────

export interface DeployTokenParams {
  name: string;
  symbol: string;
  image?: string;
  metadata?: string;
  context?: string;
  tokenAdmin?: Address;
  salt?: Hex;

  /** Hook address. Defaults to HOOK_DYNAMIC_FEE_V2 */
  hook?: Address;
  /** Quote token. Defaults to WETH */
  pairedToken?: Address;
  /** Starting tick. Defaults to -198720 (approx $0.001 WETH per token) */
  tickIfToken0IsLiquid?: number;
  /** Tick spacing. Defaults to 60 */
  tickSpacing?: number;
  /** Pool-specific hook data */
  poolData?: Hex;

  /** LP locker address. Defaults to LP_LOCKER */
  locker?: Address;
  /** Reward admin addresses */
  rewardAdmins?: Address[];
  /** Reward recipient addresses */
  rewardRecipients?: Address[];
  /** Reward basis points per recipient */
  rewardBps?: number[];
  /** Tick lower bounds per position */
  tickLower?: number[];
  /** Tick upper bounds per position */
  tickUpper?: number[];
  /** Position BPS splits */
  positionBps?: number[];
  /** Locker-specific data */
  lockerData?: Hex;

  /** MEV module address. Defaults to MEV_BLOCK_DELAY */
  mevModule?: Address;
  /** MEV module initialization data */
  mevModuleData?: Hex;

  /** Extension configs (vault, airdrop, etc.) */
  extensions?: ExtensionConfig[];

  /** Dev buy: buy tokens with ETH at launch. Adds the Univ4EthDevBuy extension automatically. */
  devBuy?: DevBuyParams;
}

// ── Return types ─────────────────────────────────────────────────────

export interface DeploymentInfo {
  token: Address;
  hook: Address;
  locker: Address;
  extensions: Address[];
}

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface PoolDynamicConfigVars {
  baseFee: number;
  maxLpFee: number;
  referenceTickFilterPeriod: bigint;
  resetPeriod: bigint;
  resetTickFilter: number;
  feeControlNumerator: bigint;
  decayFilterBps: number;
}

export interface PoolDynamicFeeVars {
  referenceTick: number;
  resetTick: number;
  resetTickTimestamp: bigint;
  lastSwapTimestamp: bigint;
  appliedVR: number;
  prevVA: number;
}

export interface VaultAllocation {
  token: Address;
  amountTotal: bigint;
  amountClaimed: bigint;
  lockupEndTime: bigint;
  vestingEndTime: bigint;
  admin: Address;
}

export interface TokenCreatedEvent {
  msgSender: Address;
  tokenAddress: Address;
  tokenAdmin: Address;
  tokenImage: string;
  tokenName: string;
  tokenSymbol: string;
  tokenMetadata: string;
  tokenContext: string;
  startingTick: number;
  poolHook: Address;
  poolId: Hex;
  pairedToken: Address;
  locker: Address;
  mevModule: Address;
  extensionsSupply: bigint;
  extensions: Address[];
}

export interface AirdropInfo {
  admin: Address;
  merkleRoot: Hex;
  totalSupply: bigint;
  totalClaimed: bigint;
  lockupEndTime: bigint;
  vestingEndTime: bigint;
  adminClaimTime: bigint;
  adminClaimed: boolean;
}

export interface SniperAuctionFeeConfig {
  startingFee: number;
  endingFee: number;
  secondsToDecay: bigint;
}

export interface SniperAuctionState {
  nextAuctionBlock: bigint;
  round: bigint;
  gasPeg: bigint;
  currentFee: number;
}

export interface TokenRewardInfo {
  token: Address;
  poolKey: PoolKey;
  positionId: bigint;
  numPositions: bigint;
  rewardBps: number[];
  rewardAdmins: Address[];
  rewardRecipients: Address[];
}

export interface LiquidSDKConfig {
  publicClient: any; // viem PublicClient
  walletClient?: any; // viem WalletClient
}

export interface DeployTokenResult {
  tokenAddress: Address;
  txHash: Hash;
  event: TokenCreatedEvent;
}
