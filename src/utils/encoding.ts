/**
 * ABI encoding helpers for pool data, fee configs, and MEV module data.
 */

import { type Hex, encodeAbiParameters, zeroAddress, type Address } from "viem";

// ── Pool Initialization Data (V2 hooks two-layer encoding) ──────────

/**
 * ABI for the outer PoolInitializationData struct used by V2 hooks.
 * Wraps fee data with optional pool extension info.
 */
const PoolInitializationDataAbi = [
  {
    type: "tuple",
    components: [
      { name: "extension", type: "address" },
      { name: "extensionData", type: "bytes" },
      { name: "feeData", type: "bytes" },
    ],
  },
] as const;

/**
 * ABI for static fee init data: [uint24 liquidFee, uint24 pairedFee]
 * Values are in uniBps (bps * 100, where 1_000_000 = 100%).
 */
const StaticFeeInitAbi = [
  { type: "uint24" },
  { type: "uint24" },
] as const;

/**
 * ABI for the sniper auction init data struct.
 */
const SniperAuctionInitAbi = [
  {
    type: "tuple",
    components: [
      { name: "startingFee", type: "uint24" },
      { name: "endingFee", type: "uint24" },
      { name: "secondsToDecay", type: "uint256" },
    ],
  },
] as const;

// ── Static Fee Encoding ─────────────────────────────────────────────

/**
 * Encode pool data for the static fee V2 hook.
 *
 * Uses two-layer encoding:
 * 1. Inner: static fee params [liquidFee, pairedFee] in uniBps
 * 2. Outer: PoolInitializationData wrapper
 *
 * @param liquidFeeBps - Fee when swapping for the liquid token (in bps, e.g. 100 = 1%)
 * @param pairedFeeBps - Fee when swapping for the paired token (in bps, e.g. 100 = 1%)
 * @param extension - Optional pool extension address (defaults to zero)
 * @param extensionData - Optional pool extension init data (defaults to "0x")
 * @returns Encoded poolData hex string
 *
 * @example
 * ```ts
 * // 1% fee both directions (default)
 * const poolData = encodeStaticFeePoolData(100, 100);
 * ```
 */
export function encodeStaticFeePoolData(
  liquidFeeBps: number,
  pairedFeeBps: number,
  extension: `0x${string}` = zeroAddress,
  extensionData: Hex = "0x",
): Hex {
  // Convert bps → uniBps (multiply by 100)
  const feeData = encodeAbiParameters(StaticFeeInitAbi, [
    liquidFeeBps * 100,
    pairedFeeBps * 100,
  ]);

  return encodeAbiParameters(PoolInitializationDataAbi, [
    {
      extension,
      extensionData,
      feeData,
    },
  ]);
}

// ── Dynamic Fee Encoding ────────────────────────────────────────────

/**
 * ABI for dynamic fee init data.
 */
const DynamicFeeInitAbi = [
  { type: "uint24" },   // baseFee (uniBps)
  { type: "uint24" },   // maxFee (uniBps)
  { type: "uint256" },  // referenceTickFilterPeriod
  { type: "uint256" },  // resetPeriod
  { type: "int24" },    // resetTickFilter
  { type: "uint256" },  // feeControlNumerator
  { type: "uint24" },   // decayFilterBps
] as const;

export interface DynamicFeeConfig {
  /** Base LP fee in bps (e.g. 100 = 1%) */
  baseFeeBps: number;
  /** Max LP fee in bps (e.g. 500 = 5%) */
  maxFeeBps: number;
  /** Reference tick filter period in seconds */
  referenceTickFilterPeriod: number;
  /** Reset period in seconds */
  resetPeriod: number;
  /** Reset tick filter (tick units) */
  resetTickFilter: number;
  /** Fee control numerator (scaling constant) */
  feeControlNumerator: bigint;
  /** Decay filter in bps */
  decayFilterBps: number;
}

/**
 * Encode pool data for the dynamic fee V2 hook.
 *
 * @param config - Dynamic fee configuration
 * @param extension - Optional pool extension address
 * @param extensionData - Optional pool extension init data
 * @returns Encoded poolData hex string
 */
export function encodeDynamicFeePoolData(
  config: DynamicFeeConfig,
  extension: `0x${string}` = zeroAddress,
  extensionData: Hex = "0x",
): Hex {
  const feeData = encodeAbiParameters(DynamicFeeInitAbi, [
    config.baseFeeBps * 100,
    config.maxFeeBps * 100,
    BigInt(config.referenceTickFilterPeriod),
    BigInt(config.resetPeriod),
    config.resetTickFilter,
    config.feeControlNumerator,
    config.decayFilterBps,
  ]);

  return encodeAbiParameters(PoolInitializationDataAbi, [
    {
      extension,
      extensionData,
      feeData,
    },
  ]);
}

// ── Sniper Auction MEV Encoding ─────────────────────────────────────

export interface SniperAuctionConfig {
  /** Starting fee in uniBps (e.g. 800_000 = 80%) */
  startingFee: number;
  /** Ending fee in uniBps (e.g. 400_000 = 40%) */
  endingFee: number;
  /** Seconds for fee to decay from starting to ending */
  secondsToDecay: number;
}

/**
 * Encode MEV module data for the Sniper Auction V2.
 *
 * @param config - Sniper auction fee configuration
 * @returns Encoded mevModuleData hex string
 *
 * @example
 * ```ts
 * // 80% → 40% over 32 seconds (default)
 * const mevData = encodeSniperAuctionData({
 *   startingFee: 800_000,
 *   endingFee: 400_000,
 *   secondsToDecay: 32,
 * });
 * ```
 */
export function encodeSniperAuctionData(config: SniperAuctionConfig): Hex {
  if (config.startingFee <= config.endingFee) {
    throw new Error("startingFee must be greater than endingFee");
  }
  if (config.secondsToDecay <= 0) {
    throw new Error("secondsToDecay must be positive");
  }

  return encodeAbiParameters(SniperAuctionInitAbi, [
    {
      startingFee: config.startingFee,
      endingFee: config.endingFee,
      secondsToDecay: BigInt(config.secondsToDecay),
    },
  ]);
}

// ── Fee Conversion Locker Data Encoding ─────────────────────────────

/**
 * Fee preference for LP_LOCKER_FEE_CONVERSION.
 * Determines which token each reward recipient receives their fees in.
 *
 * - `Both` (0): No conversion, fees paid in whichever token accrues
 * - `Paired` (1): Convert fees to paired token (usually WETH)
 * - `Liquid` (2): Convert fees to the liquid token
 */
export enum FeePreference {
  Both = 0,
  Paired = 1,
  Liquid = 2,
}

/**
 * Encode lockerData for LP_LOCKER_FEE_CONVERSION.
 *
 * The fee conversion locker requires a `FeeIn[]` array with one entry per
 * reward recipient, specifying how each recipient wants their fees.
 *
 * @param feePreferences - Array of FeePreference values, one per reward recipient
 * @returns Encoded lockerData hex string
 *
 * @example
 * ```ts
 * // Single recipient, fees converted to ETH
 * const lockerData = encodeFeeConversionLockerData([FeePreference.Paired]);
 *
 * // Two recipients: first gets ETH, second gets the token
 * const lockerData = encodeFeeConversionLockerData([FeePreference.Paired, FeePreference.Liquid]);
 * ```
 */
export function encodeFeeConversionLockerData(
  feePreferences: FeePreference[],
): Hex {
  // Encode as LpFeeConversionInfo struct: { FeeIn[] feePreference }
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "feePreference", type: "uint8[]" },
        ],
      },
    ],
    [{ feePreference: feePreferences }],
  );
}
