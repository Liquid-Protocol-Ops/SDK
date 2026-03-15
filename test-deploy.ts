/**
 * test-deploy.ts — Deploy a test token using the Liquid Protocol SDK.
 *
 * Usage:
 *   DEPLOYER_KEY=0x... npx tsx test-deploy.ts
 *
 * Optional env vars:
 *   RPC_URL       — Base RPC endpoint (default: https://mainnet.base.org)
 *   TOKEN_NAME    — Token name (default: "Liquid Test Token")
 *   TOKEN_SYMBOL  — Token symbol (default: "LIQTEST")
 *   DEV_BUY_ETH   — ETH to swap for tokens at launch (default: "0.0001")
 */

import "dotenv/config";
import { createPublicClient, createWalletClient, http, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK, ADDRESSES, POOL_POSITIONS, DEFAULTS } from "./src";

// ── Config ──────────────────────────────────────────────────────────

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) {
  console.error("ERROR: No DEPLOYER_KEY found.");
  console.error("");
  console.error("Option 1: Create a .env file in the SDK root:");
  console.error("  echo 'DEPLOYER_KEY=0xYOUR_PRIVATE_KEY' > .env");
  console.error("");
  console.error("Option 2: Pass it inline:");
  console.error("  DEPLOYER_KEY=0x... npx tsx test-deploy.ts");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const TOKEN_NAME = process.env.TOKEN_NAME ?? "Liquid Test Token";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL ?? "LIQTEST";
const DEV_BUY_ETH = process.env.DEV_BUY_ETH ?? "0.0001"; // small buy to prove pool works

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

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("=== Liquid Protocol SDK Test Deploy ===");
  console.log("");
  console.log("Deployer:", account.address);
  console.log("Balance:", formatEther(balance), "ETH");
  console.log("");

  if (balance < 1_000_000_000_000_000n) {
    // < 0.001 ETH
    console.error("ERROR: Deployer has < 0.001 ETH. Fund it first.");
    console.error("Send Base ETH to:", account.address);
    process.exit(1);
  }

  console.log("Token:", TOKEN_NAME, `(${TOKEN_SYMBOL})`);
  console.log("");
  console.log("--- Contracts ---");
  console.log("Factory:", ADDRESSES.FACTORY);
  console.log("Hook:", DEFAULTS.HOOK);
  console.log("Locker:", DEFAULTS.LOCKER);
  console.log("MEV:", DEFAULTS.MEV_MODULE);
  console.log("");
  console.log("--- Default Config ---");
  console.log("Starting MC: ~10 ETH (~$20K at $2000/ETH)");
  console.log("Positions:", POOL_POSITIONS.Liquid.length, "(Liquid 5-position layout)");
  console.log("Fee: Static 1% buy, 0% sell (fees in ETH)");
  console.log("MEV: Sniper Auction 80% → 40% over 32s");
  console.log("Rewards: 100% to deployer");
  console.log("Dev buy:", DEV_BUY_ETH, "ETH (proves pool is swappable)");
  console.log("");
  console.log("Deploying + buying...");
  console.log("");

  try {
    const result = await sdk.deployToken({
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      context: "SDK test deployment",
      devBuy: {
        ethAmount: parseEther(DEV_BUY_ETH),
        recipient: account.address,
      },
    });

    console.log("============================");
    console.log("  DEPLOY + SWAP SUCCESS!");
    console.log("============================");
    console.log("");
    console.log("Token:", result.tokenAddress);
    console.log("Tx:", result.txHash);
    console.log("Pool ID:", result.event.poolId);
    console.log("Hook:", result.event.poolHook);
    console.log("Locker:", result.event.locker);
    console.log("MEV Module:", result.event.mevModule);
    console.log("Extensions:", result.event.extensions.length > 0 ? result.event.extensions : "none");
    console.log("");
    console.log("Your wallet received tokens from the dev buy swap.");
    console.log("This confirms the pool is live and tradeable.");
    console.log("");
    console.log("Basescan:", `https://basescan.org/address/${result.tokenAddress}`);
    console.log("Tx link:", `https://basescan.org/tx/${result.txHash}`);
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
