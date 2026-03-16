# Changelog

All notable changes to `liquid-sdk` will be documented in this file.

## [1.2.0] - 2025-03-10

### Added
- `getDeployedTokens(deployer, fromBlock?, toBlock?)` — query all tokens deployed by an address via on-chain events
- `buildContext()` / `buildMetadata()` helpers for structured on-chain context and metadata
- `parseContext()` / `parseMetadata()` for reading context/metadata back from on-chain strings
- `LiquidContext` and `LiquidMetadata` type exports
- Auto-default `context` field to `{"interface":"SDK"}` when no context is provided to `deployToken()`
- `AGENT_README.md` — 700+ line reference optimized for AI agents and LLM-assisted development
- `llms.txt` — structured summary following the llms-txt.org specification
- `.cursor/skills/use-liquid-sdk/SKILL.md` — Cursor IDE auto-discovery skill
- 8 runnable examples in `examples/` directory

### Changed
- Expanded NPM keywords for better discoverability (erc20, deploy, defi, web3, etc.)
- Updated package description to highlight zero-API-key, single-dependency value prop
- `files` array now includes README.md, AGENT_README.md, CHANGELOG.md, and llms.txt

## [1.1.0] - 2025-02-28

### Added
- Custom position builders: `createPositions()`, `createPositionsUSD()`, `createDefaultPositions()`
- `describePositions()` for human-readable market cap range descriptions
- Tick ↔ market cap conversion utilities: `getTickFromMarketCapETH`, `getTickFromMarketCapUSD`, `marketCapFromTickETH`, `marketCapFromTickUSD`
- Dynamic fee pool data encoding: `encodeDynamicFeePoolData()`
- Sniper auction data encoding: `encodeSniperAuctionData()`
- `DEFAULT_TRANCHES_USD` preset (40% @ $500K, 50% @ $10M, 10% @ $1B)
- Pool reads: `getPoolConfig()`, `getPoolFeeState()`, `getPoolCreationTimestamp()`, `isLiquidToken0()`
- Sniper auction reads: `getAuctionState()`, `getAuctionFeeConfig()`, `getAuctionDecayStartTime()`, `getAuctionMaxRounds()`, `getAuctionGasPriceForBid()`
- MEV protection reads: `getMevBlockDelay()`, `getPoolUnlockTime()`
- Comprehensive client-side validation in `deployToken()` with clear error messages

### Changed
- Default hook switched to `HOOK_STATIC_FEE_V2` with proper two-layer pool data encoding
- Default positions changed from single full-range to 3-tranche Liquid preset
- Default MEV module switched to `SNIPER_AUCTION_V2` with 80%→40% decay over 20s

## [1.0.0] - 2025-02-15

### Added
- Initial release of `liquid-sdk`
- `LiquidSDK` class with full token lifecycle support
- `deployToken()` — deploy ERC-20 tokens with Uniswap V4 liquidity on Base
- Dev buy support — buy tokens with ETH in the same deployment transaction
- Fee management: `getAvailableFees()`, `getFeesToClaim()`, `claimFees()`
- LP reward management: `getTokenRewards()`, `collectRewards()`, `collectRewardsWithoutUnlock()`, `updateRewardRecipient()`
- Vault management: `getVaultAllocation()`, `getVaultClaimable()`, `claimVault()`
- Airdrop support: `getAirdropInfo()`, `getAirdropClaimable()`, `claimAirdrop()`
- Token info: `getTokenInfo()`, `getDeploymentInfo()`
- Token metadata updates: `updateImage()`, `updateMetadata()`
- Factory status checks: `isFactoryDeprecated()`, `isLockerEnabled()`, `isExtensionEnabled()`
- Static fee pool data encoding: `encodeStaticFeePoolData()`
- All 13 contract ABIs exported
- All type definitions exported
- Dual build output: CJS + ESM with TypeScript declarations
- Single peer dependency: `viem ^2.0.0`
