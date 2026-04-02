/**
 * update-reward-recipient.ts — Change the fee recipient for a token's reward index.
 *
 * Must be called by the reward admin for the given index.
 *
 * Usage:
 *   TOKEN=0x... NEW_RECIPIENT=0x... npx tsx update-reward-recipient.ts
 *
 * Optional:
 *   REWARD_INDEX — Index in the rewards array (default: 0)
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK, ADDRESSES } from "./src";

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) { console.error("ERROR: No DEPLOYER_KEY."); process.exit(1); }

const TOKEN = process.env.TOKEN as Address | undefined;
if (!TOKEN) { console.error("ERROR: Set TOKEN env var."); process.exit(1); }

const NEW_RECIPIENT = process.env.NEW_RECIPIENT as Address | undefined;
if (!NEW_RECIPIENT) { console.error("ERROR: Set NEW_RECIPIENT env var."); process.exit(1); }

const REWARD_INDEX = BigInt(process.env.REWARD_INDEX ?? "0");
const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });
  const sdk = new LiquidSDK({ publicClient, walletClient });

  const rewards = await sdk.getTokenRewards(TOKEN);

  console.log("=== Update Reward Recipient ===");
  console.log("");
  console.log("Token:", TOKEN);
  console.log("Reward index:", REWARD_INDEX.toString());
  console.log("Current admin:", rewards.rewardAdmins[Number(REWARD_INDEX)]);
  console.log("Current recipient:", rewards.rewardRecipients[Number(REWARD_INDEX)]);
  console.log("New recipient:", NEW_RECIPIENT);
  console.log("BPS:", rewards.rewardBps[Number(REWARD_INDEX)], `(${(rewards.rewardBps[Number(REWARD_INDEX)] / 100).toFixed(1)}%)`);
  console.log("");

  if (rewards.rewardAdmins[Number(REWARD_INDEX)]?.toLowerCase() !== account.address.toLowerCase()) {
    console.error("ERROR: You are not the admin for this index.");
    console.error("Your address:", account.address);
    process.exit(1);
  }

  console.log("Sending tx...");

  const txHash = await sdk.updateRewardRecipient(TOKEN, REWARD_INDEX, NEW_RECIPIENT);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    const updated = await sdk.getTokenRewards(TOKEN);
    console.log("");
    console.log("SUCCESS! Reward recipient updated.");
    console.log("New recipient:", updated.rewardRecipients[Number(REWARD_INDEX)]);
    console.log("Tx:", `https://basescan.org/tx/${txHash}`);
  } else {
    console.error("REVERTED");
    process.exit(1);
  }
}

main();
