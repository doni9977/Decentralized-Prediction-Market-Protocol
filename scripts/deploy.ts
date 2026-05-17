import { ethers, network, upgrades } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const TIMELOCK_DELAY = 2 * 24 * 60 * 60;

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployment: Record<string, unknown> = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString()
  };

  const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
  const token = await GovernanceToken.deploy(deployer.address);
  await token.waitForDeployment();
  deployment.GovernanceToken = await token.getAddress();

  const airdropRecipients = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  ];
  const airdropAmount = ethers.parseEther("1000");

  for (const recipient of airdropRecipients) {
    await (await token.transfer(recipient, airdropAmount)).wait();
  }

  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(TIMELOCK_DELAY, [], [], deployer.address);
  await timelock.waitForDeployment();
  deployment.TimelockController = await timelock.getAddress();

  const PredictionGovernor = await ethers.getContractFactory("PredictionGovernor");
  const governor = await PredictionGovernor.deploy(await token.getAddress(), await timelock.getAddress());
  await governor.waitForDeployment();
  deployment.PredictionGovernor = await governor.getAddress();

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(await timelock.getAddress());
  await factory.waitForDeployment();
  deployment.MarketFactory = await factory.getAddress();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const feeAsset = await MockERC20.deploy("Mock USD", "mUSD");
  await feeAsset.waitForDeployment();
  deployment.FeeAsset = await feeAsset.getAddress();

  const VaultV1 = await ethers.getContractFactory("UpgradeableFeeVaultV1");
  const vault = await upgrades.deployProxy(VaultV1, [await timelock.getAddress(), await feeAsset.getAddress()], {
    kind: "uups",
    initializer: "initialize"
  });
  await vault.waitForDeployment();
  deployment.UpgradeableFeeVaultProxy = await vault.getAddress();
  deployment.UpgradeableFeeVaultImplementation = await upgrades.erc1967.getImplementationAddress(await vault.getAddress());

  const proposerRole = await timelock.PROPOSER_ROLE();
  const executorRole = await timelock.EXECUTOR_ROLE();
  const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.grantRole(proposerRole, await governor.getAddress())).wait();
  await (await timelock.grantRole(executorRole, ethers.ZeroAddress)).wait();
  await (await token.transferOwnership(await timelock.getAddress())).wait();
  await (await timelock.revokeRole(adminRole, deployer.address)).wait();

  mkdirSync("deployments", { recursive: true });
  const file = join("deployments", `${network.name}.json`);
  writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Deployment saved to ${file}`);
  console.log(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});