import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

function assertCheck(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Post-deploy check failed: ${message}`);
  }
}

async function main() {
  const deployment = JSON.parse(readFileSync(join("deployments", `${network.name}.json`), "utf8"));
  const singleWalletDev =
    process.env.SINGLE_WALLET_DEV === "1" || network.name === "localhost" || network.name === "hardhat";
  const expectedAdmin = singleWalletDev ? deployment.deployer : deployment.TimelockController;
  const addresses = [
    "GovernanceToken",
    "TimelockController",
    "PredictionGovernor",
    "MarketFactory",
    "UpgradeableFeeVaultProxy",
    "CollateralToken",
    "MockPriceFeed",
    "OutcomeToken",
    "OracleAdapter",
    "ResolutionManager",
    "PredictionMarket"
  ];

  for (const key of addresses) {
    assertCheck(ethers.isAddress(deployment[key]) && deployment[key] !== ethers.ZeroAddress, `${key} is non-zero`);
  }

  const token = await ethers.getContractAt("GovernanceToken", deployment.GovernanceToken);
  const governor = await ethers.getContractAt("PredictionGovernor", deployment.PredictionGovernor);
  const timelock = await ethers.getContractAt("TimelockController", deployment.TimelockController);
  const factory = await ethers.getContractAt("MarketFactory", deployment.MarketFactory);
  const vault = await ethers.getContractAt("UpgradeableFeeVaultV1", deployment.UpgradeableFeeVaultProxy);
  const outcomeToken = await ethers.getContractAt("OutcomeToken", deployment.OutcomeToken);
  const oracle = await ethers.getContractAt("OracleAdapter", deployment.OracleAdapter);
  const resolutionManager = await ethers.getContractAt("ResolutionManager", deployment.ResolutionManager);
  const predictionMarket = await ethers.getContractAt("PredictionMarket", deployment.PredictionMarket);

  assertCheck((await governor.votingDelay()) === 7_200n, "voting delay is 1 day at 12s blocks");
  assertCheck((await governor.votingPeriod()) === 50_400n, "voting period is 1 week at 12s blocks");
  assertCheck((await governor["quorumNumerator()"]()) === 4n, "quorum is 4%");
  assertCheck((await governor.proposalThreshold()) === (await token.totalSupply()) / 100n, "threshold is 1%");
  assertCheck((await timelock.getMinDelay()) === 2n * 24n * 60n * 60n, "timelock delay is 2 days");
  assertCheck((await token.owner()) === expectedAdmin, "governance token owner is expected admin");
  assertCheck((await factory.owner()) === expectedAdmin, "market factory owner is expected admin");
  assertCheck((await vault.owner()) === expectedAdmin, "vault owner is expected admin");
  assertCheck((await oracle.owner()) === expectedAdmin, "oracle adapter owner is expected admin");
  assertCheck((await predictionMarket.owner()) === expectedAdmin, "prediction market owner is expected admin");
  assertCheck(
    await outcomeToken.hasRole(await outcomeToken.DEFAULT_ADMIN_ROLE(), expectedAdmin),
    "expected admin administers outcome token roles"
  );
  assertCheck(
    await outcomeToken.hasRole(await outcomeToken.MINTER_ROLE(), deployment.PredictionMarket),
    "prediction market can mint outcome shares"
  );
  assertCheck(
    await outcomeToken.hasRole(await outcomeToken.BURNER_ROLE(), deployment.ResolutionManager),
    "resolution manager can burn outcome shares"
  );
  assertCheck(
    await resolutionManager.hasRole(await resolutionManager.DEFAULT_ADMIN_ROLE(), expectedAdmin),
    "expected admin administers resolution manager"
  );
  assertCheck(
    await resolutionManager.hasRole(await resolutionManager.MARKET_MANAGER_ROLE(), expectedAdmin),
    "expected admin controls market registration"
  );
  assertCheck(
    await resolutionManager.hasRole(await resolutionManager.RESOLVER_ROLE(), expectedAdmin),
    "expected admin controls resolution"
  );
  assertCheck(
    await resolutionManager.hasRole(await resolutionManager.DISPUTE_ADMIN_ROLE(), expectedAdmin),
    "expected admin controls dispute administration"
  );
  assertCheck((await predictionMarket.marketId()) === deployment.SampleMarketId, "sample market id matches deployment");
  const resolution = await resolutionManager.getResolution(deployment.SampleMarketId);
  assertCheck(resolution.closeTime > 0n, "sample market is registered for resolution");
  assertCheck(resolution.collateralToken === deployment.CollateralToken, "resolution collateral matches deployment");

  console.log("Post-deploy checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
