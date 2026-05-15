export type GovernanceAddresses = {
  chainId: number;
  governanceToken: `0x${string}`;
  governor: `0x${string}`;
};

export const governanceAddresses: Record<number, GovernanceAddresses> = {
  31337: {
    chainId: 31337,
    governanceToken: "0x0000000000000000000000000000000000000000",
    governor: "0x0000000000000000000000000000000000000000"
  }
};
