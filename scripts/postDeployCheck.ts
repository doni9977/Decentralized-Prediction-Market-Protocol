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
  const addresses = [
    "GovernanceToken",
    "TimelockController",
    "PredictionGovernor",
    "MarketFactory",
    "UpgradeableFeeVaultProxy"
  ];

  for (const key of addresses) {
    assertCheck(ethers.isAddress(deployment[key]) && deployment[key] !== ethers.ZeroAddress, `${key} is non-zero`);
  }

  const token = await ethers.getContractAt("GovernanceToken", deployment.GovernanceToken);
  const governor = await ethers.getContractAt("PredictionGovernor", deployment.PredictionGovernor);
  const timelock = await ethers.getContractAt("TimelockController", deployment.TimelockController);
  const factory = await ethers.getContractAt("MarketFactory", deployment.MarketFactory);
  const vault = await ethers.getContractAt("UpgradeableFeeVaultV1", deployment.UpgradeableFeeVaultProxy);

  assertCheck((await governor.votingDelay()) === 7_200n, "voting delay is 1 day at 12s blocks");
  assertCheck((await governor.votingPeriod()) === 50_400n, "voting period is 1 week at 12s blocks");
  assertCheck((await governor["quorumNumerator()"]()) === 4n, "quorum is 4%");
  assertCheck((await governor.proposalThreshold()) === (await token.totalSupply()) / 100n, "threshold is 1%");
  assertCheck((await timelock.getMinDelay()) === 2n * 24n * 60n * 60n, "timelock delay is 2 days");
  assertCheck((await token.owner()) === deployment.TimelockController, "timelock owns token minting");
  assertCheck((await factory.owner()) === deployment.TimelockController, "timelock owns factory");
  assertCheck((await vault.owner()) === deployment.TimelockController, "timelock owns vault upgrades/withdrawals");

  console.log("Post-deploy checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
