# Concept: Token Lifecycle

End-to-end lifecycle of a Liquid Protocol token, from deployment through trading, fee accrual, and reward distribution.

## Phase 1: Deployment

A single `sdk.deployToken()` call triggers an atomic on-chain transaction:

```
1. Factory deploys LiquidToken (ERC-20)
   - 100 billion supply, 18 decimals
   - ERC20 + Permit + Votes + Burnable + IERC7802
   - CREATE2 deterministic address from salt

2. Factory initializes Uniswap V4 pool
   - Paired with WETH
   - Starting tick determines initial market cap
   - Fee hook (static or dynamic) installed
   - Pool key: { WETH, token, 0x800000, 200, hook }

3. Factory locks LP permanently
   - Token supply (minus extensions) split into positions
   - Positions created in LP Locker
   - Reward recipients and BPS splits configured
   - Fee conversion preference set (default: all to ETH)

4. Factory activates MEV protection
   - Sniper Auction V2: 80% to 40% fee decay over 20s
   - Or MevDescendingFees: parabolic decay up to 2 min

5. Factory executes extensions (if any)
   - Vault: locks tokens with lockup + vesting
   - Airdrop: allocates tokens for merkle claims
   - Dev Buy: swaps ETH for tokens at launch
   - Presale: allocates tokens for pre-sale

6. Factory emits TokenCreated event
   - Contains all deployment metadata
   - Indexed by token address for fast lookup
```

**Result:** Token is live with a Uniswap V4 pool, locked LP, and MEV protection active.

## Phase 2: MEV Protection Window (~20 seconds)

Immediately after deployment, the MEV protection module is active:

```
Block N:     Token deployed
Block N+2:   First auction round (Sniper Auction)
Block N+4:   Second auction round
Block N+6:   Third auction round
Block N+8:   Fourth auction round
Block N+10:  Fifth and final auction round

Fee decay: 80% at t=0 -> 40% at t=20s (linear)
```

During this window:
- Swaps are taxed at 80-40% MEV fee ON TOP of the regular LP fee
- Only auction winners can swap (for Sniper Auction module)
- `collectRewards()` may revert with `ManagerLocked`
- Dev buy (if configured) executes at normal 1% fee, not auction fee

## Phase 3: Normal Trading

After the MEV protection window ends:
- Standard LP fees apply (default: 1% buy + 1% sell)
- Anyone can trade via Uniswap V4 Universal Router
- No auction mechanics -- first-come, first-served
- Pool operates as a standard Uniswap V4 concentrated liquidity pool

### Trade Flow

```
User submits swap via Universal Router
  |
  v
Uniswap V4 PoolManager routes to hook
  |
  v
Hook.beforeSwap():
  - Calculates LP fee (1% or dynamic)
  - Applies protocol fee (20% of LP fee)
  |
  v
PoolManager executes swap
  |
  v
Hook.afterSwap():
  - Collects protocol fee portion
```

## Phase 4: Fee Accrual

Fees accumulate in the LP positions held by the LP Locker:

```
Trading generates LP fees
  |-- 20% of LP fee -> Protocol (team fee recipient)
  |-- 80% of LP fee -> LP position (accrues in pool)
  |
  v
Fees sit in LP positions until collected
```

## Phase 5: Fee Collection and Distribution

Anyone can trigger fee collection:

```
sdk.collectRewards(tokenAddress)
  |
  v
LP Locker collects fees from all positions
  |
  v
Converts fees to preferred token (ETH by default)
  |
  v
Splits by reward BPS:
  - Recipient A: 70% -> FeeLocker.storeFees(A, WETH, amount)
  - Recipient B: 30% -> FeeLocker.storeFees(B, WETH, amount)
```

## Phase 6: Fee Claiming

Recipients withdraw their accumulated fees:

```
sdk.claimFees(ownerAddress, tokenAddress)
  |
  v
FeeLocker transfers WETH to ownerAddress
```

## Phase 7: Extension Lifecycle

### Vault Vesting

```
Deploy ------> Lockup ends ------> Vesting ends
                   |                     |
                   |-- Linear vesting ---|
                   |  claim() available  |
```

### Airdrop Claims

```
Deploy --> Merkle root set --> Lockup ends --> Vesting ends
                                  |                |
                                  |-- Claims open --|
                                  |                |
                               Admin can reclaim unclaimed after adminClaimTime
```

## Phase 8: Ongoing Operations

After initial setup, these operations continue indefinitely:

| Operation | Who | Frequency |
|-----------|-----|-----------|
| Trading | Anyone | Continuous |
| Fee collection | Anyone | Periodic (as needed) |
| Fee claiming | Reward recipients | When fees accumulate |
| Vault claiming | Vault admin | As tokens vest |
| Airdrop claiming | Recipients | After lockup ends |
| Metadata updates | Token admin | As needed |
| Recipient updates | Reward admins | As needed |

## Key Invariants

1. **LP is permanent** -- Locked liquidity can never be withdrawn
2. **Supply is fixed** -- 100B tokens, no minting after deploy
3. **BPS splits are immutable** -- Reward percentages cannot change
4. **Pool is standard Uniswap V4** -- Fully composable with V4 ecosystem
5. **Fees convert to ETH** -- Default behavior, configurable per recipient

## Contract Flow Diagram

```
                    Liquid.sol (Factory)
                         |
            +------------+-------------+
            |            |             |
      LiquidToken   Hook (V2)    LP Locker
       (ERC-20)     |        |      |
                    |        |      +-- FeeLocker
                    |        |             |
              MevModule   Pool        claimFees()
              (Auction)  Extension
```

## See Also

- [fee-system.md](fee-system.md) -- Detailed fee system
- [mev-protection.md](mev-protection.md) -- MEV protection details
- [lp-positions.md](lp-positions.md) -- LP position concepts
- [../sdk/deploy-token.md](../sdk/deploy-token.md) -- SDK deployment guide
