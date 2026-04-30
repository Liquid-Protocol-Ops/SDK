/**
 * claim-protocol-fees.ts — Claim protocol fees (team fees) from the Liquid Factory.
 *
 * Usage:
 *   npx tsx claim-protocol-fees.ts
 *
 * Claims accumulated WETH protocol fees from the factory to the teamFeeRecipient.
 * Must be called by the factory owner or admin.
 *
 * Optional env vars:
 *   RPC_URL       — Base RPC endpoint (default: https://mainnet.base.org)
 *   CLAIM_TOKEN   — Token to claim fees in (default: WETH)
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
import { ADDRESSES, EXTERNAL } from "./src";

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) {
  console.error("ERROR: No DEPLOYER_KEY found. Set it in .env or pass inline.");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const CLAIM_TOKEN = (process.env.CLAIM_TOKEN ?? EXTERNAL.WETH) as Address;

const factoryAbi = [
  {
    name: "teamFeeRecipient",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "claimTeamFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });

  const [teamFeeRecipient, owner, factoryBalance, tokenSymbol] = await Promise.all([
    publicClient.readContract({ address: ADDRESSES.FACTORY, abi: factoryAbi, functionName: "teamFeeRecipient" }),
    publicClient.readContract({ address: ADDRESSES.FACTORY, abi: factoryAbi, functionName: "owner" }),
    publicClient.readContract({ address: CLAIM_TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [ADDRESSES.FACTORY] }),
    publicClient.readContract({ address: CLAIM_TOKEN, abi: erc20Abi, functionName: "symbol" }),
  ]);

  console.log("=== Claim Protocol Fees ===");
  console.log("");
  console.log("Factory:", ADDRESSES.FACTORY);
  console.log("Owner:", owner);
  console.log("Caller:", account.address);
  console.log("Team fee recipient:", teamFeeRecipient);
  console.log("");
  console.log("Factory", tokenSymbol, "balance:", formatEther(factoryBalance));

  if (teamFeeRecipient === "0x0000000000000000000000000000000000000000") {
    console.error("");
    console.error("ERROR: teamFeeRecipient is not set.");
    console.error("Call setTeamFeeRecipient(address) on the factory from the owner.");
    process.exit(1);
  }

  if (factoryBalance === 0n) {
    console.log("");
    console.log("No fees to claim.");
    return;
  }

  console.log("");
  console.log("Claiming", formatEther(factoryBalance), tokenSymbol, "→", teamFeeRecipient);

  try {
    const txHash = await walletClient.writeContract({
      address: ADDRESSES.FACTORY,
      abi: factoryAbi,
      functionName: "claimTeamFees",
      args: [CLAIM_TOKEN],
      chain: base,
      account,
    });

    console.log("Tx sent:", txHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "success") {
      console.log("");
      console.log("============================");
      console.log("  CLAIM SUCCESS!");
      console.log("============================");
      console.log("");
      console.log("Claimed:", formatEther(factoryBalance), tokenSymbol);
      console.log("Sent to:", teamFeeRecipient);
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("Tx:", `https://basescan.org/tx/${txHash}`);
    } else {
      console.error("CLAIM REVERTED");
      console.error("Tx:", `https://basescan.org/tx/${txHash}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("CLAIM FAILED");
    console.error("Error:", err.shortMessage ?? err.message ?? err);
    if (err.details) console.error("Details:", err.details);
    process.exit(1);
  }
}

main();
