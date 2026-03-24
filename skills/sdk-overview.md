# Skill: Liquid SDK Overview

You are an AI agent working with the `liquid-sdk` package. This file gives you a complete picture of what the SDK can do, the data schemas it uses, and how all the pieces fit together. Load a specific skill file (`deploy-token.md`, `bid-in-auction.md`, `index-tokens.md`) when you need step-by-step instructions for a task.

## What Liquid Protocol Does

Liquid Protocol deploys ERC-20 tokens on Base (chain ID 8453) with:
- **Uniswap V4 pools** created and funded automatically
- **Permanently locked LP** — liquidity cannot be rugged
- **Configurable fee splits** — reward recipients earn LP fees in ETH
- **MEV protection** — sniper auction prices early trading activity
- **Extensions** — dev buy, vault lockup/vesting, merkle airdrops

Every token gets 100 billion supply (18 decimals), a Uniswap V4 pool paired with WETH, and locked liquidity.

## Install

```bash
npm install liquid-sdk viem
```

## SDK Capabilities at a Glance

| Category | What you can do |
|----------|----------------|
| **Deploy** | Launch tokens with custom fees, positions, reward splits, dev buys |
| **Snipe** | Bid in MEV auctions for early access to new tokens |
| **Index** | Discover all tokens, query by deployer, paginate by block range |
| **Fees** | Check and claim accumulated LP fees (converted to ETH) |
| **Rewards** | Collect LP rewards, update reward recipients |
| **Vault** | Check vesting schedules, claim unlocked tokens |
| **Airdrop** | Check allocations, claim with merkle proofs |
| **Pool reads** | Fee config, fee state, creation time, token sort order |
| **MEV reads** | Auction state, fee decay, gas peg, block delay |
| **Metadata** | Update token image and metadata on-chain (admin only) |

## Data Schemas

### Token Identity (set at deployment)

These fields define how the token appears in wallets, aggregators, and explorers:

```typescript
const result = await sdk.deployToken({
  name: "My Project Token",                    // Token name (required)
  symbol: "MPT",                               // Token symbol (required)
  image: "ipfs://QmYourImageCID",              // IPFS URI (recommended) or HTTPS URL
  metadata: buildMetadata({                    // Rich metadata (JSON, on-chain)
    description: "A community token for builders on Base",
    socialMediaUrls: [
      { platform: "Website", url: "https://myproject.xyz" },
      { platform: "Twitter", url: "https://x.com/myproject" },
      { platform: "Discord", url: "https://discord.gg/myproject" },
      { platform: "Telegram", url: "https://t.me/myproject" },
      { platform: "GitHub", url: "https://github.com/myproject" },
    ],
    auditUrls: [
      "https://audits.example.com/myproject-audit.pdf",
    ],
  }),
  context: buildContext({                      // Deployment provenance
    interface: "My App",
    platform: "Farcaster",
  }),
});
```

**After deployment, you can update image and metadata (admin only):**
```typescript
await sdk.updateImage(tokenAddress, "https://new-logo.example.com/v2.png");
await sdk.updateMetadata(tokenAddress, buildMetadata({
  description: "Updated description",
  socialMediaUrls: [
    { platform: "Website", url: "https://myproject.xyz" },
    { platform: "Twitter", url: "https://x.com/myproject_new" },
  ],
}));
```

### Image Upload (IPFS)

Token images should be pinned to IPFS for permanence. The `image` field in `deployToken()` accepts any string — use an `ipfs://` URI for permanent storage.

**Pin with your own Pinata key:**

```typescript
// 1. Pin image to IPFS via Pinata (your own API key)
const form = new FormData();
form.append("file", imageFile); // PNG, JPEG, WEBP, or GIF

const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
  method: "POST",
  headers: { "Authorization": "Bearer YOUR_PINATA_JWT" },
  body: form,
});
const { IpfsHash } = await res.json();
const ipfsUri = `ipfs://${IpfsHash}`;

// 2. Deploy with IPFS image
await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  image: ipfsUri, // stored on-chain permanently
});
```

Get a Pinata JWT at https://app.pinata.cloud/developers/api-keys (free tier: 500MB).

**Recommended:** 256x256 or 512x512 PNG, square. This is the standard size for DexScreener, wallet apps, and token lists.

**Accepted formats:** PNG, JPEG, WEBP, GIF.

You can also use any `https://` URL — the `image` field accepts any string. But IPFS URIs are preferred because they're permanent and decentralized.

---

### Token Metadata Schema

Stored in the `tokenMetadata` field of the `TokenCreated` event. Wallets (Rainbow, Coinbase Wallet) and aggregators (Matcha, 0x) read this.

```typescript
import { buildMetadata, parseMetadata } from "liquid-sdk";

// Build
const metadata = buildMetadata({
  description: "A community token for builders on Base",
  socialMediaUrls: [
    { platform: "Twitter", url: "https://x.com/myproject" },
    { platform: "Discord", url: "https://discord.gg/myproject" },
    { platform: "Telegram", url: "https://t.me/myproject" },
    { platform: "Website", url: "https://myproject.xyz" },
  ],
  auditUrls: [
    "https://audits.example.com/myproject-audit.pdf",
  ],
});

// Parse (from on-chain event data)
const parsed = parseMetadata(tokenEvent.tokenMetadata);
// parsed.description     — string
// parsed.socialMediaUrls — { platform: string, url: string }[]
// parsed.auditUrls       — string[]
```

**Schema:**
```typescript
interface LiquidMetadata {
  description?: string;              // Token/project description
  socialMediaUrls?: SocialMediaUrl[];// Links shown by wallets & aggregators
  auditUrls?: string[];              // Audit report URLs
}

interface SocialMediaUrl {
  platform: string;  // "Website", "Twitter", "Discord", "Telegram", "GitHub", etc.
  url: string;       // Full URL
}
```

**Common platform values:** `"Website"`, `"Twitter"`, `"Discord"`, `"Telegram"`, `"GitHub"`, `"Farcaster"`, `"Instagram"`, `"YouTube"`

### Token Context (deployment provenance)

Stored in the `tokenContext` field. Tracks where/how the token was launched.

```typescript
import { buildContext, parseContext } from "liquid-sdk";

// Build
const context = buildContext({
  interface: "My Agent",        // what system deployed it
  platform: "Farcaster",        // social platform (optional)
  messageId: "0xabc123",        // cast/post ID (optional)
  id: "user-12345",             // user ID on platform (optional)
});

// Parse
const parsed = parseContext(tokenEvent.tokenContext);
// parsed.interface  — "My Agent"
// parsed.platform   — "Farcaster"
// parsed.messageId  — "0xabc123"
```

**Schema:**
```typescript
interface LiquidContext {
  interface: string;    // Required. System that deployed ("SDK", "Rainbow Wallet", etc.)
  platform?: string;    // Social platform origin
  messageId?: string;   // Social post/message ID
  id?: string;          // User ID on platform
}
```

### Reward Configuration

Set at deployment. Controls who receives LP fees and in what proportion.

```typescript
// Deploy with custom reward splits
const result = await sdk.deployToken({
  name: "Split Token",
  symbol: "SPLIT",
  rewardAdmins: [walletA, walletB, treasury],
  rewardRecipients: [walletA, walletB, treasury],
  rewardBps: [5000, 3000, 2000],  // 50% / 30% / 20%
});

// Read reward config for any token
const rewards = await sdk.getTokenRewards(tokenAddress);
rewards.rewardRecipients  // Address[] — who gets paid
rewards.rewardBps         // number[]  — basis points per recipient (sum = 10000)
rewards.rewardAdmins      // Address[] — who can update each recipient
rewards.poolKey           // PoolKey   — the Uniswap V4 pool
rewards.positionId        // bigint    — LP position NFT ID
rewards.numPositions      // bigint    — number of LP positions

// Update a recipient (only the admin at that index can do this)
await sdk.updateRewardRecipient(tokenAddress, 0n, newWalletAddress);

// Collect rewards (distributes to all recipients per their bps)
await sdk.collectRewards(tokenAddress);
```

**Rules:**
- `rewardRecipients`, `rewardAdmins`, and `rewardBps` arrays must be the same length
- `rewardBps` must sum to 10000 (100%)
- BPS splits are **immutable** after deployment — only recipient addresses can change
- Each admin can only update the recipient at their own index
- All fees are converted to ETH before distribution (default `FeePreference.Paired`)

### Dev Buy (buy tokens at launch)

Buys tokens with ETH in the same transaction as deployment. The ETH is swapped through the Uniswap V4 pool atomically.

```typescript
const result = await sdk.deployToken({
  name: "My Token",
  symbol: "MTK",
  devBuy: {
    ethAmount: parseEther("0.01"),  // ETH to spend buying tokens
    recipient: account.address,      // who receives the purchased tokens
  },
});
```

**Schema:**
```typescript
interface DevBuyParams {
  ethAmount: bigint;    // ETH to swap for tokens (sent as msg.value)
  recipient: Address;   // Address that receives the purchased tokens
}
```

### Vault (token lockup + vesting)

Lock tokens with a lockup period followed by linear vesting.

```typescript
// Read vault state
const vault = await sdk.getVaultAllocation(tokenAddress);
vault.amountTotal     // bigint — total tokens locked
vault.amountClaimed   // bigint — already claimed
vault.lockupEndTime   // bigint — unix timestamp when lockup ends
vault.vestingEndTime  // bigint — unix timestamp when fully vested
vault.admin           // Address — who can claim
vault.token           // Address — the token

// Check claimable now
const claimable = await sdk.getVaultClaimable(tokenAddress);

// Claim
if (claimable > 0n) {
  await sdk.claimVault(tokenAddress);
}
```

### Airdrop (merkle distribution)

Distribute tokens to a list of recipients via merkle proof claims.

```typescript
// Read airdrop state
const info = await sdk.getAirdropInfo(tokenAddress);
info.merkleRoot     // Hex — merkle root
info.totalSupply    // bigint — total airdrop supply
info.totalClaimed   // bigint — already claimed
info.lockupEndTime  // bigint — when claims begin
info.vestingEndTime // bigint — when vesting completes
info.admin          // Address — airdrop admin

// Check claimable for a recipient
const claimable = await sdk.getAirdropClaimable(tokenAddress, recipientAddress, allocatedAmount);

// Claim (proof must be generated off-chain from the merkle tree)
await sdk.claimAirdrop(tokenAddress, recipientAddress, allocatedAmount, merkleProof);
```

### Fee Claims

LP fees accrue from trading activity. The LP Locker Fee Conversion contract converts all fees to ETH before distributing.

```typescript
// Check fees
const available = await sdk.getAvailableFees(ownerAddress, tokenAddress);  // total unlocked
const claimable = await sdk.getFeesToClaim(ownerAddress, tokenAddress);    // ready to claim

// Claim
if (claimable > 0n) {
  await sdk.claimFees(ownerAddress, tokenAddress);
}
```

### Token Metadata Updates (post-deploy)

Only the token admin can update image and metadata after deployment.

```typescript
// Update image
await sdk.updateImage(tokenAddress, "ipfs://QmNewImageCID...");

// Update metadata
await sdk.updateMetadata(tokenAddress, buildMetadata({
  description: "Updated description",
  socialMediaUrls: [
    { platform: "Twitter", url: "https://twitter.com/updated" },
  ],
}));
```

## Default Configuration

| Parameter | Default | Notes |
|-----------|---------|-------|
| Fee | 1% buy + 1% sell | Static, hook-controlled via `0x800000` flag |
| Fee conversion | All → ETH | `FeePreference.Paired` per recipient |
| Positions | 5-position Liquid layout | 10%/50%/15%/20%/5% from ~$20K to ~$1.2B |
| MEV module | Sniper Auction V2 | 80%→40% over 20s, 5 rounds, 2-block interval |
| Tick spacing | 200 | |
| Starting tick | -230400 | ~10 ETH / ~$20K market cap |
| Token supply | 100 billion (18 decimals) | Fixed for all tokens |
| Reward split | 100% to deployer | Customizable at deploy |
| Context | `{"interface":"SDK"}` | Auto-set, customizable |

## Skill Files

For step-by-step instructions, load the relevant skill:

| Task | Skill file |
|------|-----------|
| Deploy a token | `skills/deploy-token.md` |
| Bid in a sniper auction | `skills/bid-in-auction.md` |
| Index/discover tokens | `skills/index-tokens.md` |

## Exported Constants

```typescript
import { ADDRESSES, EXTERNAL, FEE, TOKEN, DEFAULTS, POOL_POSITIONS } from "liquid-sdk";

// Key addresses
ADDRESSES.FACTORY                    // Token factory
ADDRESSES.HOOK_STATIC_FEE_V2        // Default hook (1% both ways)
ADDRESSES.LP_LOCKER_FEE_CONVERSION  // Default locker (fees → ETH)
ADDRESSES.SNIPER_AUCTION_V2         // Default MEV module

// Fee constants
FEE.DENOMINATOR    // 1,000,000
FEE.BPS            // 10,000
TOKEN.SUPPLY       // 100B * 10^18
TOKEN.DECIMALS     // 18
```
