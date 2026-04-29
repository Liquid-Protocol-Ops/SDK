/**
 * deploy-diem-paired-token.ts — Deploy a Liquid Protocol token paired with DIEM on Base.
 *
 * Pairs the new token against DIEM (0xf4d97f2da56e8c3098f3a8d538db630a2606a024)
 * instead of the default WETH and uses a custom 7-position layout calibrated
 * for an agent-coin lifecycle:
 *
 *   Early band ($1K → $1M FDV) — thin, highly volatile:
 *     P1 0.5%  $1K  → $30K
 *     P2 3.0%  $1K  → $200K
 *     P3 6.5%  $1K  → $1M
 *
 *   Growth band ($1M → $10B FDV) — overlapping ranges, deeper:
 *     P4 30%   $1M  → $10M
 *     P5 25%   $5M  → $100M
 *     P6 20%   $30M → $1B
 *     P7 15%   $300M→ $10B
 *
 * USD targets are converted to DIEM-denominated FDV using a hard-coded
 * DIEM/USD reference price (DIEM_USD). Override via env if the price has
 * drifted; the script also reads DIEM.decimals() on-chain and bails if
 * it isn't 18 (tick math assumes both sides are 1e18-scaled).
 *
 * LP fees collected by the fee-conversion locker accrue in DIEM. Claim with:
 *   sdk.claimFees(rewardRecipient, DIEM_ADDRESS)
 *
 * Usage:
 *   DEPLOYER_KEY=0x... npx tsx deploy-diem-paired-token.ts
 *
 * Optional env vars:
 *   RPC_URL       — Base RPC endpoint (default: https://mainnet.base.org)
 *   TOKEN_NAME    — Token name (default: "Liquid DIEM Paired Token")
 *   TOKEN_SYMBOL  — Token symbol (default: "LIQDIEM")
 *   DIEM_USD      — Override DIEM/USD price used for tick math (default: 181.90)
 *   DRY_RUN       — "1" prints the resolved config and exits without deploying.
 *
 * Note: the default Univ4EthDevBuy extension only supports WETH-paired pools,
 * so this script intentionally does NOT perform a dev buy at launch.
 */

import "dotenv/config";
import { createPublicClient, createWalletClient, http, formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK, ADDRESSES, DEFAULTS, TOKEN } from "./src";

// ── Constants ─────────────────────────────────────────────────────

const DIEM_ADDRESS: Address = "0xf4d97f2da56e8c3098f3a8d538db630a2606a024";
const TICK_SPACING = DEFAULTS.TICK_SPACING; // 200
const LIQUID_DECIMALS = TOKEN.DECIMALS;     // 18
const LIQUID_SUPPLY  = TOKEN.SUPPLY;        // 100_000_000_000 × 1e18

// ── Tick math helpers ────────────────────────────────────────────────

const LN_1_0001 = Math.log(1.0001);

/**
 * Convert a USD market-cap target into a Uniswap-V4 tick under the
 * assumption that:
 *   — Liquid token sorts as currency0 (factory negates if not),
 *   — both sides are 18-decimal,
 *   — supply is fixed at TOKEN.SUPPLY (100B).
 *
 * Returned tick is rounded DOWN to the nearest multiple of `TICK_SPACING`,
 * which keeps the realised starting price <= the requested price (i.e.
 * launch market cap <= requested USD).
 */
function usdMcToTick(mcUsd: number, diemUsd: number): number {
  // FDV in DIEM = mcUsd / diemUsd
  // price (DIEM per Liquid, raw 1e18/1e18) = FDV_DIEM / supplyHumanUnits
  // supplyHumanUnits = 100_000_000_000
  const supplyHuman = 100_000_000_000;
  const fdvDiem = mcUsd / diemUsd;
  const price   = fdvDiem / supplyHuman;
  const rawTick = Math.log(price) / LN_1_0001;
  return Math.floor(rawTick / TICK_SPACING) * TICK_SPACING;
}

/** Round a tick to the nearest valid (multiple of TICK_SPACING) value. */
function snap(tick: number): number {
  return Math.round(tick / TICK_SPACING) * TICK_SPACING;
}

// ── Position layout ────────────────────────────────────────────────────

interface PositionSpec {
  label: string;
  lowerMcUsd: number;
  upperMcUsd: number;
  positionBps: number; // out of 10_000
}

const POSITIONS: PositionSpec[] = [
  { label: "P1 — early thin",    lowerMcUsd:    1_000, upperMcUsd:    30_000, positionBps:   50 }, // 0.5%
  { label: "P2 — early mid",     lowerMcUsd:    1_000, upperMcUsd:   200_000, positionBps:  300 }, // 3.0%
  { label: "P3 — early wide",    lowerMcUsd:    1_000, upperMcUsd: 1_000_000, positionBps:  650 }, // 6.5%
  { label: "P4 — growth core",   lowerMcUsd: 1_000_000, upperMcUsd:   10_000_000, positionBps: 3000 }, // 30%
  { label: "P5 — growth mid",    lowerMcUsd: 5_000_000, upperMcUsd:  100_000_000, positionBps: 2500 }, // 25%
  { label: "P6 — growth upper",  lowerMcUsd:30_000_000, upperMcUsd: 1_000_000_000, positionBps: 2000 }, // 20%
  { label: "P7 — long tail",     lowerMcUsd:300_000_000,upperMcUsd:10_000_000_000, positionBps: 1500 }, // 15%
];

// ── Env ──────────────────────────────────────────────────────────────────

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
const RPC_URL      = process.env.RPC_URL ?? "https://mainnet.base.org";
const TOKEN_NAME   = process.env.TOKEN_NAME   ?? "Liquid DIEM Paired Token";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL ?? "LIQDIEM";
const DIEM_USD     = Number(process.env.DIEM_USD ?? "181.90");
const DRY_RUN      = process.env.DRY_RUN === "1";

if (!DEPLOYER_KEY && !DRY_RUN) {
  console.error("ERROR: No DEPLOYER_KEY found.");
  console.error("Run with DRY_RUN=1 to print the resolved config without deploying.");
  console.error("  DEPLOYER_KEY=0x... npx tsx deploy-diem-paired-token.ts");
  process.exit(1);
}
if (!Number.isFinite(DIEM_USD) || DIEM_USD <= 0) {
  console.error(`ERROR: DIEM_USD must be a positive number, got: ${process.env.DIEM_USD}`);
  process.exit(1);
}

// ── Build resolved config ────────────────────────────────────────────────

const startingTick = usdMcToTick(POSITIONS[0].lowerMcUsd, DIEM_USD);
const tickLower    = POSITIONS.map(p => snap(usdMcToTick(p.lowerMcUsd, DIEM_USD)));
const tickUpper    = POSITIONS.map(p => snap(usdMcToTick(p.upperMcUsd, DIEM_USD)));
const positionBps  = POSITIONS.map(p => p.positionBps);

// Force at least one position's tickLower to equal the starting tick
// (factory invariant). P1–P3 already start at the lowest USD target so
// this is automatic, but we floor-snap them to startingTick defensively.
for (let i = 0; i < POSITIONS.length; i++) {
  if (POSITIONS[i].lowerMcUsd === POSITIONS[0].lowerMcUsd) {
    tickLower[i] = startingTick;
  }
}

const totalBps = positionBps.reduce((a, b) => a + b, 0);

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const account = DEPLOYER_KEY
    ? privateKeyToAccount(DEPLOYER_KEY as `0x${string}`)
    : undefined;

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  // Header
  console.log("=== Liquid Protocol — DIEM-Paired Deploy (custom MC layout) ===");
  console.log("");
  console.log("DIEM:         ", DIEM_ADDRESS);
  console.log("DIEM/USD:     ", `$${DIEM_USD}  (override via DIEM_USD env)`);
  console.log("Token supply: ", LIQUID_SUPPLY.toString(), `(=${100_000_000_000} × 1e${LIQUID_DECIMALS})`);
  console.log("Tick spacing: ", TICK_SPACING);
  console.log("");

  // Verify DIEM decimals on-chain so the tick math is honest
  const diemDecimals = await publicClient.readContract({
    address: DIEM_ADDRESS,
    abi: [{ type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" }] as const,
    functionName: "decimals",
  });
  if (diemDecimals !== 18) {
    console.error(`ERROR: DIEM.decimals() = ${diemDecimals}, expected 18.`);
    console.error("Tick math in this script assumes both sides are 18-decimal.");
    console.error("Adjust by adding (decimalsLiquid - decimalsDIEM)*ln(10)/ln(1.0001) to every tick.");
    process.exit(1);
  }

  console.log("--- Position layout ---");
  console.log("idx  bps   USD MC range                 tickLower  tickUpper  label");
  POSITIONS.forEach((p, i) => {
    const usdRange = `$${p.lowerMcUsd.toLocaleString()} → $${p.upperMcUsd.toLocaleString()}`.padEnd(28);
    console.log(
      `${String(i + 1).padStart(2)}  ${String(p.positionBps).padStart(4)}  ${usdRange}  ${String(tickLower[i]).padStart(8)}  ${String(tickUpper[i]).padStart(8)}  ${p.label}`,
    );
  });
  console.log("");
  console.log(`Sum positionBps = ${totalBps} (must be 10000)`);
  console.log(`Starting tick   = ${startingTick}  (≈ $${POSITIONS[0].lowerMcUsd.toLocaleString()} FDV at $${DIEM_USD}/DIEM)`);
  console.log("");

  if (totalBps !== 10_000) {
    console.error(`ERROR: positionBps sums to ${totalBps}, must equal 10_000.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("DRY_RUN=1 — exiting without deploying.");
    return;
  }

  if (!account) {
    throw new Error("unreachable: missing DEPLOYER_KEY past dry-run check");
  }

  const walletClient = createWalletClient({
    chain: base,
    transport: http(RPC_URL),
    account,
  });

  const sdk = new LiquidSDK({ publicClient, walletClient });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Deployer:", account.address);
  console.log("Balance: ", formatEther(balance), "ETH");
  console.log("");

  if (balance < 1_000_000_000_000_000n) {
    console.error("ERROR: Deployer has < 0.001 ETH. Fund it first to cover gas.");
    process.exit(1);
  }

  console.log("--- Contracts ---");
  console.log("Factory:", ADDRESSES.FACTORY);
  console.log("Hook:   ", DEFAULTS.HOOK,    "(static 1% buy / 1% sell)");
  console.log("Locker: ", DEFAULTS.LOCKER,  "(fee-conversion — fees paid in DIEM)");
  console.log("MEV:    ", DEFAULTS.MEV_MODULE, "(Sniper Auction 80%→40% over 20s)");
  console.log("");
  console.log("Deploying...");
  console.log("");

  try {
    const result = await sdk.deployToken({
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      context: "SDK deploy paired with DIEM (custom 7-position MC layout)",
      pairedToken: DIEM_ADDRESS,
      tickIfToken0IsLiquid: startingTick,
      tickSpacing: TICK_SPACING,
      tickLower,
      tickUpper,
      positionBps,
    });

    console.log("============================");
    console.log("  DEPLOY SUCCESS!");
    console.log("============================");
    console.log("");
    console.log("Token:       ", result.tokenAddress);
    console.log("Tx:          ", result.txHash);
    console.log("Pool ID:     ", result.event.poolId);
    console.log("Paired token:", result.event.pairedToken);
    console.log("Hook:        ", result.event.poolHook);
    console.log("Locker:      ", result.event.locker);
    console.log("MEV Module:  ", result.event.mevModule);
    console.log("");
    console.log("LP fees will accrue in DIEM. Claim with:");
    console.log(`  sdk.claimFees("${account.address}", "${DIEM_ADDRESS}")`);
    console.log("");
    console.log("Basescan:", `https://basescan.org/address/${result.tokenAddress}`);
    console.log("Tx link: ", `https://basescan.org/tx/${result.txHash}`);
  } catch (err: any) {
    console.error("============================");
    console.error("  DEPLOY FAILED");
    console.error("============================");
    console.error("");
    console.error("Error:", err.shortMessage ?? err.message ?? err);
    if (err.details) console.error("Details:", err.details);
    process.exit(1);
  }
}

main();
