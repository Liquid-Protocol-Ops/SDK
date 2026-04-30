/**
 * test-swap.ts — Swap ETH for a Liquid Protocol token via Uniswap V4 Universal Router.
 *
 * Usage:
 *   TOKEN=0x... npx tsx test-swap.ts
 *
 * Optional env vars:
 *   RPC_URL       — Base RPC endpoint (default: https://mainnet.base.org)
 *   SWAP_ETH      — ETH amount to swap (default: "0.0001")
 *   TOKEN         — Token address to buy
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
  console.error("ERROR: Set TOKEN env var to the token address you want to buy.");
  console.error("Usage: TOKEN=0x... npx tsx test-swap.ts");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL ?? "https://mainnet.base.org";
const SWAP_ETH = process.env.SWAP_ETH ?? "0.0001";

// ── Constants ───────────────────────────────────────────────────────

// Universal Router command types
const COMMAND_WRAP_ETH = 0x0b;
const COMMAND_V4_SWAP = 0x10;

// V4 Router action types
const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SETTLE = 0x0b;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE_ALL = 0x0f;

// Special addresses used by Universal Router
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002" as Address;

const MAX_UINT256 = 2n ** 256n - 1n;

// Universal Router ABI (just the execute function)
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

// ERC20 balanceOf/symbol/decimals
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
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// ── Encoding helpers ────────────────────────────────────────────────

function buildPoolKey(token: Address) {
  const weth = EXTERNAL.WETH.toLowerCase();
  const tokenLower = token.toLowerCase();

  // currency0 must be the lower address
  const [c0, c1] =
    weth < tokenLower
      ? [EXTERNAL.WETH, token]
      : [token, EXTERNAL.WETH];

  return {
    currency0: c0,
    currency1: c1,
    fee: 0x800000, // dynamic fee flag (8388608)
    tickSpacing: DEFAULTS.TICK_SPACING,
    hooks: DEFAULTS.HOOK,
  };
}

function buildSwapCalldata(
  token: Address,
  amountIn: bigint
): { commands: Hex; inputs: Hex[]; value: bigint } {
  const poolKey = buildPoolKey(token);

  // zeroForOne = true if WETH is currency0 (selling WETH for token)
  const wethIsCurrency0 =
    EXTERNAL.WETH.toLowerCase() === poolKey.currency0.toLowerCase();
  const zeroForOne = wethIsCurrency0;

  // ── Command 1: WRAP_ETH ──
  // Wraps msg.value ETH → WETH, held by the router (ADDRESS_THIS)
  const wrapInput = encodeAbiParameters(
    [
      { type: "address", name: "recipient" },
      { type: "uint256", name: "amount" },
    ],
    [ADDRESS_THIS, amountIn]
  );

  // ── Command 2: V4_SWAP ──
  // Action 1: SWAP_EXACT_IN_SINGLE
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

  // Action 2: SETTLE — settle WETH from the router's balance (payerIsUser=false)
  // The router holds WETH from the WRAP_ETH command, so it pays the PoolManager directly
  const settleParams = encodeAbiParameters(
    [
      { type: "address", name: "currency" },
      { type: "uint256", name: "amount" },
      { type: "bool", name: "payerIsUser" },
    ],
    [EXTERNAL.WETH, amountIn, false]
  );

  // Action 3: TAKE_ALL — send output tokens to msg.sender
  const takeParams = encodeAbiParameters(
    [
      { type: "address", name: "currency" },
      { type: "uint256", name: "minAmount" },
    ],
    [token, 0n]
  );

  // Encode V4 actions
  const actions = concat([
    toHex(ACTION_SWAP_EXACT_IN_SINGLE, { size: 1 }),
    toHex(ACTION_SETTLE, { size: 1 }),
    toHex(ACTION_TAKE_ALL, { size: 1 }),
  ]);

  const v4SwapInput = encodeAbiParameters(
    [
      { type: "bytes", name: "actions" },
      { type: "bytes[]", name: "params" },
    ],
    [actions, [swapParams, settleParams, takeParams]]
  );

  // Two commands: WRAP_ETH (0x0b) + V4_SWAP (0x10)
  const commands = concat([
    toHex(COMMAND_WRAP_ETH, { size: 1 }),
    toHex(COMMAND_V4_SWAP, { size: 1 }),
  ]);

  return {
    commands,
    inputs: [wrapInput, v4SwapInput],
    value: amountIn,
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

  const amountIn = parseEther(SWAP_ETH);

  // Get token info
  const [symbol, decimals, balanceBefore, ethBalance] = await Promise.all([
    publicClient.readContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    publicClient.readContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    }),
    publicClient.getBalance({ address: account.address }),
  ]);

  console.log("=== Liquid Protocol V4 Swap Test ===");
  console.log("");
  console.log("Swapper:", account.address);
  console.log("ETH balance:", formatEther(ethBalance));
  console.log("Token:", TOKEN, `(${symbol})`);
  console.log("Token balance before:", formatEther(balanceBefore), symbol);
  console.log("Swap amount:", SWAP_ETH, "ETH →", symbol);
  console.log("");

  if (ethBalance < amountIn + parseEther("0.0005")) {
    console.error("ERROR: Not enough ETH for swap + gas.");
    process.exit(1);
  }

  // Build the Universal Router calldata
  const { commands, inputs, value } = buildSwapCalldata(TOKEN, amountIn);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  console.log("--- Swap Config ---");
  const poolKey = buildPoolKey(TOKEN);
  console.log("Pool: currency0 =", poolKey.currency0, "(WETH)");
  console.log("       currency1 =", poolKey.currency1, "(token)");
  console.log("       fee = dynamic");
  console.log("       tickSpacing =", poolKey.tickSpacing);
  console.log("       hooks =", poolKey.hooks);
  console.log("Direction:", EXTERNAL.WETH.toLowerCase() === poolKey.currency0.toLowerCase() ? "zeroForOne (ETH→Token)" : "oneForZero (ETH→Token)");
  console.log("Flow: WRAP_ETH → V4_SWAP (settle WETH, take token)");
  console.log("Router:", EXTERNAL.UNIVERSAL_ROUTER);
  console.log("");
  console.log("Sending swap tx...");
  console.log("");

  try {
    const txHash = await walletClient.sendTransaction({
      to: EXTERNAL.UNIVERSAL_ROUTER,
      data: encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [commands, inputs, deadline],
      }),
      value,
    });

    console.log("Tx sent:", txHash);
    console.log("Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    const balanceAfter = await publicClient.readContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    const tokensReceived = balanceAfter - balanceBefore;

    // Parse Transfer events to find tokens sent to the user
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const userTopic = ("0x000000000000000000000000" + account.address.slice(2)).toLowerCase();
    const tokenTransfers = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === TOKEN.toLowerCase() &&
        log.topics[0] === transferTopic &&
        log.topics[2]?.toLowerCase() === userTopic
    );
    const tokensFromLogs = tokenTransfers.reduce(
      (sum, log) => sum + BigInt(log.data),
      0n
    );

    if (receipt.status === "success") {
      console.log("");
      console.log("============================");
      console.log("  SWAP SUCCESS!");
      console.log("============================");
      console.log("");
      console.log("Spent:", SWAP_ETH, "ETH");
      console.log("Received:", formatEther(tokensFromLogs > 0n ? tokensFromLogs : tokensReceived), symbol);
      console.log("Balance after:", formatEther(balanceAfter), symbol);
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("");
      console.log("Tx:", `https://basescan.org/tx/${txHash}`);
    } else {
      console.error("");
      console.error("============================");
      console.error("  SWAP REVERTED");
      console.error("============================");
      console.error("Tx:", `https://basescan.org/tx/${txHash}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error("");
    console.error("============================");
    console.error("  SWAP FAILED");
    console.error("============================");
    console.error("");
    console.error("Error:", err.shortMessage ?? err.message ?? err);
    if (err.details) console.error("Details:", err.details);
    process.exit(1);
  }
}

main();
