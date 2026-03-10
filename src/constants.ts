import { type Address } from "viem";
import { base } from "viem/chains";

// ── Production addresses (Base mainnet) ──────────────────────────────

export const ADDRESSES = {
  FACTORY: "0x0000003482fe299E72d4908368044A8A173BE576" as Address,
  POOL_EXTENSION_ALLOWLIST:
    "0x000003Afb1b070F037D2871eE0A6b8c8f53F7B77" as Address,
  FEE_LOCKER: "0x000008B9242b7e4432f6c4b1EeAD93562f9Cc94d" as Address,
  LP_LOCKER: "0x00000548732DfA56Be1257cE44D0CFc3B46dDb2A" as Address,
  LP_LOCKER_FEE_CONVERSION:
    "0x00000547518784420CEeF761fb18D884bb908102" as Address,
  VAULT: "0x000001c5263F4d64CdC343cDA9C8bF961CF8376c" as Address,
  HOOK_DYNAMIC_FEE_V2:
    "0x2A2F73CDDa098d639bd8Bbcd7dF2bf24E06728cC" as Address,
  HOOK_STATIC_FEE_V2:
    "0xb2401c5369AaCF62F8d615623C7F68F84da428Cc" as Address,
  SNIPER_AUCTION_V2:
    "0x000007b64003ee07a69576F98859a0a36b854260" as Address,
  SNIPER_UTIL_V2: "0x000003Ee0cb9B0C82C6C7FCB7b81a9883F285270" as Address,
  MEV_BLOCK_DELAY: "0x0000035D83588954F3c581c3A66251b3F06AD5e4" as Address,
  AIRDROP_V2: "0x00000C222442512b08446D33dd9754a7F260BE79" as Address,
  UNIV4_ETH_DEV_BUY:
    "0x00000d7DE1f0A3FA7957F5d8A2b97B0E24e5783D" as Address,
  LIQUID_DEPLOYER_LIB:
    "0x00000f88b2d37A2006F2F0C8552d22E0b8945202" as Address,
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

// ── Chain ────────────────────────────────────────────────────────────

export const DEFAULT_CHAIN = base;
export const DEFAULT_CHAIN_ID = 8453;
