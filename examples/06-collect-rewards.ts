/**
 * 06 — Collect Rewards
 *
 * LP rewards are distributed to reward recipients configured at deployment.
 * Check MEV lock status before collecting with unlock.
 *
 * Run: npx tsx examples/06-collect-rewards.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const rpc = process.env.RPC_URL ?? "https://base.drpc.org";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as `0x${string}`;

const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) });
const sdk = new LiquidSDK({ publicClient, walletClient });

async function main() {
  // Check reward configuration
  const rewards = await sdk.getTokenRewards(TOKEN_ADDRESS);
  console.log("Reward recipients:", rewards.rewardRecipients);
  console.log("Reward splits (bps):", rewards.rewardBps);

  // Check MEV lock
  const poolId = rewards.poolKey ? (rewards as any).poolKey.hooks : undefined;
  if (poolId) {
    const unlockTime = await sdk.getPoolUnlockTime(poolId);
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (now < unlockTime) {
      console.log("Pool locked until:", new Date(Number(unlockTime) * 1000).toISOString());
      console.log("Using collectRewardsWithoutUnlock...");
      const txHash = await sdk.collectRewardsWithoutUnlock(TOKEN_ADDRESS);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Rewards collected (without unlock):", txHash);
      return;
    }
  }

  // Full collect + unlock
  console.log("Collecting rewards with unlock...");
  const txHash = await sdk.collectRewards(TOKEN_ADDRESS);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Rewards collected:", txHash);
}

main().catch(console.error);
