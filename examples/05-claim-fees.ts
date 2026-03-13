/**
 * 05 — Claim Fees
 *
 * Check and claim LP fees that have accrued from trading.
 * Fees are collected in the paired asset (usually WETH).
 *
 * Run: npx tsx examples/05-claim-fees.ts
 */
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
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
  // Check available and claimable fees
  const available = await sdk.getAvailableFees(account.address, TOKEN_ADDRESS);
  const claimable = await sdk.getFeesToClaim(account.address, TOKEN_ADDRESS);

  console.log("Available fees:", formatEther(available), "ETH");
  console.log("Claimable fees:", formatEther(claimable), "ETH");

  if (claimable > 0n) {
    console.log("Claiming fees...");
    const txHash = await sdk.claimFees(account.address, TOKEN_ADDRESS);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Claimed in tx:", receipt.transactionHash);
  } else {
    console.log("No fees to claim yet.");
  }
}

main().catch(console.error);
