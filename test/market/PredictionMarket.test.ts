import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

describe("PredictionMarket", function () {
  async function deployFixture() {
    const [owner, lp, trader] = await ethers.getSigners();
    const collateralAmount = ethers.parseEther("10000");

    const Collateral = await ethers.getContractFactory("MockERC20");
    const collateral = await Collateral.deploy("Mock USD", "mUSD");

    const OutcomeToken = await ethers.getContractFactory("MockOutcomeToken");
    const outcomeToken = await OutcomeToken.deploy();

    await collateral.mint(lp.address, collateralAmount);
    await collateral.mint(trader.address, collateralAmount);

    const closeTime = (await time.latest()) + 7 * 24 * 60 * 60;
    const marketId = ethers.id("ETH above 5000 by Friday");
    const Market = await ethers.getContractFactory("PredictionMarket");
    const market = await Market.deploy(
      await collateral.getAddress(),
      await outcomeToken.getAddress(),
      marketId,
      "Will ETH be above 5000 USD by Friday?",
      closeTime,
      30,
      owner.address
    );

    await collateral.connect(lp).approve(await market.getAddress(), collateralAmount);
    await collateral.connect(trader).approve(await market.getAddress(), collateralAmount);

    return { owner, lp, trader, collateral, outcomeToken, market, marketId, closeTime };
  }

  it("adds liquidity and initializes both pricing reserves", async function () {
    const { lp, market } = await deployFixture();
    const amount = ethers.parseEther("1000");

    await expect(market.connect(lp).addLiquidity(amount))
      .to.emit(market, "LiquidityAdded")
      .withArgs(await market.marketId(), lp.address, amount, amount, amount, amount);

    expect(await market.yesReserve()).to.equal(amount);
    expect(await market.noReserve()).to.equal(amount);
    expect(await market.totalLiquidity()).to.equal(amount);
    expect(await market.liquidityBalanceOf(lp.address)).to.equal(amount);
  });

  it("quotes and buys YES outcome shares", async function () {
    const { lp, trader, market, outcomeToken, marketId } = await deployFixture();
    await market.connect(lp).addLiquidity(ethers.parseEther("1000"));

    const collateralIn = ethers.parseEther("100");
    const quote = await market.quoteBuy(1, collateralIn);

    await expect(market.connect(trader).buyOutcome(1, collateralIn, quote))
      .to.emit(market, "OutcomePurchased");

    const yesTokenId = await outcomeToken.outcomeTokenId(marketId, 1);
    expect(await outcomeToken.balanceOf(trader.address, yesTokenId)).to.equal(quote);
    expect(await market.collectedFees()).to.equal(ethers.parseEther("0.3"));
  });

  it("reverts when slippage protection is exceeded", async function () {
    const { lp, trader, market } = await deployFixture();
    await market.connect(lp).addLiquidity(ethers.parseEther("1000"));

    const quote = await market.quoteBuy(1, ethers.parseEther("100"));
    await expect(
      market.connect(trader).buyOutcome(1, ethers.parseEther("100"), quote + 1n)
    ).to.be.revertedWithCustomError(market, "SlippageExceeded");
  });

  it("keeps the constant product invariant from decreasing after a buy", async function () {
    const { lp, trader, market } = await deployFixture();
    await market.connect(lp).addLiquidity(ethers.parseEther("1000"));

    const oldK = (await market.yesReserve()) * (await market.noReserve());
    await market.connect(trader).buyOutcome(2, ethers.parseEther("125"), 1);
    const newK = (await market.yesReserve()) * (await market.noReserve());

    expect(newK).to.be.greaterThanOrEqual(oldK);
  });

  it("removes liquidity proportionally", async function () {
    const { lp, market } = await deployFixture();
    const amount = ethers.parseEther("1000");
    await market.connect(lp).addLiquidity(amount);

    await expect(market.connect(lp).removeLiquidity(ethers.parseEther("400")))
      .to.emit(market, "LiquidityRemoved");

    expect(await market.totalLiquidity()).to.equal(ethers.parseEther("600"));
    expect(await market.liquidityBalanceOf(lp.address)).to.equal(ethers.parseEther("600"));
  });

  it("does not allow buying after market close time", async function () {
    const { lp, trader, market, closeTime } = await deployFixture();
    await market.connect(lp).addLiquidity(ethers.parseEther("1000"));
    await time.increaseTo(closeTime);

    await expect(
      market.connect(trader).buyOutcome(1, ethers.parseEther("10"), 1)
    ).to.be.revertedWithCustomError(market, "MarketClosed");
  });

  it("allows only owner to update the fee", async function () {
    const { owner, trader, market } = await deployFixture();

    await expect(market.connect(trader).setFeeBps(50))
      .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");

    await expect(market.connect(owner).setFeeBps(50))
      .to.emit(market, "FeeUpdated")
      .withArgs(30, 50);
  });

  it("rejects invalid constructor parameters", async function () {
    const { owner, collateral, outcomeToken, closeTime } = await deployFixture();
    const Market = await ethers.getContractFactory("PredictionMarket");
    const marketId = ethers.id("invalid-market");

    await expect(
      Market.deploy(
        ethers.ZeroAddress,
        await outcomeToken.getAddress(),
        marketId,
        "Question?",
        closeTime,
        30,
        owner.address
      )
    ).to.be.revertedWithCustomError(Market, "InvalidAmount");

    await expect(
      Market.deploy(
        await collateral.getAddress(),
        await outcomeToken.getAddress(),
        marketId,
        "",
        closeTime,
        30,
        owner.address
      )
    ).to.be.revertedWithCustomError(Market, "InvalidQuestion");

    await expect(
      Market.deploy(
        await collateral.getAddress(),
        await outcomeToken.getAddress(),
        marketId,
        "Question?",
        await time.latest(),
        30,
        owner.address
      )
    ).to.be.revertedWithCustomError(Market, "InvalidCloseTime");

    await expect(
      Market.deploy(
        await collateral.getAddress(),
        await outcomeToken.getAddress(),
        marketId,
        "Question?",
        closeTime,
        10_000,
        owner.address
      )
    ).to.be.revertedWithCustomError(Market, "InvalidFee");
  });

  it("rejects zero liquidity and liquidity after close", async function () {
    const { lp, market, closeTime } = await deployFixture();

    await expect(market.connect(lp).addLiquidity(0)).to.be.revertedWithCustomError(market, "InvalidAmount");

    await time.increaseTo(closeTime);
    await expect(market.connect(lp).addLiquidity(ethers.parseEther("1"))).to.be.revertedWithCustomError(
      market,
      "MarketClosed"
    );
  });

  it("rejects invalid buys and invalid quotes", async function () {
    const { lp, trader, market } = await deployFixture();

    await expect(market.quoteBuy(3, ethers.parseEther("1"))).to.be.revertedWithCustomError(market, "InvalidOutcome");
    await expect(market.connect(trader).buyOutcome(3, ethers.parseEther("1"), 1)).to.be.revertedWithCustomError(
      market,
      "InvalidOutcome"
    );
    await expect(market.connect(trader).buyOutcome(1, 0, 1)).to.be.revertedWithCustomError(market, "InvalidAmount");
    await expect(market.connect(trader).buyOutcome(1, ethers.parseEther("1"), 1)).to.be.revertedWithCustomError(
      market,
      "InsufficientLiquidity"
    );

    await market.connect(lp).addLiquidity(ethers.parseEther("10"));
    expect(await market.quoteBuy(2, ethers.parseEther("1"))).to.be.greaterThan(0);
  });

  it("rejects invalid liquidity removal", async function () {
    const { lp, trader, market } = await deployFixture();
    await market.connect(lp).addLiquidity(ethers.parseEther("10"));

    await expect(market.connect(lp).removeLiquidity(0)).to.be.revertedWithCustomError(market, "InvalidAmount");
    await expect(market.connect(trader).removeLiquidity(1)).to.be.revertedWithCustomError(
      market,
      "InsufficientLiquidity"
    );
  });

  it("rejects invalid fee updates", async function () {
    const { owner, market } = await deployFixture();

    await expect(market.connect(owner).setFeeBps(10_000)).to.be.revertedWithCustomError(market, "InvalidFee");
  });
});
