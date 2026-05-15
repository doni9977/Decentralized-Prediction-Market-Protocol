# Security Audit

## Executive Summary

This document reviews the on-chain prediction market system, including the AMM market flow, ERC-1155 outcome shares, oracle adapter, resolution lifecycle, dispute window, claiming flow, governance assumptions, and fee custody assumptions.

The current codebase is suitable for a course final project and includes several important security controls:

- `SafeERC20` for ERC20 movement,
- `ReentrancyGuard` on token transfer flows,
- custom errors for precise revert cases,
- role-based access control for minting, burning, resolving, and dispute administration,
- Chainlink-style stale oracle checks,
- explicit dispute window before finalization,
- tests for success and revert paths.

The most important remaining integration risk is collateral ownership. `PredictionMarket` currently holds collateral during trading, while `ResolutionManager` contains a tested claim flow that expects collateral to be deposited into its payout pool. The final integration must choose one model before deployment:

- move claimable collateral into `ResolutionManager`, or
- move payout execution into `PredictionMarket` and use `ResolutionManager` only as the source of final outcome truth.

## Scope

Reviewed components:

| Area | Path |
|---|---|
| AMM market | `contracts/market/PredictionMarket.sol` |
| Math library | `contracts/libraries/MarketMath.sol` |
| Outcome shares | `contracts/tokens/OutcomeToken.sol` |
| Oracle adapter | `contracts/oracle/OracleAdapter.sol` |
| Resolution and claims | `contracts/resolution/ResolutionManager.sol` |
| Interfaces | `contracts/interfaces/` |
| Mocks and security tests | `contracts/mocks/`, `test/` |
| Documentation | `docs/` |

Commit hash:

```txt
To be filled before final submission with: git rev-parse HEAD
```

Out of scope:

- frontend implementation,
- deployed subgraph mappings,
- final production deployment scripts,
- final Governor/Timelock contracts if not present in the branch,
- economic correctness beyond the simplified CPMM model.

## Methodology

The review used:

- manual Solidity review,
- threat modeling by module,
- test review for success and revert paths,
- role and privilege review,
- oracle misuse review,
- reentrancy review,
- documentation review.

Recommended automated tools before final submission:

- `npm run compile`
- `npm test`
- Slither static analysis
- solidity-coverage
- hardhat-gas-reporter

## Findings Table

| ID | Severity | Title | Status | Fix |
|---|---|---|---|---|
| H-01 | High | Unauthorized market resolution could select false outcome | Fixed | `RESOLVER_ROLE` required in `ResolutionManager`. |
| H-02 | High | Unrestricted outcome minting could drain payout collateral | Fixed | `MINTER_ROLE` required for minting. |
| M-01 | Medium | ResolutionManager should not receive mint permission | Fixed | Separate `BURNER_ROLE` added. |
| M-02 | Medium | Stale oracle data could resolve markets incorrectly | Fixed | `OracleAdapter` checks answer, round, and `updatedAt`. |
| M-03 | Medium | Claiming before finalization could bypass dispute process | Fixed | `claim` requires finalized resolution. |
| M-04 | Medium | Underfunded payout pool could burn shares before payment | Fixed | `InsufficientPayoutLiquidity` check before burn. |
| L-01 | Low | Cancelled markets do not support refund flow | Open | Documented as limitation. |
| I-01 | Info | Final role ownership must move to Timelock | Open | Deployment checklist item. |
| G-01 | Gas | Repeated storage reads in resolution and AMM flows | Open | Can be optimized after final integration. |

## Detailed Findings

### H-01: Unauthorized Market Resolution Could Select False Outcome

Description:
If any address could call market resolution, an attacker could choose YES or NO in their favor.

Impact:
The attacker could finalize a false outcome and claim collateral using shares they hold.

Status:
Fixed.

Mitigation:
`ResolutionManager.resolveMarket` and `resolveMarketFromOracle` require `RESOLVER_ROLE`. Unauthorized callers revert with `UnauthorizedResolver()`.

Evidence:
Covered by `test/resolution/ResolutionManager.test.ts`.

### H-02: Unrestricted Outcome Minting Could Drain Payout Collateral

Description:
Outcome shares represent claims on collateral. If a user can mint shares without paying, they can mint winning shares and claim payouts.

Impact:
Collateral can be drained by unbacked shares.

Status:
Fixed.

Mitigation:
`OutcomeToken.mintOutcome` requires `MINTER_ROLE`. The intended minter is `PredictionMarket` or the AMM module only.

Evidence:
Covered by `test/tokens/OutcomeToken.test.ts`.

### M-01: ResolutionManager Should Not Receive Mint Permission

Description:
The initial design allowed `ResolutionManager` to burn shares by giving it `MINTER_ROLE`. This worked functionally but gave excessive privilege.

Impact:
If `ResolutionManager` or its admin path was compromised, it could mint unbacked shares.

Status:
Fixed.

Mitigation:
`OutcomeToken` now has separate roles:

- `MINTER_ROLE` for `PredictionMarket` or AMM,
- `BURNER_ROLE` for `ResolutionManager`.

Evidence:
Tests cover minter-only and burner-only separation.

### M-02: Stale Oracle Data Could Resolve Markets Incorrectly

Description:
Oracle feeds can become stale. Using old data for resolution would make markets settle against outdated real-world information.

Impact:
Markets can resolve incorrectly even if the contract call succeeds.

Status:
Fixed.

Mitigation:
`OracleAdapter.getLatestAnswer` reverts unless:

- `answer > 0`,
- `updatedAt != 0`,
- `block.timestamp - updatedAt <= stalePeriod`,
- `answeredInRound >= roundId`.

`ResolutionManager.resolveMarketFromOracle` calls the adapter directly, so stale data reverts and leaves the market unresolved.

Evidence:
Covered by `test/oracle/OracleAdapter.test.ts` and `test/resolution/ResolutionManager.test.ts`.

### M-03: Claiming Before Finalization Could Bypass Disputes

Description:
If claims were allowed immediately after resolution, users could withdraw collateral before disputes are handled.

Impact:
Bad outcomes could become economically irreversible before governance or dispute admins can react.

Status:
Fixed.

Mitigation:
`claim` requires finalized resolution. `finalizeResolution` reverts while the dispute window is active.

Evidence:
Covered by `test/resolution/Claiming.test.ts`.

### M-04: Underfunded Payout Pool Could Burn Shares Before Payment

Description:
If the payout pool lacks collateral, burning shares first would create a poor failure mode or confusing accounting.

Impact:
Users could lose claim tokens if external transfer logic were changed or if a nonstandard token behaved unexpectedly.

Status:
Fixed.

Mitigation:
`claim` checks `IERC20(collateralToken).balanceOf(address(this)) >= payout` before burning outcome shares.

Evidence:
Covered by `test/resolution/Claiming.test.ts`.

### L-01: Cancelled Markets Do Not Support Refund Flow

Description:
`ResolutionManager` can cancel a market, but the current implementation does not define how YES and NO shares redeem after cancellation.

Impact:
Cancelled markets require manual handling or a later refund implementation.

Status:
Open.

Recommendation:
Add a refund rule before production. Common options:

- redeem both YES and NO at a fixed partial value,
- refund based on user net collateral contribution,
- move cancelled-market settlement into `PredictionMarket`.

### I-01: Final Role Ownership Must Move to Timelock

Description:
During tests, deployer/admin addresses hold privileged roles.

Impact:
If deployed this way, the system remains centralized.

Status:
Open.

Recommendation:
Before final deployment, transfer ownership and admin roles to Timelock/Governance:

- `DEFAULT_ADMIN_ROLE`,
- `MARKET_MANAGER_ROLE`,
- `RESOLVER_ROLE`,
- `DISPUTE_ADMIN_ROLE`,
- oracle adapter owner,
- market fee owner.

### G-01: Repeated Storage Reads in Resolution and AMM Flows

Description:
Some flows read storage values multiple times or keep booleans in separate slots.

Impact:
Higher gas cost, especially on L1.

Status:
Open.

Recommendation:
Optimize after final integration using gas reports. Do not over-optimize before interfaces stabilize.

## Case Study 1: Reentrancy

Risk:
Claiming transfers ERC20 collateral to the caller. A malicious token or receiver path could attempt to call back into `claim`.

Vulnerable pattern:

```solidity
function claim(bytes32 marketId, uint256 amount) external {
    IERC20(collateral).transfer(msg.sender, payout);
    outcomeToken.burnOutcome(msg.sender, marketId, outcome, amount);
}
```

Problems:

- external transfer happens before effects,
- no reentrancy guard,
- token burn happens after payout.

Implemented pattern:

```solidity
function claim(bytes32 marketId, uint256 amount) external nonReentrant {
    if (!resolution.finalized) revert MarketNotResolved();
    if (IERC20(collateralToken).balanceOf(address(this)) < payout) {
        revert InsufficientPayoutLiquidity();
    }

    outcomeToken.burnOutcome(msg.sender, marketId, winningOutcome, amount);
    IERC20(collateralToken).safeTransfer(msg.sender, payout);
}
```

Security improvements:

- `nonReentrant` blocks nested claims,
- finalization is checked before payout,
- liquidity is checked before burn,
- winning shares are burned before transfer,
- `SafeERC20` handles nonstandard ERC20 return values.

Test evidence:
`test/resolution/Claiming.test.ts` uses `MockReentrantERC20` and `ReentrantClaimant` to reproduce a reentrancy attempt.

## Case Study 2: Access Control

Risk:
Privileged functions owned by a deployer wallet instead of Timelock can be changed instantly without community review.

Problem examples:

- owner changes oracle feed to a malicious feed,
- resolver role is granted to an attacker,
- market fee is changed unexpectedly,
- dispute admin cancels a valid market.

Required final deployment pattern:

```txt
Governor -> Timelock -> privileged contract calls
```

Recommended role ownership:

| Role/Permission | Final Owner |
|---|---|
| `OutcomeToken.DEFAULT_ADMIN_ROLE` | Timelock |
| `OutcomeToken.MINTER_ROLE` | PredictionMarket/MarketFactory |
| `OutcomeToken.BURNER_ROLE` | ResolutionManager |
| `ResolutionManager.DEFAULT_ADMIN_ROLE` | Timelock |
| `ResolutionManager.RESOLVER_ROLE` | Timelock, resolver service, or governed resolver |
| `ResolutionManager.DISPUTE_ADMIN_ROLE` | Timelock |
| `OracleAdapter.owner` | Timelock |
| `PredictionMarket.owner` | Timelock |

## Centralization Risks

The system is not fully trustless while privileged roles exist. The final project should be explicit about this.

| Risk | Impact | Mitigation |
|---|---|---|
| Deployer keeps admin roles | Deployer can change roles or privileged config. | Transfer roles to Timelock. |
| Resolver role is centralized | Resolver can choose initial outcome. | Use oracle-based resolution, dispute window, and governance override. |
| Oracle adapter owner can change feed | Wrong feed can control outcomes. | Timelock ownership and event monitoring. |
| Fee owner can change fee | Users may face unexpected fee changes. | Timelock ownership and max fee bounds. |
| Upgradeable vault admin can upgrade malicious logic | Fees can be stolen. | Timelock, audits, storage layout checks. |

## Oracle Risks

Oracle safety depends on both contract checks and source selection.

Handled risks:

- zero price rejected,
- negative price rejected,
- stale timestamp rejected,
- incomplete Chainlink round rejected,
- oracle resolution reverts if adapter reverts.

Remaining risks:

- valid but manipulated oracle answer,
- wrong feed selected by governance,
- stale period configured too high,
- market question not objectively tied to feed threshold,
- L2 sequencer downtime if a sequencer uptime feed is not integrated.

Recommended future improvement:
Add a sequencer uptime oracle check for optimistic rollups and document per-market oracle configuration.

## Governance Risks

Governance controls sensitive functions. The main governance risks are:

- low quorum lets a small group pass proposals,
- voting token concentration,
- malicious proposal calldata,
- timelock delay too short,
- emergency actions not clearly defined.

Mitigations:

- set reasonable quorum and proposal threshold,
- use Timelock for all privileged execution,
- index governance events in the frontend,
- document admin role transfer,
- test proposal queue/execute lifecycle.

## Appendix: Slither Output

Slither should be run before final submission. Paste the final output here.

Expected command:

```bash
slither .
```

Current status:

```txt
Pending final local run.
```

## Appendix: Test Coverage Map

| Risk | Test File |
|---|---|
| Unauthorized mint/burn | `test/tokens/OutcomeToken.test.ts` |
| Invalid oracle answer | `test/oracle/OracleAdapter.test.ts` |
| Stale oracle answer | `test/oracle/OracleAdapter.test.ts` |
| Unauthorized resolution | `test/resolution/ResolutionManager.test.ts` |
| Oracle-based resolution | `test/resolution/ResolutionManager.test.ts` |
| Dispute window enforcement | `test/resolution/ResolutionManager.test.ts` |
| Claim before finalization | `test/resolution/Claiming.test.ts` |
| Reentrancy attempt | `test/resolution/Claiming.test.ts` |
| Insufficient payout liquidity | `test/resolution/Claiming.test.ts` |

