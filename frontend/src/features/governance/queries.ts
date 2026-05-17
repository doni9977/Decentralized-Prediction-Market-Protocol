export const GET_PROPOSALS = `
  query Proposals($first: Int!) {
    proposals(first: $first, orderBy: endBlock, orderDirection: desc) {
      id
      proposer
      state
      description
      startBlock
      endBlock
    }
  }
`;

export const GET_ACTIVE_MARKETS = `
  query ActiveMarkets($now: BigInt!, $first: Int!) {
    markets(first: $first, where: { closeTime_gt: $now }, orderBy: closeTime, orderDirection: asc) {
      id
      question
      closeTime
      totalLiquidity
      yesReserve
      noReserve
    }
  }
`;

export const GET_RECENT_TRADES = `
  query RecentTrades($first: Int!) {
    trades(first: $first, orderBy: timestamp, orderDirection: desc) {
      id
      buyer
      outcome
      collateralIn
      sharesOut
      feeAmount
      timestamp
      market {
        id
        question
      }
    }
  }
`;

export const GET_VOTES_BY_USER = `
  query VotesByUser($voter: Bytes!) {
    votes(where: { voter: $voter }, orderBy: timestamp, orderDirection: desc) {
      id
      support
      weight
      proposal {
        id
      }
    }
  }
`;

export const GET_RESOLUTION_STATUSES = `
  query ResolutionStatuses($first: Int!) {
    resolutions(first: $first, orderBy: resolvedAt, orderDirection: desc) {
      id
      outcome
      resolved
      disputed
      finalized
      cancelled
      resolvedAt
      disputeDeadline
      market {
        id
        question
      }
    }
  }
`;
