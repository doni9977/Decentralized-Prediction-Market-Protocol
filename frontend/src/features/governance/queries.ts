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
