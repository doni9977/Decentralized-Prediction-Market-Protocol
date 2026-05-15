# Governance, Deployment, Factory, and Upgradeability

## 1. Governance Overview

The protocol uses an OpenZeppelin DAO stack:

- `GovernanceToken`: ERC20Votes + ERC20Permit voting token.
- `PredictionGovernor`: Governor + settings + simple counting + votes + quorum fraction + timelock control.
- `TimelockController`: final executor for privileged protocol actions.

The intended control path is:

1. Token holders delegate voting power.
2. A holder above the proposal threshold proposes an action.
3. Voting starts after the voting delay.
4. If quorum and majority are reached, the proposal is queued in the timelock.
5. After the timelock delay, anyone can execute the queued operation.

Subgraph and frontend should index:

- `ProposalCreated`
- `VoteCast`
- `ProposalQueued`
- `ProposalExecuted`

## 2. Token Voting Mechanics

`GovernanceToken` is an ERC20Votes token. Voting power is checkpoint-based and only active after delegation. A holder may delegate to themselves or another address.

The token also supports ERC20Permit, so approvals can be signed off-chain and submitted on-chain by a relayer or frontend.

Initial supply is minted to the deployment owner. During production deployment, ownership is transferred to the timelock so future minting can only happen through governance.

## 3. Proposal Lifecycle

Governor parameters:

- Voting delay: `7,200` blocks, treated as 1 day at 12 second block time.
- Voting period: `50,400` blocks, treated as 1 week at 12 second block time.
- Quorum: 4% of token supply at the snapshot block.
- Proposal threshold: 1% of current token supply.
- Timelock delay: 2 days.

Lifecycle:

1. `propose(targets, values, calldatas, description)`
2. Wait voting delay.
3. `castVote(proposalId, support)`
4. Wait voting period.
5. `queue(targets, values, calldatas, descriptionHash)`
6. Wait 2 day timelock delay.
7. `execute(targets, values, calldatas, descriptionHash)`

## 4. Timelock Permissions

The timelock should own or administer privileged contracts, including:

- Governance token mint authority.
- Market factory admin parameters.
- Upgradeable fee vault owner and upgrade authority.
- Future oracle/resolution admin roles after teammate integration.
- Future protocol treasury actions.

The governor has `PROPOSER_ROLE` on the timelock. `EXECUTOR_ROLE` is granted to `address(0)`, allowing anyone to execute ready proposals. The deployer admin role is revoked after setup.

## 5. Timelock-Controlled Contracts

Current deployment script transfers or assigns control to the timelock for:

- `GovernanceToken`
- `MarketFactory`
- `UpgradeableFeeVaultV1` proxy

After OracleAdapter, ResolutionManager, Market, AMM, or treasury contracts are integrated, their admin roles should also be transferred to the timelock.

## 6. Factory CREATE and CREATE2

`MarketFactory` supports:

- `createMarket`: normal CREATE deployment.
- `createMarketDeterministic`: CREATE2 deterministic deployment.
- `predictMarketAddress`: precomputes the CREATE2 address from constructor parameters and salt.

Until the final Market/AMM contract is available, the factory deploys `MinimalPredictionMarket`, which stores:

- question
- close time
- collateral token
- oracle/resolution address
- fee bps
- creator

Integration note: replace the deployed implementation bytecode with the final Market constructor once teammate 1 finalizes Market/AMM constructor parameters. Keep factory function names and events stable for subgraph and frontend.

## 7. UUPS V1 to V2 Upgrade Path

`UpgradeableFeeVaultV1` is a UUPS proxy implementation with:

- `initialize(address owner, address asset)`
- `collectFee(uint256 amount)`
- `withdrawFees(address to, uint256 amount)`
- `totalFeesCollected()`

`UpgradeableFeeVaultV2` adds:

- `feeRecipient`
- `setFeeRecipient(address)`
- `version()`

Upgrade flow:

1. Deploy V1 implementation behind a UUPS proxy.
2. Initialize owner as timelock and asset as collateral/fee token.
3. Governance proposal calls `upgradeToAndCall` through the proxy.
4. V2 functions become available while V1 storage remains intact.

## 8. Storage Layout Safety

V1 storage:

1. `IERC20 public asset`
2. `uint256 private _totalFeesCollected`

V2 appends:

3. `address public feeRecipient`

No V1 variable is reordered, removed, renamed into a different type, or inserted before existing fields. This preserves proxy storage layout.

## 9. Deployment Steps

1. Install dependencies.
2. Configure `.env` from `.env.example`.
3. Deploy to an L2 testnet.
4. Run post-deployment checks.
5. Verify contracts.
6. Copy generated addresses into frontend config.

Commands:

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network baseSepolia
npx hardhat run scripts/postDeployCheck.ts --network baseSepolia
npx hardhat run scripts/verify.ts --network baseSepolia
```

## 10. Post-Deployment Checks

`scripts/postDeployCheck.ts` validates:

- deployed addresses are non-zero
- voting delay equals 7,200 blocks
- voting period equals 50,400 blocks
- quorum numerator equals 4
- proposal threshold equals 1% of total supply
- timelock delay equals 2 days
- timelock owns token, factory, and vault

## 11. L2 Verification

For Base Sepolia:

- set `BASE_SEPOLIA_RPC_URL`
- set `BASESCAN_API_KEY`
- run deploy, post check, then verify

For Arbitrum Sepolia:

- set `ARBITRUM_SEPOLIA_RPC_URL`
- set `ARBISCAN_API_KEY`
- run the same scripts with `--network arbitrumSepolia`

## 12. Security Assumptions and Risks

Governance assumes token distribution is not excessively concentrated and voting delay is long enough for users to react to malicious proposals. The timelock gives users time to exit or dispute governance decisions, but it does not prevent token-holder capture.

Factory risks include CREATE2 salt collisions and accidentally changing constructor parameters after frontend/subgraph integration. The factory tracks used salts and emits stable creation events.

Upgradeability risks include malicious upgrades and storage collisions. UUPS authorization is owner-only, and production owner should be the timelock. Storage changes must append new variables only.
