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
  await verify(deployment.FeeAsset, []);
  await verify(deployment.UpgradeableFeeVaultImplementation, []);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
