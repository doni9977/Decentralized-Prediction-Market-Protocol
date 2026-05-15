# Oracle, Resolution, Outcome Shares, and Claiming

## Overview

This module implements the vertical prediction-market path owned by the oracle/resolution teammate:

- `OutcomeToken`: ERC-1155 YES/NO outcome shares.
- `OracleAdapter`: Chainlink-style price adapter with stale data checks.
- `ResolutionManager`: market registration, manual resolution, oracle-based resolution, disputes, finalization, collateral deposits, and winning-share claims.

The Market/AMM module is expected to receive `MINTER_ROLE` on `OutcomeToken` so it can mint shares when users buy outcomes. `ResolutionManager` receives only `BURNER_ROLE` so it can burn winning shares during payout claims without gaining mint permissions.

## Outcome Token IDs

Each market has two deterministic ERC-1155 token IDs:

```solidity
tokenId = uint256(keccak256(abi.encode(marketId, outcome)));
```

Valid outcomes are:

- `1`: YES
- `2`: NO

`OutcomeToken.outcomeTokenId` reverts with `InvalidOutcome()` for any other value.

## Resolution Lifecycle

The resolution lifecycle is:

- Registered: market manager records `closeTime`, collateral token, and `payoutPerShare`.
- Open/Closed by time: resolution is blocked until `block.timestamp >= closeTime`.
- Resolved: authorized resolver selects YES or NO and starts the dispute window.
- Disputed: any user can call `startDispute` during the dispute window with an off-chain-readable reason.
- Finalized: anyone can finalize after the dispute window expires.
- Cancelled: dispute admin can cancel before finalization for invalid markets.

Manual resolution remains available for governance/dispute cases. Oracle resolution uses a fresh Chainlink-style answer from `OracleAdapter` and compares it to a threshold: `price >= threshold` resolves YES, otherwise NO.

Finalized markets cannot be changed.

## Oracle Stale Price Behavior

`OracleAdapter` wraps a Chainlink-style `AggregatorV3Interface`.

It accepts a price only when:

- `answer > 0`
- `updatedAt != 0`
- `answeredInRound >= roundId`
- `block.timestamp - updatedAt <= stalePeriod`

Invalid or stale data reverts and cannot be silently used for resolution.

`ResolutionManager.resolveMarketFromOracle` calls `IOracleAdapter.getLatestAnswer`. If the oracle answer is stale or invalid, the transaction reverts and the market stays unresolved.

## Dispute Window Rules

`resolveMarket` sets:

```solidity
disputeDeadline = block.timestamp + disputeWindow;
```

During the window:

- Users can emit `ResolutionDisputed`.
- Dispute admins can change the outcome or cancel the market.
- Finalization is blocked.

After the window:

- New disputes are rejected.
- Anyone can finalize.

## Claiming and Payouts

After finalization, users claim by burning winning outcome shares:

```solidity
payout = burnedShares * payoutPerShare / 1e18;
```

Rules:

- Claims are blocked before finalization.
- Only the finalized winning side is burned and paid.
- Losing shares cannot be used because `claim` burns only the winning token ID from the caller.
- Cancelled markets are not redeemable in this implementation.
- ERC20 transfers use `SafeERC20`.
- `claim` is protected by `nonReentrant`.
- `claim` checks the `ResolutionManager` collateral balance and reverts with `InsufficientPayoutLiquidity()` if the payout pool is underfunded.

## Integration with PredictionMarket

The current implementation keeps claiming in `ResolutionManager` for isolated testing. Teammate 1's `PredictionMarket` currently holds collateral internally during `addLiquidity` and `buyOutcome`, so final integration should choose one mode:

Mode A:
`PredictionMarket` transfers claimable collateral to `ResolutionManager` before users claim finalized markets. In this mode, `depositCollateral` is the funding entrypoint for the payout pool.

Mode B:
Final integration moves claiming into `PredictionMarket`, while `ResolutionManager` only stores final outcomes and dispute/finalization state. In this mode, `PredictionMarket` reads `getResolution(marketId)` before paying winners.

For current tests, `depositCollateral` is an integration placeholder that funds the payout pool.

## Access Control Roles

`OutcomeToken`:

- `DEFAULT_ADMIN_ROLE`: grants/revokes roles.
- `MINTER_ROLE`: can mint outcome shares. Intended holder: PredictionMarket/AMM.
- `BURNER_ROLE`: can burn outcome shares. Intended holder: ResolutionManager for claims.

`ResolutionManager`:

- `DEFAULT_ADMIN_ROLE`: grants/revokes roles.
- `MARKET_MANAGER_ROLE`: registers markets. Intended holder: factory/market manager. If compromised, attacker can register malicious market parameters.
- `RESOLVER_ROLE`: resolves closed markets manually or through oracle resolution. Intended holder: resolver/governance. If compromised, attacker can choose false outcomes before disputes.
- `DISPUTE_ADMIN_ROLE`: changes disputed outcomes and cancels invalid markets. Intended holder: governance/timelock. If compromised, attacker can override disputed markets.

`OracleAdapter`:

- `owner`: updates feed and stale period. In production this should be a timelock/governance address.

## Events for Frontend and Subgraph

Outcome shares:

- `OutcomeMinted`
- `OutcomeBurned`
- standard ERC-1155 `TransferSingle`/`TransferBatch`

Oracle admin:

- `FeedUpdated`
- `StalePeriodUpdated`

Resolution and claims:

- `MarketRegistered`
- `CollateralDeposited`
- `MarketResolved`
- `ResolutionDisputed`
- `ResolutionChanged`
- `ResolutionFinalized`
- `ResolutionCancelled`
- `PayoutClaimed`

## Security Assumptions

- Market/AMM contracts are trusted only for the roles they receive.
- Governance/timelock should own privileged roles in production.
- Oracle feeds must be selected by governance and monitored off-chain.
- Collateral funding must be sufficient before users claim.
- ERC20 collateral should be a standard token compatible with `SafeERC20`.

## Known Limitations

- Cancelled markets do not implement a refund formula yet.
- `ResolutionManager` does not price markets; it only validates resolution and pays finalized winners.
- OracleAdapter exposes price freshness but does not automatically choose a market outcome. Market-specific oracle interpretation should be implemented by the resolver/market module.
- The current payout model uses a fixed `payoutPerShare` configured at market registration.
