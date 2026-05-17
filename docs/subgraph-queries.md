# Subgraph Queries

## Active Markets

```graphql
query ActiveMarkets($now: BigInt!) {
  markets(where: { closeTime_gt: $now }, orderBy: closeTime, orderDirection: asc) {
    id
    question
    closeTime
    totalLiquidity
    yesReserve
    noReserve
  }
}
```

## Recent Trades

```graphql
query RecentTrades {
  trades(first: 20, orderBy: timestamp, orderDirection: desc) {
    id
    market {
      id
      question
    }
    buyer
    outcome
    collateralIn
    sharesOut
    feeAmount
  }
}
```

## Governance Proposals

```graphql
query Proposals {
  proposals(first: 10, orderBy: endBlock, orderDirection: desc) {
    id
    proposer
    state
    description
    startBlock
    endBlock
  }
}
```

## User Votes

```graphql
query UserVotes($voter: Bytes!) {
  votes(where: { voter: $voter }, orderBy: timestamp, orderDirection: desc) {
    id
    proposal {
      id
      description
    }
    support
    weight
  }
}
```

## Resolution Status

```graphql
query ResolutionStatus {
  resolutions(where: { finalized: true }, orderBy: resolvedAt, orderDirection: desc) {
    id
    market {
      id
      question
    }
    outcome
    resolvedAt
    disputed
    finalized
    cancelled
  }
}
```
