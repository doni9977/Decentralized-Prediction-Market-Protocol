# Audit Notes

<<<<<<< HEAD
## Governance Attack Analysis

### Flash-Loan Governance Attacks

ERC20Votes uses checkpoints, so voting power is measured at proposal snapshots rather than live balances. This reduces same-block borrowing attacks. The voting delay also gives time to detect suspicious voting power accumulation before voting starts.

Mitigations:

- checkpointed voting power
- 1 day voting delay
- 1 week voting period
- 4% quorum
- 2 day timelock delay

### Whale Attacks

A large holder can still influence or control proposals if token distribution is concentrated. This is a governance and tokenomics risk, not a smart contract bug.

Mitigations:

- 4% quorum
- 1% proposal threshold
- timelock execution delay
- public proposal and vote events for monitoring

### Proposal Spam

Low-value or malicious proposals can overwhelm voters if proposal creation is cheap.

Mitigations:

- proposal threshold is 1% of total token supply
- off-chain UI can hide spam while preserving on-chain transparency

### Timelock Bypass

If deployer or another EOA keeps owner/admin roles, privileged actions could bypass governance.

Mitigations:

- deployment script transfers token, factory, and vault ownership to timelock
- deployment script revokes deployer timelock admin role
- post-deployment checks verify timelock ownership

### Malicious Admin

The deployer is powerful during deployment. If ownership transfer is skipped, the deployer can mint tokens, change factory parameters, or upgrade the vault.

Mitigations:

- no deployer backdoor after production setup
- timelock is the owner of privileged contracts
- governance proposal lifecycle is demonstrated in tests

## Factory Deployment Risks

The factory validates:

- non-empty question
- future close time
- non-zero collateral and oracle addresses
- maximum fee of 10%

CREATE2 risks:

- duplicate salts revert through `SaltAlreadyUsed`
- deterministic address depends on every constructor argument
- changing final Market constructor changes predicted addresses

## UUPS Upgrade Risks

Upgrade authorization risk:

- `_authorizeUpgrade` is `onlyOwner`
- production owner should be timelock
- unauthorized upgrade is covered by tests

Storage collision risk:

- V2 appends `feeRecipient` after V1 storage
- V1 variables are not reordered or removed
- storage preservation is covered by tests

## Integration Risks

Market/AMM and Oracle/Resolution contracts are owned by other teammates. This module currently avoids changing their ABI. When they are ready, integrate through minimal interfaces or agreed constructor/admin functions.

Timelock-controlled functions to coordinate with teammate 2:

- oracle feed update
- stale period update
- resolution override or cancel
- authorized resolver changes
=======
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
>>>>>>> origin/main
