/**
 * collect-rewards.ts — Collect LP fee rewards (creator fees) for a token.
 *
 * Usage:
 *   TOKEN=0x... npx tsx collect-rewards.ts
 *
 * This calls collectRewards() on the LP Locker, which:
 *   1. Collects accrued LP fees from all positions
 *   2. Converts fees to WETH (FeeIn.Paired)
 *   3. Routes to FeeLocker by reward BPS split
 *   4. Then claims from FeeLocker to your wallet
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK, ADDRESSES, EXTERNAL } from "./src";

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) {
  console.error("ERROR: No DEPLOYER_KEY found. Set it in .env or pass inline.");
  process.exit(1);
}

const TOKEN = process.env.TOKEN as Address | undefined;
if (!TOKEN) {
  console.error("ERROR: Set TOKEN env var.");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });
  const sdk = new LiquidSDK({ publicClient, walletClient });

  console.log("=== Collect Creator Rewards ===");
  console.log("");
  console.log("Caller:", account.address);
  console.log("Token:", TOKEN);

  // Get reward config
  const rewards = await sdk.getTokenRewards(TOKEN);
  console.log("");
  console.log("--- Reward Config ---");
  for (let i = 0; i < rewards.rewardRecipients.length; i++) {
    console.log(`  [${i}] Admin: ${rewards.rewardAdmins[i]}`);
    console.log(`      Recipient: ${rewards.rewardRecipients[i]}`);
    console.log(`      BPS: ${rewards.rewardBps[i]} (${(rewards.rewardBps[i] / 100).toFixed(1)}%)`);
  }

  // Check claimable fees on FeeLocker (WETH)
  const claimableWeth = await sdk.getFeesToClaim(account.address, EXTERNAL.WETH);
  const availableWeth = await sdk.getAvailableFees(account.address, EXTERNAL.WETH);
  console.log("");
  console.log("--- Claimable Fees (before collect) ---");
  console.log("WETH claimable:", formatEther(claimableWeth));
  console.log("WETH available:", formatEther(availableWeth));

  // Check ETH balance before
  const ethBefore = await publicClient.getBalance({ address: account.address });

  console.log("");
  console.log("Collecting rewards...");

  try {
    const txHash = await sdk.collectRewards(TOKEN);
    console.log("Tx sent:", txHash);
    console.log("Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "success") {
      // Check updated claimable
      const claimableAfter = await sdk.getFeesToClaim(account.address, EXTERNAL.WETH);
      console.log("");
      console.log("============================");
      console.log("  COLLECT SUCCESS!");
      console.log("============================");
      console.log("");
      console.log("WETH now claimable:", formatEther(claimableAfter));
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("Tx:", `https://basescan.org/tx/${txHash}`);

      // Now claim from FeeLocker if there's anything
      if (claimableAfter > 0n) {
        console.log("");
        console.log("Claiming WETH from FeeLocker...");
        const claimTx = await sdk.claimFees(account.address, EXTERNAL.WETH);
        const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimTx });
        const ethAfter = await publicClient.getBalance({ address: account.address });
        console.log("Claim tx:", `https://basescan.org/tx/${claimTx}`);
        console.log("WETH claimed. ETH balance change:", formatEther(ethAfter - ethBefore), "(includes gas)");
      } else {
        console.log("");
        console.log("No fees to claim yet. Trade more to accrue fees.");
      }
    } else {
      console.error("COLLECT REVERTED");
      console.error("Tx:", `https://basescan.org/tx/${txHash}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("COLLECT FAILED");
    console.error("Error:", err.shortMessage ?? err.message ?? err);
    if (err.details) console.error("Details:", err.details);
    process.exit(1);
  }
}

main();
