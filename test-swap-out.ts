/**
 * test-swap-out.ts — Sell tokens for ETH via Uniswap V4 Universal Router.
 *
 * Usage:
 *   TOKEN=0x... npx tsx test-swap-out.ts
 *
 * Optional env vars:
 *   RPC_URL         — Base RPC endpoint (default: https://mainnet.base.org)
 *   SELL_AMOUNT     — Token amount to sell (default: "1000", in whole tokens)
 *   TOKEN           — Token address to sell
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  encodeAbiParameters,
  encodeFunctionData,
  concat,
  toHex,
  maxUint256,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { ADDRESSES, EXTERNAL, DEFAULTS } from "./src";

// ── Config ──────────────────────────────────────────────────────────

const DEPLOYER_KEY = process.env.DEPLOYER_KEY;
if (!DEPLOYER_KEY) {
  console.error("ERROR: No DEPLOYER_KEY found. Set it in .env or pass inline.");
  process.exit(1);
}

const TOKEN = process.env.TOKEN as Address | undefined;
if (!TOKEN) {
  console.error("ERROR: Set TOKEN env var to the token address you want to sell.");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const SELL_AMOUNT = process.env.SELL_AMOUNT ?? "1000";

// ── Constants ───────────────────────────────────────────────────────

const COMMAND_V4_SWAP = 0x10;
const COMMAND_UNWRAP_WETH = 0x0c;

const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE_ALL = 0x0f;

// Special addresses
const MSG_SENDER = "0x0000000000000000000000000000000000000001" as Address;
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

const universalRouterAbi = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
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
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const permit2Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

// ── Encoding helpers ────────────────────────────────────────────────

function buildPoolKey(token: Address) {
  const weth = EXTERNAL.WETH.toLowerCase();
  const tokenLower = token.toLowerCase();
  const [c0, c1] =
    weth < tokenLower ? [EXTERNAL.WETH, token] : [token, EXTERNAL.WETH];

  return {
    currency0: c0,
    currency1: c1,
    fee: 0x800000,
    tickSpacing: DEFAULTS.TICK_SPACING,
    hooks: DEFAULTS.HOOK,
  };
}

function buildSellCalldata(
  token: Address,
  amountIn: bigint
): { commands: Hex; inputs: Hex[] } {
  const poolKey = buildPoolKey(token);

  // Selling token for WETH: zeroForOne depends on which side the token is
  const wethIsCurrency0 =
    EXTERNAL.WETH.toLowerCase() === poolKey.currency0.toLowerCase();
  // If WETH is currency0, we're selling currency1 (token) → want zeroForOne=false
  // If WETH is currency1, we're selling currency0 (token) → want zeroForOne=true
  const zeroForOne = !wethIsCurrency0;

  // Action 1: SWAP_EXACT_IN_SINGLE — sell token for WETH
  const swapParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            type: "tuple",
            name: "poolKey",
            components: [
              { type: "address", name: "currency0" },
              { type: "address", name: "currency1" },
              { type: "uint24", name: "fee" },
              { type: "int24", name: "tickSpacing" },
              { type: "address", name: "hooks" },
            ],
          },
          { type: "bool", name: "zeroForOne" },
          { type: "uint128", name: "amountIn" },
          { type: "uint128", name: "amountOutMinimum" },
          { type: "bytes", name: "hookData" },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        zeroForOne,
        amountIn,
        amountOutMinimum: 0n,
        hookData: "0x",
      },
    ]
  );

  // Action 2: SETTLE_ALL — settle tokens (user pays via Permit2)
  const settleParams = encodeAbiParameters(
    [
      { type: "address", name: "currency" },
      { type: "uint256", name: "maxAmount" },
    ],
    [token, maxUint256]
  );

  // Action 3: TAKE_ALL — take WETH to the router (for unwrapping)
  const takeParams = encodeAbiParameters(
    [
      { type: "address", name: "currency" },
      { type: "uint256", name: "minAmount" },
    ],
    [EXTERNAL.WETH, 0n]
  );

  const actions = concat([
    toHex(ACTION_SWAP_EXACT_IN_SINGLE, { size: 1 }),
    toHex(ACTION_SETTLE_ALL, { size: 1 }),
    toHex(ACTION_TAKE_ALL, { size: 1 }),
  ]);

  const v4SwapInput = encodeAbiParameters(
    [
      { type: "bytes", name: "actions" },
      { type: "bytes[]", name: "params" },
    ],
    [actions, [swapParams, settleParams, takeParams]]
  );

  // Command 1: V4_SWAP, Command 2: UNWRAP_WETH (send ETH to msg.sender)
  const unwrapInput = encodeAbiParameters(
    [
      { type: "address", name: "recipient" },
      { type: "uint256", name: "amountMin" },
    ],
    [MSG_SENDER, 0n]
  );

  const commands = concat([
    toHex(COMMAND_V4_SWAP, { size: 1 }),
    toHex(COMMAND_UNWRAP_WETH, { size: 1 }),
  ]);

  return {
    commands,
    inputs: [v4SwapInput, unwrapInput],
  };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(RPC_URL),
    account,
  });

  const amountIn = parseEther(SELL_AMOUNT);

  const [symbol, balanceBefore, ethBalanceBefore] = await Promise.all([
    publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "symbol" }),
    publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    publicClient.getBalance({ address: account.address }),
  ]);

  console.log("=== Liquid Protocol V4 Sell Test ===");
  console.log("");
  console.log("Seller:", account.address);
  console.log("Token:", TOKEN, `(${symbol})`);
  console.log("Token balance:", formatEther(balanceBefore as bigint), symbol as string);
  console.log("ETH balance:", formatEther(ethBalanceBefore));
  console.log("Selling:", SELL_AMOUNT, symbol as string, "→ ETH");
  console.log("");

  if ((balanceBefore as bigint) < amountIn) {
    console.error("ERROR: Not enough tokens. You have", formatEther(balanceBefore as bigint), symbol as string);
    process.exit(1);
  }

  // Step 1: Approve token → Permit2 (if needed)
  const tokenAllowance = await publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, EXTERNAL.PERMIT2],
  });

  if ((tokenAllowance as bigint) < amountIn) {
    console.log("Approving token → Permit2...");
    const approveTx = await walletClient.writeContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [EXTERNAL.PERMIT2, maxUint256],
      chain: base,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log("Approved:", approveTx);
  }

  // Step 2: Approve Permit2 → Universal Router (if needed)
  const [permit2Amount] = await publicClient.readContract({
    address: EXTERNAL.PERMIT2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [account.address, TOKEN, EXTERNAL.UNIVERSAL_ROUTER],
  }) as [bigint, number, number];

  if (permit2Amount < amountIn) {
    console.log("Approving Permit2 → Universal Router...");
    const maxUint160 = 2n ** 160n - 1n;
    const farFuture = 2n ** 48n - 1n;
    const permit2Tx = await walletClient.writeContract({
      address: EXTERNAL.PERMIT2,
      abi: permit2Abi,
      functionName: "approve",
      args: [TOKEN, EXTERNAL.UNIVERSAL_ROUTER, maxUint160, Number(farFuture)],
      chain: base,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: permit2Tx });
    console.log("Approved:", permit2Tx);
  }

  // Step 3: Execute swap
  const { commands, inputs } = buildSellCalldata(TOKEN, amountIn);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  console.log("");
  console.log("Sending sell tx...");

  try {
    const txHash = await walletClient.sendTransaction({
      to: EXTERNAL.UNIVERSAL_ROUTER,
      data: encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [commands, inputs, deadline],
      }),
    });

    console.log("Tx sent:", txHash);
    console.log("Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    const [balanceAfter, ethBalanceAfter] = await Promise.all([
      publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
      publicClient.getBalance({ address: account.address }),
    ]);

    if (receipt.status === "success") {
      // Parse WETH Transfer events to find ETH received (before unwrap)
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const routerTopic = ("0x000000000000000000000000" + EXTERNAL.UNIVERSAL_ROUTER.slice(2)).toLowerCase();
      const wethTransfers = receipt.logs.filter(
        (log) =>
          log.address.toLowerCase() === EXTERNAL.WETH.toLowerCase() &&
          log.topics[0] === transferTopic &&
          log.topics[2]?.toLowerCase() === routerTopic
      );
      const wethReceived = wethTransfers.reduce(
        (sum, log) => sum + BigInt(log.data),
        0n
      );

      const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;
      console.log("");
      console.log("============================");
      console.log("  SELL SUCCESS!");
      console.log("============================");
      console.log("");
      console.log("Sold:", SELL_AMOUNT, symbol as string);
      console.log("Received:", formatEther(wethReceived), "ETH");
      console.log("Gas cost:", formatEther(gasUsed), "ETH");
      console.log("Token balance after:", formatEther(balanceAfter as bigint), symbol as string);
      console.log("ETH balance after:", formatEther(ethBalanceAfter));
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("");
      console.log("Tx:", `https://basescan.org/tx/${txHash}`);
    } else {
      console.error("  SELL REVERTED");
      console.error("Tx:", `https://basescan.org/tx/${txHash}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("  SELL FAILED");
    console.error("Error:", err.shortMessage ?? err.message ?? err);
    if (err.details) console.error("Details:", err.details);
    process.exit(1);
  }
}

main();
