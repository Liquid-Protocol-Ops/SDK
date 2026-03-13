/**
 * 03 — Deploy with Custom Fees
 *
 * Configure static or dynamic fee models for your pool.
 * Static fees are constant; dynamic fees adjust based on volatility.
 *
 * Run: npx tsx examples/03-deploy-custom-fees.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK, ADDRESSES, encodeStaticFeePoolData, encodeDynamicFeePoolData } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const rpc = process.env.RPC_URL ?? "https://base.drpc.org";

const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) });
const sdk = new LiquidSDK({ publicClient, walletClient });

async function main() {
  // Option A: Static fee — 2% buy fee, 0.5% sell fee
  console.log("Deploying with static fees...");
  const staticResult = await sdk.deployToken({
    name: "Static Fee Token",
    symbol: "SFEE",
    hook: ADDRESSES.HOOK_STATIC_FEE_V2,
    poolData: encodeStaticFeePoolData(50, 200), // 0.5% sell, 2% buy (in bps)
  });
  console.log("Static fee token:", staticResult.tokenAddress);

  // Option B: Dynamic fee — fees adjust based on trading volatility
  console.log("Deploying with dynamic fees...");
  const dynamicResult = await sdk.deployToken({
    name: "Dynamic Fee Token",
    symbol: "DFEE",
    hook: ADDRESSES.HOOK_DYNAMIC_FEE_V2,
    poolData: encodeDynamicFeePoolData({
      baseFeeBps: 100,                // 1% base fee
      maxFeeBps: 500,                 // 5% max fee
      referenceTickFilterPeriod: 300, // 5 min TWAP
      resetPeriod: 3600,              // 1 hour reset
      resetTickFilter: 100,
      feeControlNumerator: 100,
      decayFilterBps: 5000,           // 50% decay
    }),
  });
  console.log("Dynamic fee token:", dynamicResult.tokenAddress);
}

main().catch(console.error);
