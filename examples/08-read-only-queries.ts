/**
 * 08 — Read-Only Queries
 *
 * Query token info, pool state, and auction data without a wallet.
 * Only a publicClient is needed — no private key required.
 *
 * Run: npx tsx examples/08-read-only-queries.ts
 */
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-sdk";

const rpc = process.env.RPC_URL ?? "https://base.drpc.org";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as `0x${string}`;

const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
const sdk = new LiquidSDK({ publicClient }); // no wallet needed

async function main() {
  // Token info
  const info = await sdk.getTokenInfo(TOKEN_ADDRESS);
  console.log(`${info.name} (${info.symbol})`);
  console.log("Total supply:", formatUnits(info.totalSupply, info.decimals));
  console.log("Hook:", info.deployment.hook);
  console.log("Locker:", info.deployment.locker);
  console.log("Extensions:", info.deployment.extensions);

  // Reward config
  const rewards = await sdk.getTokenRewards(TOKEN_ADDRESS);
  console.log("\nReward recipients:", rewards.rewardRecipients);
  console.log("Reward splits (bps):", rewards.rewardBps);
  console.log("Num positions:", rewards.numPositions.toString());

  // Factory status
  const deprecated = await sdk.isFactoryDeprecated();
  console.log("\nFactory deprecated:", deprecated);

  console.log("\nDone — all queries completed without a wallet!");
}

main().catch(console.error);
