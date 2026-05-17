import { run, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function verify(address: string, constructorArguments: unknown[] = []) {
  try {
    await run("verify:verify", { address, constructorArguments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already verified")) {
      throw error;
    }
  }
}

async function main() {
  const deployment = JSON.parse(readFileSync(join("deployments", `${network.name}.json`), "utf8"));

  await verify(deployment.GovernanceToken, [deployment.deployer]);
  await verify(deployment.TimelockController, [2 * 24 * 60 * 60, [], [], deployment.deployer]);
  await verify(deployment.PredictionGovernor, [deployment.GovernanceToken, deployment.TimelockController]);
  await verify(deployment.MarketFactory, [deployment.TimelockController]);
  await verify(deployment.FeeAsset, ["Mock USD", "mUSD"]);
  await verify(deployment.CollateralToken, ["Prediction USD", "pUSD"]);
  await verify(deployment.MockPriceFeed, [8, 2500_00000000n]);
  await verify(deployment.OutcomeToken, ["ipfs://outcomes/{id}.json", deployment.deployer]);
  await verify(deployment.OracleAdapter, [deployment.MockPriceFeed, 3600, deployment.deployer]);
  await verify(deployment.ResolutionManager, [deployment.OutcomeToken, 60 * 60, deployment.deployer]);
  await verify(deployment.PredictionMarket, [
    deployment.CollateralToken,
    deployment.OutcomeToken,
    deployment.SampleMarketId,
    "Will ETH close above 5000 USD by Friday?",
    BigInt(deployment.SampleMarketCloseTime),
    30,
    deployment.TimelockController
  ]);
  await verify(deployment.UpgradeableFeeVaultImplementation, []);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
