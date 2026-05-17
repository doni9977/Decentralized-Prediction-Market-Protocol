export type GovernanceAddresses = {
  chainId: number;
  governanceToken: `0x${string}`;
  governor: `0x${string}`;
  feeAsset: `0x${string}`;
  feeVault: `0x${string}`;
};

export const governanceAddresses: Record<number, GovernanceAddresses> = {
  31337: {
    chainId: 31337,
    governanceToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    governor: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    feeAsset: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    feeVault: "0x0165878A594ca255338adfa4d48449f69242Eb8F"
  }
};
