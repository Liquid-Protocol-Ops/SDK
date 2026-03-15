# Deploying a Token with the Liquid Protocol SDK

Step-by-step guide. No prior knowledge required.

## Prerequisites

- **Node.js** 18+ installed (`node -v` to check)
- **A wallet** with at least 0.005 ETH on **Base mainnet**
- **The wallet's private key** (starts with `0x`)

---

## Step 1: Clone the SDK

```bash
git clone https://github.com/Liquid-Protocol-Ops/SDK.git liquid-sdk
cd liquid-sdk
```

If the repo is private, use a PAT:
```bash
git clone https://<YOUR_GITHUB_USERNAME>:<YOUR_PAT>@github.com/Liquid-Protocol-Ops/SDK.git liquid-sdk
cd liquid-sdk
```

---

## Step 2: Install dependencies

```bash
npm install
```

This installs `viem` and dev tools. Takes ~30 seconds.

---

## Step 3: Run the unit tests (optional, sanity check)

```bash
npm run test:unit
```

You should see `124 passed`. If anything fails, your Node version might be too old.

---

## Step 4: Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and paste your private key:

```
DEPLOYER_KEY=0xYOUR_PRIVATE_KEY_HERE
```

**Never commit this file.** It's already in `.gitignore`.

---

## Step 5: Deploy a test token

```bash
npx tsx test-deploy.ts
```

That's it. One command. The script will:
1. Load your key from `.env`
2. Check your wallet balance (fails if < 0.001 ETH)
3. Print every contract address and default setting being used
4. Deploy a token called "Liquid Test Token" (LIQTEST)
5. Print the token address, tx hash, pool ID, and Basescan links

**Custom name/symbol** (add to `.env` or pass inline):
```bash
TOKEN_NAME="My Cool Token" TOKEN_SYMBOL="COOL" npx tsx test-deploy.ts
```

**Custom RPC (if the public one is slow):**
```bash
RPC_URL=https://your-alchemy-or-quicknode-url npx tsx test-deploy.ts
```

---

## Step 6: Verify it worked

The script prints a Basescan link. Click it. You should see:
- The token contract at the printed address
- 100,000,000,000 total supply
- The deploy transaction

To check the pool, copy the Pool ID from the output and search it on [Uniswap V4 Base](https://app.uniswap.org).

---

## What the defaults do

| Setting | Value | What it means |
|---------|-------|---------------|
| Starting MC | ~$15,000 | Token launches at ~7.5 ETH market cap |
| Positions | 5 (Project layout) | Liquidity concentrated across 5 ranges from $15K to $1.2B |
| Fee type | Dynamic | 0.5% base fee, up to 5% during volatility |
| Fee currency | WETH only | All LP fees convert to WETH before distributing |
| MEV protection | Descending fees | 80% fee at launch, decays to 5% over 30 seconds |
| Rewards | 100% to deployer | You get all the LP fees |
| Locker | Fee Conversion | LP is permanently locked, fees auto-convert to WETH |

### Position Breakdown (5-Position "Project" Layout)

| Position | Supply % | Market Cap Range |
|----------|----------|-----------------|
| P1 | 10% | $15K → $83K |
| P2 | 50% | $83K → $37M |
| P3 | 15% | $337K → $37M |
| P4 | 20% | $37M → $1.2B |
| P5 | 5% | $150M → $1.2B |

### Fee Flow

```
Trade happens on Uniswap V4
  → Hook calculates dynamic fee (0.5% - 5%)
  → 20% of fee goes to protocol
  → 80% accrues to LP position
  → LP Locker collects fees
  → Converts ALL fees to WETH (FeeIn.Paired)
  → Routes to FeeLocker by reward BPS split
  → Recipients call claimFees() to withdraw WETH
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `ERROR: No DEPLOYER_KEY found` | Create a `.env` file: `cp .env.example .env` and add your key |
| `ERROR: Deployer has < 0.001 ETH` | Send Base ETH to the address printed |
| `Deprecated()` | Factory is paused. Contact the team. |
| `replacement transaction underpriced` | A previous tx is pending. Wait 30 seconds and retry. |
| Transaction reverts with no error | Your wallet might not have enough ETH for gas. Fund it with 0.01 ETH. |
| `MODULE_NOT_FOUND` | Run `npm install` first |
| `tsx: command not found` | Use `npx tsx` not just `tsx` |

---

## Writing your own deploy script

If you want to integrate into your own code instead of using `test-deploy.ts`:

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { LiquidSDK } from "./src";

const account = privateKeyToAccount("0xYOUR_KEY");
const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ account, chain: base, transport: http() });

const sdk = new LiquidSDK({ publicClient, walletClient });

const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
});

console.log("Token:", result.tokenAddress);
```

Three lines to set up. One line to deploy. Done.

---

## Customizing the deploy

Override any default by passing it to `deployToken()`:

```typescript
import { ADDRESSES, EXTERNAL } from "./src";

const result = await sdk.deployToken({
  name: "Custom Token",
  symbol: "CTK",

  // Custom reward split (70/30)
  rewardAdmins: [myWallet, partnerWallet],
  rewardRecipients: [myWallet, partnerWallet],
  rewardBps: [7000, 3000],

  // Buy tokens at launch with 0.01 ETH
  devBuy: {
    ethAmount: parseEther("0.01"),
    recipient: myWallet,
  },
});
```

See `README.md` and `AGENT_README.md` for the full API reference.
