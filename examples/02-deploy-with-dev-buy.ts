/**
 * 02 — Deploy with Dev Buy
 *
 * Deploy a token and buy tokens with ETH in the same transaction.
 * The dev buy happens atomically — no front-running possible.
 *
 * Run: npx tsx examples/02-deploy-with-dev-buy.ts
 */
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const rpc = process.env.RPC_URL ?? "https://base.drpc.org";

const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) });
const sdk = new LiquidSDK({ publicClient, walletClient });

async function main() {
  console.log("Deploying token with dev buy...");

  const result = await sdk.deployToken({
    name: "Dev Buy Token",
    symbol: "DBUY",
    devBuy: {
      ethAmount: parseEther("0.01"), // spend 0.01 ETH buying tokens at launch
      recipient: account.address,     // tokens go to deployer
    },
  });

  console.log("Token address:", result.tokenAddress);
  console.log("Transaction:", result.txHash);
  console.log("Pool ID:", result.event.poolId);
}

main().catch(console.error);
