export type MarketAddresses = {
  chainId: number;
  marketFactory: `0x${string}`;
  collateralToken: `0x${string}`;
  predictionMarket: `0x${string}`;
  resolutionManager: `0x${string}`;
  oracleAdapter: `0x${string}`;
};

export const marketAddresses: Record<number, MarketAddresses> = {
  31337: {
    chainId: 31337,
    marketFactory: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    collateralToken: "0x0000000000000000000000000000000000000000",
    predictionMarket: "0x0000000000000000000000000000000000000000",
    resolutionManager: "0x0000000000000000000000000000000000000000",
    oracleAdapter: "0x0000000000000000000000000000000000000000"
  }
};
