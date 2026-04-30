/**
 * update-reward-admin.ts — Change the reward admin for a token's reward index.
 *
 * The reward admin can update the reward recipient and fee preference for their index.
 *
 * Usage:
 *   TOKEN=0x... NEW_ADMIN=0x... npx tsx update-reward-admin.ts
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
import { LiquidSDK, ADDRESSES, LiquidLpLockerAbi } from "./src";

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) { console.error("ERROR: No DEPLOYER_KEY."); process.exit(1); }

const TOKEN = process.env.TOKEN as Address | undefined;
if (!TOKEN) { console.error("ERROR: Set TOKEN env var."); process.exit(1); }

const NEW_ADMIN = process.env.NEW_ADMIN as Address | undefined;
if (!NEW_ADMIN) { console.error("ERROR: Set NEW_ADMIN env var."); process.exit(1); }

const REWARD_INDEX = BigInt(process.env.REWARD_INDEX ?? "0");
const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });
  const sdk = new LiquidSDK({ publicClient, walletClient });

  const rewards = await sdk.getTokenRewards(TOKEN);

  console.log("=== Update Reward Admin ===");
  console.log("");
  console.log("Token:", TOKEN);
  console.log("Reward index:", REWARD_INDEX.toString());
  console.log("Current admin:", rewards.rewardAdmins[Number(REWARD_INDEX)]);
  console.log("New admin:", NEW_ADMIN);
  console.log("");

  if (rewards.rewardAdmins[Number(REWARD_INDEX)]?.toLowerCase() !== account.address.toLowerCase()) {
    console.error("ERROR: You are not the current admin for this index.");
    console.error("Your address:", account.address);
    process.exit(1);
  }

  console.log("Sending tx...");

  const txHash = await walletClient.writeContract({
    address: ADDRESSES.LP_LOCKER_FEE_CONVERSION,
    abi: LiquidLpLockerAbi,
    functionName: "updateRewardAdmin",
    args: [TOKEN, REWARD_INDEX, NEW_ADMIN],
    chain: base,
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    console.log("");
    console.log("SUCCESS! Reward admin updated.");
    console.log("Tx:", `https://basescan.org/tx/${txHash}`);
  } else {
    console.error("REVERTED");
    process.exit(1);
  }
}

main();
