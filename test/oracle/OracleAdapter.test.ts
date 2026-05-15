import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("OracleAdapter", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await MockV3Aggregator.deploy(8, 2500_00000000n);
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const adapter = await OracleAdapter.deploy(await feed.getAddress(), 3600, owner.address);
    return { adapter, feed, owner, other };
  }

  it("returns valid fresh price", async function () {
    const { adapter } = await loadFixture(deployFixture);

    const [price, updatedAt] = await adapter.getLatestAnswer();

    expect(price).to.equal(2500_00000000n);
    expect(updatedAt).to.be.greaterThan(0);
    expect(await adapter.isFresh()).to.equal(true);
  });

  it("reverts if price is zero or negative", async function () {
    const { adapter, feed } = await loadFixture(deployFixture);

    await feed.setAnswer(0);
    await expect(adapter.getLatestAnswer()).to.be.revertedWithCustomError(adapter, "InvalidOraclePrice");

    await feed.setAnswer(-1);
    await expect(adapter.getLatestAnswer()).to.be.revertedWithCustomError(adapter, "InvalidOraclePrice");
    expect(await adapter.isFresh()).to.equal(false);
  });

  it("reverts if updatedAt is zero", async function () {
    const { adapter, feed } = await loadFixture(deployFixture);

    await feed.setUpdatedAt(0);

    await expect(adapter.getLatestAnswer()).to.be.revertedWithCustomError(adapter, "StaleOraclePrice");
    expect(await adapter.isFresh()).to.equal(false);
  });

  it("reverts if updatedAt is too old", async function () {
    const { adapter, feed } = await loadFixture(deployFixture);
    const now = await time.latest();
    await feed.setUpdatedAt(now - 3601);

    await expect(adapter.getLatestAnswer()).to.be.revertedWithCustomError(adapter, "StaleOraclePrice");
    expect(await adapter.isFresh()).to.equal(false);
  });

  it("reverts if answeredInRound is behind roundId", async function () {
    const { adapter, feed } = await loadFixture(deployFixture);
    const now = await time.latest();
    await feed.setRoundData(10, 100, now, now, 9);

    await expect(adapter.getLatestAnswer()).to.be.revertedWithCustomError(adapter, "InvalidOracleRound");
    expect(await adapter.isFresh()).to.equal(false);
  });

  it("only owner can update stale period and feed", async function () {
    const { adapter, feed, owner, other } = await loadFixture(deployFixture);
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    const newFeed = await MockV3Aggregator.deploy(8, 3000_00000000n);

    await expect(adapter.connect(other).setStalePeriod(100)).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    await expect(adapter.connect(other).setFeed(await newFeed.getAddress())).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");

    await expect(adapter.connect(owner).setStalePeriod(100))
      .to.emit(adapter, "StalePeriodUpdated")
      .withArgs(3600, 100);

    await expect(adapter.connect(owner).setFeed(await newFeed.getAddress()))
      .to.emit(adapter, "FeedUpdated")
      .withArgs(await feed.getAddress(), await newFeed.getAddress());
  });

  it("rejects invalid admin updates", async function () {
    const { adapter, owner } = await loadFixture(deployFixture);

    await expect(adapter.connect(owner).setStalePeriod(0)).to.be.revertedWithCustomError(adapter, "InvalidStalePeriod");
    await expect(adapter.connect(owner).setFeed(ethers.ZeroAddress)).to.be.revertedWithCustomError(adapter, "InvalidFeed");
  });
});
