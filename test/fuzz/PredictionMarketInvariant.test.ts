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

  it("fuzz invariant: quoted shares stay below the selected outcome reserve", async function () {
    const { lp, trader, market } = await deployFixture();

    await market.connect(lp).addLiquidity(20_000n * ONE);

    for (let i = 0; i < 20; i += 1) {
      const outcome = Math.random() < 0.5 ? 1 : 2;
      const collateralIn = randomWei(25);
      const reserveBefore = outcome === 1 ? await market.yesReserve() : await market.noReserve();
      const quote = await market.quoteBuy(outcome, collateralIn);

      expect(quote).to.be.greaterThan(0);
      expect(quote).to.be.lessThan(reserveBefore);

      await market.connect(trader).buyOutcome(outcome, collateralIn, quote);
    }
  });

  it("fuzz invariant: collected fees equal the sum of random buy fees", async function () {
    const { lp, trader, market } = await deployFixture();

    await market.connect(lp).addLiquidity(20_000n * ONE);

    let expectedFees = 0n;
    for (let i = 0; i < 20; i += 1) {
      const outcome = Math.random() < 0.5 ? 1 : 2;
      const collateralIn = randomWei(40);
      const quote = await market.quoteBuy(outcome, collateralIn);

      await market.connect(trader).buyOutcome(outcome, collateralIn, quote);
      expectedFees += (collateralIn * 30n) / 10_000n;

      expect(await market.collectedFees()).to.equal(expectedFees);
    }
  });

  it("fuzz invariant: trader collateral decreases by exactly the random buy inputs", async function () {
    const { lp, trader, collateral, market } = await deployFixture();

    await market.connect(lp).addLiquidity(20_000n * ONE);

    const startingBalance = await collateral.balanceOf(trader.address);
    let totalSpent = 0n;

    for (let i = 0; i < 20; i += 1) {
      const outcome = Math.random() < 0.5 ? 1 : 2;
      const collateralIn = randomWei(30);
      const quote = await market.quoteBuy(outcome, collateralIn);

      await market.connect(trader).buyOutcome(outcome, collateralIn, quote);
      totalSpent += collateralIn;

      expect(startingBalance - (await collateral.balanceOf(trader.address))).to.equal(totalSpent);
    }
  });

  it("fuzz invariant: liquidity accounting tracks random add and remove operations", async function () {
    const { lp, market } = await deployFixture();

    let expectedLiquidity = 0n;

    for (let i = 0; i < 20; i += 1) {
      const shouldAdd = expectedLiquidity === 0n || Math.random() < 0.7;

      if (shouldAdd) {
        const amount = randomWei(100);
        await market.connect(lp).addLiquidity(amount);
        expectedLiquidity += amount;
      } else {
        const removeAmount = (expectedLiquidity * BigInt(Math.floor(Math.random() * 40) + 1)) / 100n;
        if (removeAmount > 0n) {
          await market.connect(lp).removeLiquidity(removeAmount);
          expectedLiquidity -= removeAmount;
        }
      }

      expect(await market.totalLiquidity()).to.equal(expectedLiquidity);
      expect(await market.liquidityBalanceOf(lp.address)).to.equal(expectedLiquidity);
    }
  });

  it("fuzz invariant: market collateral balance equals LP deposits plus trader inputs minus LP withdrawals", async function () {
    const { lp, trader, collateral, market } = await deployFixture();

    let expectedMarketBalance = 0n;

    for (let i = 0; i < 20; i += 1) {
      const shouldAddLiquidity = (await market.totalLiquidity()) === 0n || Math.random() < 0.45;

      if (shouldAddLiquidity) {
        const amount = randomWei(80);
        await market.connect(lp).addLiquidity(amount);
        expectedMarketBalance += amount;
      } else if (Math.random() < 0.65) {
        const outcome = Math.random() < 0.5 ? 1 : 2;
        const collateralIn = randomWei(20);
        const quote = await market.quoteBuy(outcome, collateralIn);
        await market.connect(trader).buyOutcome(outcome, collateralIn, quote);
        expectedMarketBalance += collateralIn;
      } else {
        const liquidity = await market.liquidityBalanceOf(lp.address);
        const totalLiquidity = await market.totalLiquidity();
        if (liquidity > 0n && totalLiquidity > 0n) {
          const removeAmount = (liquidity * BigInt(Math.floor(Math.random() * 25) + 1)) / 100n;
          if (removeAmount > 0n) {
            const balanceBefore = await collateral.balanceOf(await market.getAddress());
            const expectedWithdrawal = (balanceBefore * removeAmount) / totalLiquidity;
            await market.connect(lp).removeLiquidity(removeAmount);
            expectedMarketBalance -= expectedWithdrawal;
          }
        }
      }

      expect(await collateral.balanceOf(await market.getAddress())).to.equal(expectedMarketBalance);
    }
  });
});
