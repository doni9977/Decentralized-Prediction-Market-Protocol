# On-Chain Prediction Market

Hardhat-based final project for **Option D: On-Chain Prediction Market**.

The system implements a decentralized binary prediction market with YES/NO outcome shares, CPMM-style pricing, oracle-aware resolution, dispute windows, claiming, and DAO-governed privileged actions.

## Modules

| Module | Description |
|---|---|
| `PredictionMarket` | Core market contract with liquidity, CPMM reserves, purchases, and fees. |
| `OutcomeToken` | ERC-1155 YES/NO outcome shares. |
| `OracleAdapter` | Chainlink-style oracle adapter with stale price checks. |
| `ResolutionManager` | Market resolution, dispute window, finalization, and claiming flow. |
| Governance | Intended OpenZeppelin Governor + Timelock control for privileged actions. |
| The Graph | Intended event indexing for frontend reads. |

## Quick Start

```bash
npm install
npm run compile
npm test
```

Optional reports:

```bash
REPORT_GAS=true npm test
npm run coverage
```

## Deploy Instructions

Recommended deployment order:

1. Deploy collateral token or configure existing ERC20 collateral.
2. Deploy `OutcomeToken`.
3. Deploy `OracleAdapter` with feed address and stale period.
4. Deploy `ResolutionManager` with `OutcomeToken` and dispute window.
5. Deploy `PredictionMarket` or `MarketFactory`.
6. Grant `MINTER_ROLE` on `OutcomeToken` to `PredictionMarket` or `MarketFactory`.
7. Grant `BURNER_ROLE` on `OutcomeToken` to `ResolutionManager`.
8. Grant resolution roles to resolver/governance.
9. Transfer final admin ownership and roles to Timelock.
10. Verify contracts on the target explorer.

## Deployment

### Base Sepolia

Deployment links will be added after final deployment.

| Contract | Address / Link |
|---|---|
| GovernanceToken | TBD |
| PredictionGovernor | TBD |
| Timelock | TBD |
| OutcomeToken | TBD |
| OracleAdapter | TBD |
| ResolutionManager | TBD |
| MarketFactory | TBD |
| PredictionMarket | TBD |

### Arbitrum Sepolia

Deployment links will be added after final deployment.

| Contract | Address / Link |
|---|---|
| GovernanceToken | TBD |
| PredictionGovernor | TBD |
| Timelock | TBD |
| OutcomeToken | TBD |
| OracleAdapter | TBD |
| ResolutionManager | TBD |
| MarketFactory | TBD |
| PredictionMarket | TBD |

## Verified Contracts

Explorer verification links will be added after deployment:

- BaseScan: TBD
- Arbiscan: TBD

## Subgraph

Subgraph links will be added after indexing is deployed.

Important events to index:

- `LiquidityAdded`
- `LiquidityRemoved`
- `OutcomePurchased`
- `OutcomeMinted`
- `OutcomeBurned`
- `MarketResolved`
- `ResolutionDisputed`
- `ResolutionFinalized`
- `PayoutClaimed`

## Documentation

- [Architecture](docs/architecture.md)
- [AMM Module](docs/amm.md)
- [Oracle and Resolution](docs/oracle-resolution.md)
- [Security Audit](docs/audit.md)
- [Gas Optimization](docs/gas-optimization.md)

## Contributor Scopes

### Contributor 1

- Binary prediction market core.
- CPMM-style pricing for buying YES/NO outcome shares.
- Liquidity accounting.
- Events for frontend and subgraph indexing.
- AMM tests and documentation.

### Contributor 2

- ERC-1155 outcome shares.
- Oracle adapter and stale price checks.
- Resolution lifecycle and dispute window.
- Claiming and payout security tests.
- Oracle/resolution documentation and audit notes.

### Docs and Security

- Architecture documentation.
- Security audit report.
- Gas optimization report.
- README deployment and docs links.

## Security Notes

- Privileged roles should be transferred to Timelock before final deployment.
- `OracleAdapter` rejects stale or invalid oracle answers.
- `ResolutionManager` prevents claims before finalization.
- Claiming uses `nonReentrant` and `SafeERC20`.
- Final integration must decide whether collateral payouts live in `ResolutionManager` or `PredictionMarket`.

