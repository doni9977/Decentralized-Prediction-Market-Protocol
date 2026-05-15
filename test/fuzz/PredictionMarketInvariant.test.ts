import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PredictionMarket invariants", function () {
  const ONE = 10n ** 18n;

  function randomWei(maxUnits: number): bigint {
    return BigInt(Math.floor(Math.random() * maxUnits) + 1) * ONE;
  }

  async function deployFixture() {
    const [owner, lp, trader] = await ethers.getSigners();
    const collateralAmount = 1_000_000n * ONE;

    const Collateral = await ethers.getContractFactory("MockERC20");
    const collateral = await Collateral.deploy("Mock USD", "mUSD");

    const OutcomeToken = await ethers.getContractFactory("MockOutcomeToken");
    const outcomeToken = await OutcomeToken.deploy();

    await collateral.mint(lp.address, collateralAmount);
    await collateral.mint(trader.address, collateralAmount);

    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;
    const marketId = ethers.id("Invariant test market");
    const Market = await ethers.getContractFactory("PredictionMarket");
    const market = await Market.deploy(
      await collateral.getAddress(),
      await outcomeToken.getAddress(),
      marketId,
      "Invariant test market",
      closeTime,
      30,
      owner.address
    );

    await collateral.connect(lp).approve(await market.getAddress(), collateralAmount);
    await collateral.connect(trader).approve(await market.getAddress(), collateralAmount);

    return { lp, trader, collateral, market };
  }

  it("keeps constant product from decreasing across random buys", async function () {
    const { lp, trader, market } = await deployFixture();

    await market.connect(lp).addLiquidity(10_000n * ONE);

    for (let i = 0; i < 20; i += 1) {
      const outcome = Math.random() < 0.5 ? 1 : 2;
      const collateralIn = randomWei(50);

      const oldK = (await market.yesReserve()) * (await market.noReserve());
      const quote = await market.quoteBuy(outcome, collateralIn);
      await market.connect(trader).buyOutcome(outcome, collateralIn, quote);
      const newK = (await market.yesReserve()) * (await market.noReserve());

      expect(newK).to.be.greaterThanOrEqual(oldK);
    }
  });
});
