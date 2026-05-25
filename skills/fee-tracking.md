# Skill: Track Fees, Burns, and Buyback Cycles on Liquid Protocol

You are an AI agent that tracks fee accrual, buyback cycles, and burn events for tokens deployed on Liquid Protocol. This skill teaches you how to read on-chain fee state per token, monitor LP locker accumulation, detect buyback transactions, and build a "proof-of-burn" feed — without a backend or indexer.

## What You Can Track

Every Liquid Protocol token has a deterministic on-chain fee path:

- 1% trading fee per swap, settled in the paired token (typically WETH or DIEM)
- Fees accrue inside the LP locker contract until claimed by the deployer
- The deployer's claim amount is split 80% creator / 15% deployer-defined burn / 5% LIQ buyback by the token's `LiquidityLocker` rules
- Buyback transactions are observable as ERC-20 transfers into the burn address (`0x000000000000000000000000000000000000dEaD`) for burns, or into the `LIQ` token contract for buybacks

All of this is queryable directly from Base mainnet — no backend, no API keys, no database required.

## Prerequisites

```bash
npm install liquid-sdk viem
```

You need:
- An **RPC endpoint** for Base mainnet (chain ID 8453)
- The **token address** you want to track (or a list of them)

## Setup

```typescript
import { createPublicClient, http, formatUnits, getAddress } from "viem";
import { base } from "viem/chains";
import { LiquidSDK } from "liquid-sdk";

const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
const sdk = new LiquidSDK({ publicClient });

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const LIQ_TOKEN = "0x09b8903aBf2ea0721E34427353988c2F43c6d64F";
```

## Core Tracking Methods

### 1. Read Pending Fees on a Token

Every Liquid Protocol token's `LiquidityLocker` exposes the unclaimed fee balance. Use the SDK convenience method to read it without manual ABI work.

```typescript
const tokenAddress = "0xBF0775cBCA2744549cD016DAb8D3b3403De58bBF"; // example: $LPAD

const pending = await sdk.getPendingFees(tokenAddress);

console.log(`Pending fees on ${tokenAddress}:`);
console.log(`  amount0 (token):  ${formatUnits(pending.amount0, 18)}`);
console.log(`  amount1 (paired): ${formatUnits(pending.amount1, 18)}`);
console.log(`  paired token:     ${pending.pairedToken}`);
```

The returned values are raw `bigint`s. `amount0` is the token side; `amount1` is the paired-token side (typically WETH or DIEM). Format with `formatUnits(value, decimals)` for display.

### 2. Detect Buyback Cycles

A buyback cycle is a sequence of transactions: `claim fees → swap to LIQ (or buy LPAD) → transfer to burn address`. The end state is a transfer event into `0x...dEaD` (for burns) or into a treasury wallet (for `LIQ` buybacks). Both are observable from `Transfer` events.

```typescript
// Fetch burn transfers for a token (last N blocks)
async function getBurnTransfers(
  tokenAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint = "latest" as any,
) {
  const logs = await publicClient.getLogs({
    address: tokenAddress,
    event: {
      type: "event",
      name: "Transfer",
      inputs: [
        { type: "address", indexed: true, name: "from" },
        { type: "address", indexed: true, name: "to" },
        { type: "uint256", indexed: false, name: "value" },
      ],
    },
    args: { to: BURN_ADDRESS },
    fromBlock,
    toBlock,
  });

  return logs.map((log) => ({
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    from: log.args.from!,
    amount: log.args.value!,
  }));
}

const burns = await getBurnTransfers(
  "0xBF0775cBCA2744549cD016DAb8D3b3403De58bBF",
  30_000_000n,
);

console.log(`Total burn transfers: ${burns.length}`);
let total = 0n;
for (const b of burns) {
  total += b.amount;
  console.log(`  ${b.txHash} — ${formatUnits(b.amount, 18)} burned at block ${b.blockNumber}`);
}
console.log(`Cumulative burned: ${formatUnits(total, 18)}`);
```

### 3. Detect LIQ Buybacks

A LIQ buyback is identified as a `Transfer` of `LIQ` tokens *into* a known buyback or treasury wallet, originating from a Uniswap V4 pool. Track by watching `Transfer` events on the `LIQ` token contract.

```typescript
async function getLiqBuybacks(
  treasuryAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint = "latest" as any,
) {
  const logs = await publicClient.getLogs({
    address: LIQ_TOKEN,
    event: {
      type: "event",
      name: "Transfer",
      inputs: [
        { type: "address", indexed: true, name: "from" },
        { type: "address", indexed: true, name: "to" },
        { type: "uint256", indexed: false, name: "value" },
      ],
    },
    args: { to: treasuryAddress },
    fromBlock,
    toBlock,
  });

  return logs.map((log) => ({
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    from: log.args.from!,
    amount: log.args.value!,
  }));
}
```

### 4. Build a Proof-of-Burn Feed (One Token)

Combine pending fees + recent burns + recent LIQ buybacks into a single feed an agent or dashboard can consume.

```typescript
async function getProofOfBurn(tokenAddress: `0x${string}`, treasuryAddress: `0x${string}`) {
  const fromBlock = (await publicClient.getBlockNumber()) - 100_000n; // last ~5 days on Base

  const [pending, burns, buybacks] = await Promise.all([
    sdk.getPendingFees(tokenAddress),
    getBurnTransfers(tokenAddress, fromBlock),
    getLiqBuybacks(treasuryAddress, fromBlock),
  ]);

  const totalBurned = burns.reduce((s, b) => s + b.amount, 0n);
  const totalBoughtBack = buybacks.reduce((s, b) => s + b.amount, 0n);

  return {
    tokenAddress,
    pendingFees: {
      amount0: pending.amount0.toString(),
      amount1: pending.amount1.toString(),
    },
    burns: {
      count: burns.length,
      total: totalBurned.toString(),
      txs: burns.map((b) => b.txHash),
    },
    liqBuybacks: {
      count: buybacks.length,
      total: totalBoughtBack.toString(),
      txs: buybacks.map((b) => b.txHash),
    },
    asOf: new Date().toISOString(),
  };
}

const feed = await getProofOfBurn(
  "0xBF0775cBCA2744549cD016DAb8D3b3403De58bBF", // token
  "0xYourTreasury...", // your buyback wallet
);

console.log(JSON.stringify(feed, null, 2));
```

### 5. Real-Time Watcher (New Burns)

Use `watchEvent` to stream new burns the moment they hit Base. Useful for bots that post notifications when a buyback cycle completes.

```typescript
const unwatch = publicClient.watchEvent({
  address: tokenAddress,
  event: {
    type: "event",
    name: "Transfer",
    inputs: [
      { type: "address", indexed: true, name: "from" },
      { type: "address", indexed: true, name: "to" },
      { type: "uint256", indexed: false, name: "value" },
    ],
  },
  args: { to: BURN_ADDRESS },
  onLogs: (logs) => {
    for (const log of logs) {
      console.log(
        `🔥 burn: ${formatUnits(log.args.value!, 18)} at ${log.transactionHash}`,
      );
    }
  },
});

// Stop watching: unwatch();
```

### 6. Aggregate Across Many Tokens

Index every Liquid Protocol token, then run `getPendingFees` per token to surface where un-claimed fees are sitting.

```typescript
const allTokens = await sdk.getTokens();

const heatmap: { tokenAddress: string; symbol: string; pending: bigint }[] = [];

for (const token of allTokens) {
  try {
    const p = await sdk.getPendingFees(token.tokenAddress);
    if (p.amount1 > 0n) {
      heatmap.push({
        tokenAddress: token.tokenAddress,
        symbol: token.tokenSymbol,
        pending: p.amount1,
      });
    }
  } catch {
    // Some tokens may not have pending fees readable — skip
  }
}

// Top 10 by pending paired-token balance
heatmap.sort((a, b) => (b.pending > a.pending ? 1 : -1));
console.log("Top tokens by un-claimed fees:");
heatmap.slice(0, 10).forEach((entry) => {
  console.log(`  ${entry.symbol} — ${formatUnits(entry.pending, 18)} pending`);
});
```

## Use Cases

1. **Dashboard "Proof of Burn"** — display cumulative burns + buybacks for any token, sourced from Base directly. No trust required.
2. **Buyback bot trigger** — agent polls `getPendingFees` on a schedule, calls the claim function, swaps, and burns when balance crosses a threshold.
3. **Ecosystem leaderboard** — rank tokens by % of supply burned, total LIQ bought back, or active fee accrual to surface the most active deployments.
4. **Alerting** — `watchEvent` for burn transfers, post a notification per cycle so holders see the contract working in real time.
5. **Compliance / accounting** — export structured fee + burn history per token for tax / treasury reporting.

## Error Handling

- **`getPendingFees` reverts**: token may not have a `LiquidityLocker` (very early deploys before the locker pattern). Wrap in try/catch and skip.
- **`getLogs` fromBlock too far back**: most public RPCs cap at 50–100k block range per request. Page through using a window loop.
- **Treasury address unknown**: for tokens you didn't deploy, the buyback target may not be on-chain. Fall back to tracking burns only and skip the buyback half.
- **Watch event silently drops**: `watchEvent` reconnects on RPC failures but can miss events during gaps. For exactly-once delivery, also poll `getLogs` over the last ~10 blocks every minute.

## Performance Tips

- Cache `getPendingFees` per token for ~30s — fees update only when swaps happen.
- Use `Promise.allSettled` for the heatmap loop so one bad token doesn't kill the batch.
- For real-time + reliability: combine `watchEvent` (latency) with a per-minute `getLogs` sweep (correctness).
- The `tokenAddress` is indexed in the `Transfer` event topics, so `getLogs` against a specific address is cheap. Cross-token sweeps are more expensive — paginate carefully.

## Related Skills

- **deploy-token.md** — deploy a new token with the same fee structure this skill tracks.
- **index-tokens.md** — discover every Liquid Protocol token (input for the heatmap loop).
- **bid-in-auction.md** — agent participation in launch auctions, complementary to fee tracking.

## Reference

- LiquidityLocker source: see `liquid-sdk` package for the locker ABI and helpers
- Burn address: `0x000000000000000000000000000000000000dEaD` (canonical EVM dead address)
- LIQ token: `0x09b8903aBf2ea0721E34427353988c2F43c6d64F` (Base mainnet)
- Live example dashboard: https://www.liquidpad.site (Proof-of-Burn section uses this exact pattern)
