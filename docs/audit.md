# Audit Notes

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
