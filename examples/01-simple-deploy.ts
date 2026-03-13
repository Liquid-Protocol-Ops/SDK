/**
 * 01 — Simple Deploy
 *
 * Deploy a token with just a name and symbol. All other parameters
 * use sensible defaults (1% buy fee, 3-tranche positions, MEV protection).
 *
 * Run: npx tsx examples/01-simple-deploy.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const rpc = process.env.RPC_URL ?? "https://base.drpc.org";

const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) });
const sdk = new LiquidSDK({ publicClient, walletClient });

async function main() {
  console.log("Deploying token...");

  const result = await sdk.deployToken({
    name: "My Token",
    symbol: "MTK",
    image: "https://example.com/logo.png",
  });

  console.log("Token address:", result.tokenAddress);
  console.log("Transaction:", result.txHash);
  console.log("Pool ID:", result.event.poolId);
  console.log("Hook:", result.event.poolHook);
}

main().catch(console.error);
