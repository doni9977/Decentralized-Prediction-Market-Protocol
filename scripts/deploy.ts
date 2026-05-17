import { ethers, network, upgrades } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const TIMELOCK_DELAY = 2 * 24 * 60 * 60;
const DISPUTE_WINDOW = 60 * 60;
const SAMPLE_MARKET_FEE_BPS = 30;
const SAMPLE_PAYOUT_PER_SHARE = ethers.parseEther("1");

async function main() {
  const [deployer] = await ethers.getSigners();
  const singleWalletDev =
    process.env.SINGLE_WALLET_DEV === "1" || network.name === "localhost" || network.name === "hardhat";
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
  const adminOwner = singleWalletDev ? deployer.address : await timelock.getAddress();

  const PredictionGovernor = await ethers.getContractFactory("PredictionGovernor");
  const governor = await PredictionGovernor.deploy(await token.getAddress(), await timelock.getAddress());
  await governor.waitForDeployment();
  deployment.PredictionGovernor = await governor.getAddress();

  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = await MarketFactory.deploy(adminOwner);
  await factory.waitForDeployment();
  deployment.MarketFactory = await factory.getAddress();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const feeAsset = await MockERC20.deploy("Mock USD", "mUSD");
  await feeAsset.waitForDeployment();
  deployment.FeeAsset = await feeAsset.getAddress();

  const collateral = await MockERC20.deploy("Prediction USD", "pUSD");
  await collateral.waitForDeployment();
  deployment.CollateralToken = await collateral.getAddress();

  const seedCollateral = ethers.parseEther("1000000");
  await (await collateral.mint(deployer.address, seedCollateral)).wait();

  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
  const feed = await MockV3Aggregator.deploy(8, 2500_00000000n);
  await feed.waitForDeployment();
  deployment.MockPriceFeed = await feed.getAddress();

  const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
  const outcomeToken = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", deployer.address);
  await outcomeToken.waitForDeployment();
  deployment.OutcomeToken = await outcomeToken.getAddress();

  const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
  const oracle = await OracleAdapter.deploy(await feed.getAddress(), 3600, adminOwner);
  await oracle.waitForDeployment();
  deployment.OracleAdapter = await oracle.getAddress();

  const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
  const resolutionManager = await ResolutionManager.deploy(await outcomeToken.getAddress(), DISPUTE_WINDOW, deployer.address);
  await resolutionManager.waitForDeployment();
  deployment.ResolutionManager = await resolutionManager.getAddress();

  const latestBlock = await ethers.provider.getBlock("latest");
  const sampleCloseTime = BigInt(latestBlock!.timestamp + 7 * 24 * 60 * 60);
  const sampleMarketId = ethers.id(`sample:${network.name}:${deployment.chainId}`);
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await PredictionMarket.deploy(
    await collateral.getAddress(),
    await outcomeToken.getAddress(),
    sampleMarketId,
    "Will ETH close above 5000 USD by Friday?",
    sampleCloseTime,
    SAMPLE_MARKET_FEE_BPS,
    adminOwner
  );
  await predictionMarket.waitForDeployment();
  deployment.PredictionMarket = await predictionMarket.getAddress();
  deployment.SampleMarketId = sampleMarketId;
  deployment.SampleMarketCloseTime = sampleCloseTime.toString();

  await (await outcomeToken.grantRole(await outcomeToken.MINTER_ROLE(), await predictionMarket.getAddress())).wait();
  await (await outcomeToken.grantRole(await outcomeToken.BURNER_ROLE(), await resolutionManager.getAddress())).wait();
  await (
    await resolutionManager.registerMarket(
      sampleMarketId,
      sampleCloseTime,
      await collateral.getAddress(),
      SAMPLE_PAYOUT_PER_SHARE
    )
  ).wait();

  const VaultV1 = await ethers.getContractFactory("UpgradeableFeeVaultV1");
  const vault = await upgrades.deployProxy(VaultV1, [adminOwner, await feeAsset.getAddress()], {
    kind: "uups",
    initializer: "initialize"
  });
  await vault.waitForDeployment();
  deployment.UpgradeableFeeVaultProxy = await vault.getAddress();
  deployment.UpgradeableFeeVaultImplementation = await upgrades.erc1967.getImplementationAddress(await vault.getAddress());

  if (!singleWalletDev) {
    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
    await (await timelock.grantRole(proposerRole, await governor.getAddress())).wait();
    await (await timelock.grantRole(executorRole, ethers.ZeroAddress)).wait();

    await (await oracle.transferOwnership(await timelock.getAddress())).wait();
    await (await outcomeToken.grantRole(await outcomeToken.DEFAULT_ADMIN_ROLE(), await timelock.getAddress())).wait();
    await (await resolutionManager.grantRole(await resolutionManager.DEFAULT_ADMIN_ROLE(), await timelock.getAddress())).wait();
    await (await resolutionManager.grantRole(await resolutionManager.MARKET_MANAGER_ROLE(), await timelock.getAddress())).wait();
    await (await resolutionManager.grantRole(await resolutionManager.RESOLVER_ROLE(), await timelock.getAddress())).wait();
    await (await resolutionManager.grantRole(await resolutionManager.DISPUTE_ADMIN_ROLE(), await timelock.getAddress())).wait();
    await (await outcomeToken.renounceRole(await outcomeToken.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();
    await (await outcomeToken.renounceRole(await outcomeToken.MINTER_ROLE(), deployer.address)).wait();
    await (await outcomeToken.renounceRole(await outcomeToken.BURNER_ROLE(), deployer.address)).wait();
    await (await resolutionManager.renounceRole(await resolutionManager.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();
    await (await resolutionManager.renounceRole(await resolutionManager.MARKET_MANAGER_ROLE(), deployer.address)).wait();
    await (await resolutionManager.renounceRole(await resolutionManager.RESOLVER_ROLE(), deployer.address)).wait();
    await (await resolutionManager.renounceRole(await resolutionManager.DISPUTE_ADMIN_ROLE(), deployer.address)).wait();
    await (await token.transferOwnership(await timelock.getAddress())).wait();
    await (await timelock.revokeRole(adminRole, deployer.address)).wait();
  }

  mkdirSync("deployments", { recursive: true });
  const file = join("deployments", `${network.name}.json`);
  writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`);
  mkdirSync(join("frontend", "public", "deployments"), { recursive: true });
  const frontendFile = join("frontend", "public", "deployments", `${network.name}.json`);
  writeFileSync(frontendFile, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Deployment saved to ${file}`);
  console.log(`Frontend deployment saved to ${frontendFile}`);
  console.log(deployment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
