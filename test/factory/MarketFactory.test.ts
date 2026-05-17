import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("MarketFactory", function () {
  async function deployFactoryFixture() {
    const [owner, creator, collateral, oracle] = await ethers.getSigners();
    const MarketFactory = await ethers.getContractFactory("MarketFactory");
    const factory = await MarketFactory.deploy(owner.address);
    const closeTime = BigInt((await time.latest()) + 86_400);

    return { factory, owner, creator, collateral, oracle, closeTime };
  }

  it("deploys a market using CREATE", async function () {
    const { factory, creator, collateral, oracle, closeTime } = await deployFactoryFixture();

    const tx = await factory
      .connect(creator)
      .createMarket("Will ETH close above 5000 USD?", closeTime, collateral.address, oracle.address, 100);

    await expect(tx).to.emit(factory, "MarketCreated");
  });

  it("deploys CREATE2 market at predicted address", async function () {
    const { factory, creator, collateral, oracle, closeTime } = await deployFactoryFixture();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("eth-5000-market"));
    const predicted = await factory.predictMarketAddress(
      "Will ETH close above 5000 USD?",
      closeTime,
      collateral.address,
      oracle.address,
      100,
      creator.address,
      salt
    );

    await expect(
      factory
        .connect(creator)
        .createMarketDeterministic("Will ETH close above 5000 USD?", closeTime, collateral.address, oracle.address, 100, salt)
    )
      .to.emit(factory, "DeterministicMarketCreated")
      .withArgs(anyValue, predicted, salt);

    expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");
  });

  it("reverts on duplicate salt", async function () {
    const { factory, creator, collateral, oracle, closeTime } = await deployFactoryFixture();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("duplicate"));

    await factory
      .connect(creator)
      .createMarketDeterministic("Question?", closeTime, collateral.address, oracle.address, 100, salt);

    await expect(
      factory
        .connect(creator)
        .createMarketDeterministic("Question?", closeTime, collateral.address, oracle.address, 100, salt)
    ).to.be.revertedWithCustomError(factory, "SaltAlreadyUsed");
  });

  it("reverts invalid parameters", async function () {
    const { factory, creator, collateral, oracle, closeTime } = await deployFactoryFixture();

    await expect(
      factory.connect(creator).createMarket("", closeTime, collateral.address, oracle.address, 100)
    ).to.be.revertedWithCustomError(factory, "EmptyQuestion");

    await expect(
      factory.connect(creator).createMarket("Question?", BigInt(await time.latest()), collateral.address, oracle.address, 100)
    ).to.be.revertedWithCustomError(factory, "InvalidCloseTime");

    await expect(
      factory.connect(creator).createMarket("Question?", closeTime, ethers.ZeroAddress, oracle.address, 100)
    ).to.be.revertedWithCustomError(factory, "ZeroAddress");

    await expect(
      factory.connect(creator).createMarket("Question?", closeTime, collateral.address, oracle.address, 1001)
    ).to.be.revertedWithCustomError(factory, "FeeTooHigh");
  });

  it("records deployed market addresses by emitted market id", async function () {
    const { factory, creator, collateral, oracle, closeTime } = await deployFactoryFixture();

    const tx = await factory
      .connect(creator)
      .createMarket("Will BTC close above 100000 USD?", closeTime, collateral.address, oracle.address, 75);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "MarketCreated");

    const marketId = event!.args.marketId;
    const marketAddress = event!.args.market;

    expect(await factory.markets(marketId)).to.equal(marketAddress);
  });

  it("rejects zero oracle addresses for deterministic markets", async function () {
    const { factory, creator, collateral, closeTime } = await deployFactoryFixture();
    const salt = ethers.id("zero-oracle");

    await expect(
      factory
        .connect(creator)
        .createMarketDeterministic("Question?", closeTime, collateral.address, ethers.ZeroAddress, 100, salt)
    ).to.be.revertedWithCustomError(factory, "ZeroAddress");
  });
});
