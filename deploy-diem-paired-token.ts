/**
 * deploy-diem-paired-token.ts — Deploy a Liquid Protocol token paired with DIEM on Base.
 *
 * Pairs the new token against DIEM (0xf4d97f2da56e8c3098f3a8d538db630a2606a024)
 * instead of the default WETH. LP fees collected by the fee-conversion locker
 * will accrue in DIEM (not WETH); claim them with:
 *
 *   sdk.claimFees(rewardRecipient, DIEM_ADDRESS)
 *
 * Usage:
 *   DEPLOYER_KEY=0x... npx tsx deploy-diem-paired-token.ts
 *
 * Optional env vars:
 *   RPC_URL       — Base RPC endpoint (default: https://mainnet.base.org)
 *   TOKEN_NAME    — Token name (default: "Liquid DIEM Paired Token")
 *   TOKEN_SYMBOL  — Token symbol (default: "LIQDIEM")
 *
 * Note: the default Univ4EthDevBuy extension only supports WETH-paired pools,
 * so this script intentionally does NOT perform a dev buy at launch. To buy
 * the new token, swap DIEM (or ETH→DIEM→token) on Uniswap V4 after deploy.
 */

import "dotenv/config";
import { createPublicClient, createWalletClient, http, formatEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK, ADDRESSES, POOL_POSITIONS, DEFAULTS } from "./src";

// ── Config ──────────────────────────────────────────────────────────

const DIEM_ADDRESS: Address = "0xf4d97f2da56e8c3098f3a8d538db630a2606a024";

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) {
  console.error("ERROR: No DEPLOYER_KEY found.");
  console.error("");
  console.error("Option 1: Create a .env file in the SDK root:");
  console.error("  echo 'DEPLOYER_KEY=0xYOUR_PRIVATE_KEY' > .env");
  console.error("");
  console.error("Option 2: Pass it inline:");
  console.error("  DEPLOYER_KEY=0x... npx tsx deploy-diem-paired-token.ts");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const TOKEN_NAME = process.env.TOKEN_NAME ?? "Liquid DIEM Paired Token";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL ?? "LIQDIEM";

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(RPC_URL),
    account,
  });

  const sdk = new LiquidSDK({ publicClient, walletClient });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("=== Liquid Protocol — Deploy Token Paired With DIEM ===");
  console.log("");
  console.log("Deployer:", account.address);
  console.log("Balance: ", formatEther(balance), "ETH");
  console.log("");

  if (balance < 1_000_000_000_000_000n) {
    // < 0.001 ETH — gas only, no dev buy
    console.error("ERROR: Deployer has < 0.001 ETH. Fund it first to cover gas.");
    console.error("Send Base ETH to:", account.address);
    process.exit(1);
  }

  console.log("Token:       ", TOKEN_NAME, `(${TOKEN_SYMBOL})`);
  console.log("Paired with: ", DIEM_ADDRESS, "(DIEM)");
  console.log("");
  console.log("--- Contracts ---");
  console.log("Factory:", ADDRESSES.FACTORY);
  console.log("Hook:   ", DEFAULTS.HOOK);
  console.log("Locker: ", DEFAULTS.LOCKER);
  console.log("MEV:    ", DEFAULTS.MEV_MODULE);
  console.log("");
  console.log("--- Default Config ---");
  console.log("Starting tick:", DEFAULTS.TICK_IF_TOKEN0_IS_LIQUID, "(≈10 paired tokens market cap)");
  console.log("Positions:    ", POOL_POSITIONS.Liquid.length, "(Liquid 5-position layout)");
  console.log("Fee:          ", "Static 1% buy, 1% sell");
  console.log("MEV:          ", "Sniper Auction 80% → 40% over 20s");
  console.log("Rewards:      ", "100% to deployer (fees paid in DIEM)");
  console.log("Dev buy:      ", "none (UNIV4_ETH_DEV_BUY only supports WETH pairs)");
  console.log("");
  console.log("Deploying...");
  console.log("");

  try {
    const result = await sdk.deployToken({
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      context: "SDK deploy paired with DIEM",
      pairedToken: DIEM_ADDRESS,
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
    console.log("Extensions:  ", result.event.extensions.length > 0 ? result.event.extensions : "none");
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
