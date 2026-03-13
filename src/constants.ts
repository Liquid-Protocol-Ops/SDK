import { type Address } from "viem";
import { base } from "viem/chains";

// ── Production addresses (Base mainnet) ──────────────────────────────

export const ADDRESSES = {
  FACTORY: "0x04F1a284168743759BE6554f607a10CEBdB77760" as Address,
  POOL_EXTENSION_ALLOWLIST:
    "0xb614167d79aDBaA9BA35d05fE1d5542d7316Ccaa" as Address,
  FEE_LOCKER: "0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF" as Address,
  LP_LOCKER_FEE_CONVERSION:
    "0x77247fCD1d5e34A3703AcA898A591Dc7422435f3" as Address,
  VAULT: "0xdFCCC93257c20519A9005A2281CFBdF84836d50E" as Address,
  HOOK_DYNAMIC_FEE_V2:
    "0x80E2F7dC8C2C880BbC4BDF80A5Fb0eB8B1DB68CC" as Address,
  HOOK_STATIC_FEE_V2:
    "0x9811f10Cd549c754Fa9E5785989c422A762c28cc" as Address,
  SNIPER_AUCTION_V2:
    "0x187e8627c02c58F31831953C1268e157d3BfCefd" as Address,
  SNIPER_UTIL_V2: "0x2B6cd5Be183c388Dd0074d53c52317df1414cd9f" as Address,
  MEV_DESCENDING_FEES:
    "0x8D6B080e48756A99F3893491D556B5d6907b6910" as Address,
  AIRDROP_V2: "0x1423974d48f525462f1c087cBFdCC20BDBc33CdD" as Address,
  UNIV4_ETH_DEV_BUY:
    "0x5934097864dC487D21A7B4e4EEe201A39ceF728D" as Address,
  UNIV3_ETH_DEV_BUY:
    "0x376028cfb6b9A120E24Aa14c3FAc4205179c0025" as Address,
  PRESALE_ETH_TO_CREATOR:
    "0x3bca63EcB49d5f917092d10fA879Fdb422740163" as Address,
  PRESALE_ALLOWLIST:
    "0xCBb4ccC4B94E23233c14759f4F9629F7dD01f10B" as Address,
} as const;

// ── External protocol addresses (Base mainnet) ──────────────────────

export const EXTERNAL = {
  POOL_MANAGER: "0x498581fF718922c3f8e6A244956aF099B2652b2b" as Address,
  WETH: "0x4200000000000000000000000000000000000006" as Address,
  UNIVERSAL_ROUTER:
    "0x6fF5693b99212Da76ad316178A184AB56D299b43" as Address,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
} as const;

// ── Fee constants ────────────────────────────────────────────────────

export const FEE = {
  /** Fee denominator used by Uniswap v4 (1,000,000 = 100%) */
  DENOMINATOR: 1_000_000,
  /** Protocol fee numerator: 200,000 / 1,000,000 = 20% of LP fees */
  PROTOCOL_FEE_NUMERATOR: 200_000,
  /** Max LP fee: 10% (100,000 / 1,000,000) */
  MAX_LP_FEE: 100_000,
  /** Max MEV fee: 80% (800,000 / 1,000,000) */
  MAX_MEV_FEE: 800_000,
  /** BPS denominator for token supply splits */
  BPS: 10_000,
} as const;

// ── Token constants ──────────────────────────────────────────────────

export const TOKEN = {
  /** Total supply for every token: 100 billion with 18 decimals */
  SUPPLY: 100_000_000_000n * 10n ** 18n,
  DECIMALS: 18,
  MAX_EXTENSIONS: 10,
  MAX_EXTENSION_BPS: 9000,
} as const;

// ── Pool position presets ────────────────────────────────────────────

export interface PoolPosition {
  tickLower: number;
  tickUpper: number;
  positionBps: number;
}

/**
 * Pre-built position configurations.
 *
 * - **Standard**: Single position covering full range (~$20K → $1.5B).
 *   Default starting tick -230400 (≈10 ETH market cap).
 *
 * - **Liquid**: 3-tranche default for Liquid Protocol.
 *   Hardcoded for ≈10 ETH start at ~$2070/ETH.
 *   For dynamic market cap targets, use `createPositionsUSD()` instead.
 *
 * Note: positionBps must sum to 10,000 (100%).
 */
export const POOL_POSITIONS = {
  /** Single position, 100% of liquidity in one range */
  Standard: [
    {
      tickLower: -230400, // ~10 ETH / ~$20K
      tickUpper: -120000, // ~$1.5B
      positionBps: 10_000,
    },
  ] as PoolPosition[],

  /** 3-tranche Liquid default (hardcoded for ~10 ETH start, ~$2070/ETH) */
  Liquid: [
    {
      tickLower: -230400, // ~$20K starting
      tickUpper: -198600, // ~$500K
      positionBps: 4_000, // 40%
    },
    {
      tickLower: -198600, // ~$500K
      tickUpper: -168600, // ~$10M
      positionBps: 5_000, // 50%
    },
    {
      tickLower: -168600, // ~$10M
      tickUpper: -122600, // ~$1B
      positionBps: 1_000, // 10%
    },
  ] as PoolPosition[],
} as const;

// ── Default deploy configuration ────────────────────────────────────

/**
 * Liquid protocol defaults.
 *
 * - Hook: Static fee V2, 1% on buys only (fees in ETH), 0% on sells
 * - MEV: Sniper Auction V2 — 80% → 40% decaying over 32 seconds
 * - Tick spacing: 200
 * - Starting tick: -230400 (≈10 ETH market cap)
 * - Positions: 3-tranche Liquid default (40/50/10)
 */
export const DEFAULTS = {
  HOOK: ADDRESSES.HOOK_STATIC_FEE_V2,
  /** LP Locker with fee conversion (converts fees to ETH before distributing) */
  LOCKER: ADDRESSES.LP_LOCKER_FEE_CONVERSION,
  TICK_SPACING: 200,
  TICK_IF_TOKEN0_IS_LIQUID: -230400,
  /** Static fee on buys (ETH → token): 1% (100 bps). Fees collected in ETH. */
  PAIRED_FEE_BPS: 100,
  /** Static fee on sells (token → ETH): 0%. No fees in liquid token. */
  LIQUID_FEE_BPS: 0,
  /** MEV module: Sniper Auction V2 */
  MEV_MODULE: ADDRESSES.SNIPER_AUCTION_V2,
  /** Sniper auction starting fee: 80% (800,000 uniBps) */
  SNIPER_STARTING_FEE: 800_000,
  /** Sniper auction ending fee: 40% (400,000 uniBps) */
  SNIPER_ENDING_FEE: 400_000,
  /** Sniper auction decay period: 32 seconds */
  SNIPER_SECONDS_TO_DECAY: 32,
} as const;

// ── Chain ────────────────────────────────────────────────────────────

export const DEFAULT_CHAIN = base;
export const DEFAULT_CHAIN_ID = 8453;
export const DEFAULT_RPC_URL = "https://base.drpc.org";
