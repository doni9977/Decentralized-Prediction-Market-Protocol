# Gas Optimization Report

## Methodology

Gas should be measured with Hardhat gas reporter after the full branch integration is complete.

Recommended local run:

```bash
REPORT_GAS=true npm test
```

The report should compare approximate costs across:

- Ethereum L1,
- Base Sepolia/Base mainnet style fee model,
- Arbitrum Sepolia/Arbitrum One style fee model.

Exact L2 gas cost depends on:

- L2 execution gas,
- L1 calldata posting cost,
- current base fee,
- calldata size,
- batch compression.

The table below is a planning baseline, not final measured deployment data. Replace estimates with actual gas reporter values before final submission.

## Baseline Table

| Operation | ETH L1 | Base | Arbitrum | Notes |
|---|---:|---:|---:|---|
| Deploy `OutcomeToken` | High | Medium | Medium | ERC-1155 and AccessControl bytecode. |
| Deploy `PredictionMarket` | Medium | Low | Low | Immutable dependencies reduce storage setup. |
| Add liquidity | Medium | Low | Low | ERC20 transfer plus reserve updates. |
| Buy YES/NO shares | Medium | Low | Low | ERC20 transfer, reserve update, ERC-1155 mint. |
| Resolve from oracle | Low/Medium | Low | Low | Oracle read plus resolution storage writes. |
| Start dispute | Low | Low | Low | Writes disputed flag and emits reason. |
| Finalize resolution | Low | Low | Low | Single finalized state change. |
| Claim payout | Medium | Low | Low | ERC-1155 burn plus ERC20 transfer. |
| Governance proposal | High | Medium | Medium | Calldata-heavy and multi-step lifecycle. |
| Timelock execution | Medium | Low/Medium | Low/Medium | Depends on target calldata. |

## Optimization List

Potential optimizations after final integration:

| Optimization | Area | Benefit | Risk |
|---|---|---|---|
| Cache storage variables in memory | `PredictionMarket`, `ResolutionManager` | Reduces repeated SLOAD. | Low. |
| Pack resolution status fields | `ResolutionManager.Resolution` | Fewer storage slots. | Medium if layout is changed late. |
| Use custom errors | All contracts | Lower deploy and revert cost. | Already implemented in current modules. |
| Short-circuit validation checks | Buy/claim/resolve paths | Avoids expensive calls when input is invalid. | Low. |
| Keep immutable dependencies | Market/resolution/oracle | Cheaper reads than storage. | Already used where practical. |
| Avoid long revert strings | All contracts | Lower bytecode size. | Already implemented. |
| Batch role setup in deployment script | Deployment | Fewer transactions. | Low, script-only. |
| Minimize event data where possible | High-frequency events | Lower log cost. | Medium because subgraph needs indexed data. |
| Use assembly only in isolated math | `MarketMath` | Can reduce arithmetic overhead. | Higher audit burden. |
| Avoid unnecessary external calls | Claim/resolve | Lower gas and less attack surface. | Must preserve safety checks. |

## Before and After Examples

### Example 1: Separate Custom Errors Instead of Revert Strings

Before:

```solidity
require(outcome == 1 || outcome == 2, "invalid outcome");
```

After:

```solidity
if (outcome != 1 && outcome != 2) revert InvalidOutcome();
```

Impact:

- smaller deployed bytecode,
- cheaper reverts,
- easier test matching.

Status:
Implemented.

### Example 2: Immutable Contract Dependencies

Before:

```solidity
IERC20 public collateralToken;
IOutcomeToken public outcomeToken;
```

After:

```solidity
IERC20 public immutable collateralToken;
IOutcomeToken public immutable outcomeToken;
```

Impact:

- cheaper reads,
- dependency cannot be silently changed after deployment.

Status:
Implemented in `PredictionMarket` and `ResolutionManager` where applicable.

### Example 3: Liquidity Check Before Burn

Before:

```solidity
outcomeToken.burnOutcome(msg.sender, marketId, outcome, amount);
IERC20(collateral).safeTransfer(msg.sender, payout);
```

After:

```solidity
if (IERC20(collateral).balanceOf(address(this)) < payout) {
    revert InsufficientPayoutLiquidity();
}
outcomeToken.burnOutcome(msg.sender, marketId, outcome, amount);
IERC20(collateral).safeTransfer(msg.sender, payout);
```

Impact:

- slightly more gas for successful claims,
- safer failure mode for underfunded payout pools.

Status:
Implemented for security reasons. This is not a pure gas optimization, but it prevents expensive and confusing failed claim paths.

### Example 4: Storage Packing Opportunity in `Resolution`

Current layout:

```solidity
struct Resolution {
    uint256 closeTime;
    uint256 disputeDeadline;
    uint256 payoutPerShare;
    address collateralToken;
    uint8 outcome;
    bool resolved;
    bool disputed;
    bool finalized;
    bool cancelled;
}
```

Potential after final integration:

```solidity
struct Resolution {
    uint64 closeTime;
    uint64 disputeDeadline;
    uint128 payoutPerShare;
    address collateralToken;
    uint8 outcome;
    uint8 flags;
}
```

Impact:

- fewer storage slots,
- lower write cost in resolution/finalization.

Status:
Open. Do not change until final payout units and maximum market duration are agreed.

## L1 vs L2 Notes

Ethereum L1:

- storage writes are expensive,
- event logs and calldata matter,
- deployment bytecode size matters.

Base:

- execution is cheaper than L1,
- calldata posted to L1 still matters,
- frequent user actions such as `buyOutcome` become more affordable.

Arbitrum:

- calldata compression can reduce cost,
- batching makes high-frequency interactions more practical,
- retryable ticket and bridge flows matter for deployment operations.

## Final Gas Checklist

- [ ] Run gas reporter after all teammate branches are integrated.
- [ ] Record gas for deploy, add liquidity, buy, resolve, dispute, finalize, claim.
- [ ] Compare Base and Arbitrum assumptions.
- [ ] Decide whether to pack `Resolution` storage.
- [ ] Keep custom errors.
- [ ] Avoid removing events needed by frontend/subgraph only for gas savings.

