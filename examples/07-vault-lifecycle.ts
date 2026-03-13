/**
 * 07 — Vault Lifecycle
 *
 * Check vault lockup/vesting status and claim vested tokens.
 * Tokens vest linearly between lockupEndTime and vestingEndTime.
 *
 * Run: npx tsx examples/07-vault-lifecycle.ts
 */
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
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
  const vault = await sdk.getVaultAllocation(TOKEN_ADDRESS);
  const now = BigInt(Math.floor(Date.now() / 1000));

  console.log("Vault total:", formatUnits(vault.amountTotal, 18), "tokens");
  console.log("Already claimed:", formatUnits(vault.amountClaimed, 18), "tokens");
  console.log("Admin:", vault.admin);
  console.log("Lockup ends:", new Date(Number(vault.lockupEndTime) * 1000).toISOString());
  console.log("Vesting ends:", new Date(Number(vault.vestingEndTime) * 1000).toISOString());

  if (now < vault.lockupEndTime) {
    console.log("\nVault is still locked. Cannot claim yet.");
    return;
  }

  const claimable = await sdk.getVaultClaimable(TOKEN_ADDRESS);
  console.log("\nClaimable now:", formatUnits(claimable, 18), "tokens");

  if (claimable > 0n) {
    console.log("Claiming...");
    const txHash = await sdk.claimVault(TOKEN_ADDRESS);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Claimed in tx:", txHash);
  }
}

main().catch(console.error);
