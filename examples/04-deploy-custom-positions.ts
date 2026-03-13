/**
 * 04 — Deploy with Custom Positions (Market Cap Tranches)
 *
 * Configure how liquidity is distributed across market cap ranges.
 * More liquidity at lower caps = tighter spreads for early trading.
 *
 * Run: npx tsx examples/04-deploy-custom-positions.ts
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { LiquidSDK, createPositionsUSD, describePositions } from "liquid-sdk";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const rpc = process.env.RPC_URL ?? "https://base.drpc.org";

const publicClient = createPublicClient({ chain: base, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) });
const sdk = new LiquidSDK({ publicClient, walletClient });

async function main() {
  const ethPriceUSD = 2500; // current ETH price

  // 3 custom tranches: heavy liquidity at low caps, light at high caps
  const positions = createPositionsUSD(20_000, ethPriceUSD, [
    { marketCapUSD: 1_000_000, bps: 5000 },    // 50% up to $1M
    { marketCapUSD: 50_000_000, bps: 3000 },    // 30% up to $50M
    { marketCapUSD: 500_000_000, bps: 2000 },   // 20% up to $500M
  ]);

  // Preview the position layout
  const description = describePositions(positions, ethPriceUSD);
  console.log("Position layout:");
  for (const pos of description) {
    console.log(`  ${pos.supplyPct}% | $${pos.marketCapUSD?.low.toLocaleString()} → $${pos.marketCapUSD?.high.toLocaleString()}`);
  }

  console.log("\nDeploying...");
  const result = await sdk.deployToken({
    name: "Tranche Token",
    symbol: "TRN",
    tickIfToken0IsLiquid: positions.tickIfToken0IsLiquid,
    tickLower: positions.tickLower,
    tickUpper: positions.tickUpper,
    positionBps: positions.positionBps,
  });

  console.log("Token address:", result.tokenAddress);
}

main().catch(console.error);
