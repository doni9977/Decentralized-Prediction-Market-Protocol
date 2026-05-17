import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

function assertCheck(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Frontend flow check failed: ${message}`);
  }
}

async function main() {
  const deployment = JSON.parse(readFileSync(join("deployments", `${network.name}.json`), "utf8"));
  const [user] = await ethers.getSigners();

  const collateral = await ethers.getContractAt("MockERC20", deployment.CollateralToken);
  const factory = await ethers.getContractAt("MarketFactory", deployment.MarketFactory);
  const market = await ethers.getContractAt("PredictionMarket", deployment.PredictionMarket);
  const resolutionManager = await ethers.getContractAt("ResolutionManager", deployment.ResolutionManager);

  const created = await factory.createMarket(
    "Frontend flow smoke market",
    BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
    deployment.CollateralToken,
    deployment.OracleAdapter,
    30
  );
  await created.wait();

  const marketAddress = await market.getAddress();
  const resolutionAddress = await resolutionManager.getAddress();
  const liquidityAmount = ethers.parseEther("100");
  const buyAmount = ethers.parseEther("10");
  const payoutFunding = ethers.parseEther("25");

  await (await collateral.approve(marketAddress, liquidityAmount + buyAmount)).wait();
  assertCheck((await collateral.allowance(user.address, marketAddress)) >= liquidityAmount + buyAmount, "market approval works");

  await (await market.addLiquidity(liquidityAmount)).wait();
  assertCheck((await market.totalLiquidity()) >= liquidityAmount, "add liquidity works");

  const quote = await market.quoteBuy(1, buyAmount);
  await (await market.buyOutcome(1, buyAmount, quote)).wait();
  assertCheck((await market.collectedFees()) > 0n, "buy outcome works");

  await (await collateral.approve(resolutionAddress, payoutFunding)).wait();
  assertCheck((await collateral.allowance(user.address, resolutionAddress)) >= payoutFunding, "resolution approval works");

  await (await resolutionManager.depositCollateral(deployment.SampleMarketId, payoutFunding)).wait();
  assertCheck(await collateral.balanceOf(resolutionAddress) >= payoutFunding, "payout funding works");

  const resolverRole = await resolutionManager.RESOLVER_ROLE();
  const hasResolverRole = await resolutionManager.hasRole(resolverRole, user.address);
  assertCheck(!hasResolverRole, "resolver-only UI actions are correctly privileged for this deployment");

  console.log("Frontend flow checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
