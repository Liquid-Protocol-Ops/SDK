/**
 * view-rewards.ts — View reward config, claimable fees, and pool info for a token.
 *
 * Usage:
 *   TOKEN=0x... npx tsx view-rewards.ts
 */

import "dotenv/config";
import {
  createPublicClient,
  http,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK, EXTERNAL } from "./src";

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) { console.error("ERROR: No DEPLOYER_KEY."); process.exit(1); }

const TOKEN = process.env.TOKEN as Address | undefined;
if (!TOKEN) { console.error("ERROR: Set TOKEN env var."); process.exit(1); }

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const sdk = new LiquidSDK({ publicClient });

  const [rewards, tokenInfo] = await Promise.all([
    sdk.getTokenRewards(TOKEN),
    sdk.getTokenInfo(TOKEN),
  ]);

  console.log("=== Token Reward Info ===");
  console.log("");
  console.log("Token:", tokenInfo.name, `(${tokenInfo.symbol})`);
  console.log("Address:", TOKEN);
  console.log("Supply:", formatEther(tokenInfo.totalSupply));
  console.log("Locker:", tokenInfo.deployment.locker);
  console.log("Hook:", tokenInfo.deployment.hook);
  console.log("");

  console.log("--- Pool Key ---");
  console.log("currency0:", rewards.poolKey.currency0);
  console.log("currency1:", rewards.poolKey.currency1);
  console.log("fee:", rewards.poolKey.fee, rewards.poolKey.fee === 0x800000 ? "(dynamic)" : "");
  console.log("tickSpacing:", rewards.poolKey.tickSpacing);
  console.log("hooks:", rewards.poolKey.hooks);
  console.log("Positions:", rewards.numPositions.toString());
  console.log("");

  console.log("--- Reward Recipients ---");
  for (let i = 0; i < rewards.rewardRecipients.length; i++) {
    const isYou = rewards.rewardAdmins[i].toLowerCase() === account.address.toLowerCase();
    console.log(`  [${i}]${isYou ? " (YOU)" : ""}`);
    console.log(`      Admin:     ${rewards.rewardAdmins[i]}`);
    console.log(`      Recipient: ${rewards.rewardRecipients[i]}`);
    console.log(`      BPS:       ${rewards.rewardBps[i]} (${(rewards.rewardBps[i] / 100).toFixed(1)}%)`);

    // Check claimable fees for this recipient
    const claimableWeth = await sdk.getFeesToClaim(rewards.rewardRecipients[i], EXTERNAL.WETH);
    const claimableToken = await sdk.getFeesToClaim(rewards.rewardRecipients[i], TOKEN);
    if (claimableWeth > 0n) console.log(`      Claimable WETH: ${formatEther(claimableWeth)}`);
    if (claimableToken > 0n) console.log(`      Claimable Token: ${formatEther(claimableToken)}`);
  }

  console.log("");
  console.log("NOTE: Reward BPS allocations are immutable after deployment.");
  console.log("      Admins can change recipients via: update-reward-recipient.ts");
  console.log("      Admins can transfer admin role via: update-reward-admin.ts");
}

main();
