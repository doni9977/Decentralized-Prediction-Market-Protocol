# Audit Notes

## Oracle Stale Price Risk

Description: A resolver could use outdated oracle data if freshness is not checked.

Impact: Markets may resolve to the wrong outcome based on stale prices.

Mitigation: `OracleAdapter.getLatestAnswer` reverts when `updatedAt` is zero, the answer is older than `stalePeriod`, or `answeredInRound < roundId`. `ResolutionManager.resolveMarketFromOracle` calls the adapter directly, so stale oracle data reverts and leaves the market unresolved.

Test file: `test/oracle/OracleAdapter.test.ts`, `test/resolution/ResolutionManager.test.ts`

## Unauthorized Resolution Risk

Description: Any user resolving markets could force an incorrect YES/NO outcome.

Impact: Attackers could steal collateral by finalizing markets in their favor.

Mitigation: `ResolutionManager.resolveMarket` requires `RESOLVER_ROLE` and uses a custom `UnauthorizedResolver()` error.

Test file: `test/resolution/ResolutionManager.test.ts`

## Claiming Before Finalization Risk

Description: Users could claim payouts while the dispute window is still active.

Impact: Collateral could leave the contract before disputes are settled.

Mitigation: `claim` requires `finalized == true`; finalization is blocked until the dispute deadline passes.

Test file: `test/resolution/Claiming.test.ts`

## Reentrancy During Payout Risk

Description: ERC1155 receiver hooks or ERC20 callbacks could attempt nested payout claims.

Impact: A malicious receiver could try to drain collateral by reentering `claim`.

Mitigation: `claim` uses `nonReentrant`, burns shares before transferring payout collateral, and uses `SafeERC20`.

Test file: `test/resolution/Claiming.test.ts`

## Incorrect Outcome Token Minting Risk

Description: If arbitrary users can mint outcome shares, they can create fake winning claims.

Impact: Collateral pool can be drained by unbacked shares.

Mitigation: `OutcomeToken.mintOutcome` requires `MINTER_ROLE`, while `burnOutcome` requires separate `BURNER_ROLE`; invalid outcomes and zero amounts revert. `ResolutionManager` only needs `BURNER_ROLE`, so it cannot mint unbacked shares.

Test file: `test/tokens/OutcomeToken.test.ts`

## Insufficient Payout Liquidity Risk

Description: A market may be finalized while `ResolutionManager` does not hold enough collateral to pay the requested claim.

Impact: Users could receive confusing token burn failures or partial payout assumptions.

Mitigation: `claim` checks the ERC20 collateral balance before burning shares and reverts with `InsufficientPayoutLiquidity()` if the payout pool is underfunded.

Test file: `test/resolution/Claiming.test.ts`
