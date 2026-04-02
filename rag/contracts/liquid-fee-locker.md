# LiquidFeeLocker

The Fee Locker is an escrow contract that stores accumulated LP fees and allows fee owners to claim them. It acts as the central fee distribution point in the Liquid Protocol.

## Contract Details

- **Address:** `0xF7d3BE3FC0de76fA5550C29A8F6fa53667B876FF`
- **SDK Constant:** `ADDRESSES.FEE_LOCKER`
- **Inherits:** `ILiquidFeeLocker`, `ReentrancyGuard`, `Ownable`
- **Owner:** Gnosis Safe

## How It Works

1. **Allowlisted depositors** (LP Locker, Sniper Auction) call `storeFees()` to deposit tokens for a specific fee owner
2. **Fees accumulate** in a `mapping(feeOwner => mapping(token => balance))` ledger
3. **Anyone can call `claim()`** on behalf of a fee owner to transfer their accumulated balance

The Fee Locker uses balance deltas (checking `balanceOf` before and after transfer) to support fee-on-transfer tokens.

## Key Functions

### `storeFees(address feeOwner, address token, uint256 amount)`

Deposits fees for a specific owner. Only callable by allowlisted depositors.

- Transfers `amount` of `token` from `msg.sender` to the Fee Locker
- Uses `SafeERC20.safeTransferFrom` for safe transfer
- Records the actual received amount (supports fee-on-transfer tokens)
- Emits `StoreTokens(depositor, feeOwner, token, newBalance, amount)`

### `claim(address feeOwner, address token)`

Claims all accumulated fees for a fee owner. Callable by anyone (permissionless).

- Reads the full balance for `(feeOwner, token)`
- Sets the balance to 0
- Transfers the full amount to `feeOwner`
- Reverts with `NoFeesToClaim` if balance is 0
- Emits `ClaimTokens(feeOwner, token, amount)`

### `availableFees(address feeOwner, address token) -> uint256`

Read-only. Returns the current claimable balance for a fee owner and token.

### `addDepositor(address depositor)`

Owner-only. Adds an address to the allowlist of approved depositors.

## SDK Methods

```typescript
// Check total unlocked fees
const available = await sdk.getAvailableFees(ownerAddress, tokenAddress);

// Check claimable fees (same as available for Fee Locker)
const claimable = await sdk.getFeesToClaim(ownerAddress, tokenAddress);

// Claim all fees
if (claimable > 0n) {
  const txHash = await sdk.claimFees(ownerAddress, tokenAddress);
}
```

## Fee Flow

```
Trading Activity (Uniswap V4 pool)
  |
  v
Hook calculates LP fee (e.g., 1%)
  |-- 20% -> Protocol (factory team fee)
  |-- 80% -> LP position
  |
  v
LP Locker collects fees from positions
  |
  v
LP Locker Fee Conversion converts to preferred token (ETH)
  |
  v
LP Locker calls FeeLocker.storeFees(feeOwner, WETH, amount)
  |-- Split by reward BPS: e.g., 70% to recipient A, 30% to recipient B
  |
  v
Fee recipients (or anyone on their behalf) call FeeLocker.claim()
  |
  v
WETH transferred to fee owner's wallet
```

## Security

- Protected by `ReentrancyGuard` on both `storeFees` and `claim`
- Only allowlisted depositors can store fees (prevents unauthorized balance inflation)
- Uses `SafeERC20` for all transfers
- Balance delta tracking prevents fee-on-transfer token accounting issues

## See Also

- [liquid-lp-locker.md](liquid-lp-locker.md) -- LP Locker that deposits into Fee Locker
- [../sdk/fee-management.md](../sdk/fee-management.md) -- SDK fee claiming guide
- [../concepts/fee-system.md](../concepts/fee-system.md) -- Complete fee system overview
