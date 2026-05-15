# AMM Module

## Scope

This module implements the first contributor's prediction-market AMM work:

- binary market metadata,
- liquidity accounting,
- CPMM-style pricing reserves,
- YES/NO outcome purchases,
- slippage protection,
- events for frontend and subgraph indexing.

## Pricing Model

The market tracks two virtual reserves:

- `yesReserve`
- `noReserve`

Buying YES decreases `yesReserve` and increases `noReserve` by the fee-adjusted collateral input. Buying NO does the symmetric operation. The invariant is:

```txt
yesReserve * noReserve >= previousK
```

The current fee is stored as basis points. The default deployment used in tests is `30`, meaning `0.3%`.

## Events

The frontend and subgraph should index:

- `LiquidityAdded`
- `LiquidityRemoved`
- `OutcomePurchased`
- `FeeUpdated`

## Integration Notes

`PredictionMarket` uses `IOutcomeToken` instead of owning the ERC-1155 implementation. The second contributor can replace `MockOutcomeToken` with the final ERC-1155 outcome token as long as it keeps:

```solidity
mintOutcome(address to, bytes32 marketId, uint8 outcome, uint256 amount)
burnOutcome(address from, bytes32 marketId, uint8 outcome, uint256 amount)
```

Resolution and claiming are intentionally outside this module. They should consume the same `marketId` and outcome IDs:

- `1 = YES`
- `2 = NO`

## Security Notes

- Token transfers use `SafeERC20`.
- State-changing functions with token movement use `nonReentrant`.
- Buying is disabled after `closeTime`.
- Slippage protection is enforced by `minSharesOut`.
- Fee updates are restricted to the owner. In the final deployment, ownership should move to the Timelock.
