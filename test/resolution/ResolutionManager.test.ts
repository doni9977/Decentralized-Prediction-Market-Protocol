import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("ResolutionManager", function () {
  async function deployFixture() {
    const [admin, resolver, disputer, user] = await ethers.getSigners();
    const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
    const outcomeToken = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", admin.address);

    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const manager = await ResolutionManager.deploy(await outcomeToken.getAddress(), 3600, admin.address);

    await outcomeToken.grantRole(await outcomeToken.BURNER_ROLE(), await manager.getAddress());
    await manager.grantRole(await manager.RESOLVER_ROLE(), resolver.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateral = await MockERC20.deploy("Mock USDC", "mUSDC");
    const marketId = ethers.id("market:btc-100k");
    const closeTime = (await time.latest()) + 100;
    const payoutPerShare = ethers.parseEther("1");

    await manager.registerMarket(marketId, closeTime, await collateral.getAddress(), payoutPerShare);
    return { admin, resolver, disputer, user, outcomeToken, manager, collateral, marketId, closeTime, payoutPerShare };
  }

  it("cannot resolve before closeTime", async function () {
    const { manager, resolver, marketId } = await loadFixture(deployFixture);

    await expect(manager.connect(resolver).resolveMarket(marketId, 1))
      .to.be.revertedWithCustomError(manager, "MarketNotClosed");
  });

  it("authorized resolver can resolve after closeTime", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);

    await expect(manager.connect(resolver).resolveMarket(marketId, 1))
      .to.emit(manager, "MarketResolved");

    const resolution = await manager.getResolution(marketId);
    expect(resolution.outcome).to.equal(1);
    expect(resolution.resolved).to.equal(true);
  });

  it("oracle price >= threshold resolves YES", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await MockV3Aggregator.deploy(8, 2500_00000000n);
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const adapter = await OracleAdapter.deploy(await feed.getAddress(), 3600, resolver.address);

    await time.increaseTo(closeTime);

    await expect(manager.connect(resolver).resolveMarketFromOracle(marketId, await adapter.getAddress(), 2000_00000000n))
      .to.emit(manager, "MarketResolved");

    const resolution = await manager.getResolution(marketId);
    expect(resolution.outcome).to.equal(1);
  });

  it("oracle price < threshold resolves NO", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await MockV3Aggregator.deploy(8, 1500_00000000n);
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const adapter = await OracleAdapter.deploy(await feed.getAddress(), 3600, resolver.address);

    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarketFromOracle(marketId, await adapter.getAddress(), 2000_00000000n);

    const resolution = await manager.getResolution(marketId);
    expect(resolution.outcome).to.equal(2);
  });

  it("stale oracle reverts and market stays unresolved", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await MockV3Aggregator.deploy(8, 2500_00000000n);
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const adapter = await OracleAdapter.deploy(await feed.getAddress(), 3600, resolver.address);
    const now = await time.latest();
    await feed.setUpdatedAt(now - 3601);

    await time.increaseTo(closeTime);

    await expect(manager.connect(resolver).resolveMarketFromOracle(marketId, await adapter.getAddress(), 2000_00000000n))
      .to.be.revertedWithCustomError(adapter, "StaleOraclePrice");

    const resolution = await manager.getResolution(marketId);
    expect(resolution.resolved).to.equal(false);
  });

  it("unauthorized user cannot call oracle resolve", async function () {
    const { manager, user, marketId, closeTime } = await loadFixture(deployFixture);
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    const feed = await MockV3Aggregator.deploy(8, 2500_00000000n);
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const adapter = await OracleAdapter.deploy(await feed.getAddress(), 3600, user.address);

    await time.increaseTo(closeTime);

    await expect(manager.connect(user).resolveMarketFromOracle(marketId, await adapter.getAddress(), 2000_00000000n))
      .to.be.revertedWithCustomError(manager, "UnauthorizedResolver");
  });

  it("unauthorized user cannot resolve", async function () {
    const { manager, user, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);

    await expect(manager.connect(user).resolveMarket(marketId, 1))
      .to.be.revertedWithCustomError(manager, "UnauthorizedResolver");
  });

  it("cannot finalize before dispute window ends", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 2);

    await expect(manager.finalizeResolution(marketId))
      .to.be.revertedWithCustomError(manager, "DisputeWindowActive");
  });

  it("can finalize after dispute window", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 2);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);

    await expect(manager.finalizeResolution(marketId))
      .to.emit(manager, "ResolutionFinalized")
      .withArgs(marketId, 2);
  });

  it("cannot change finalized market", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 1);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);
    await manager.finalizeResolution(marketId);

    await expect(manager.changeResolution(marketId, 2))
      .to.be.revertedWithCustomError(manager, "MarketAlreadyFinalized");
  });

  it("dispute can be opened during dispute window", async function () {
    const { manager, resolver, disputer, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 1);

    await expect(manager.connect(disputer).startDispute(marketId, "oracle source mismatch"))
      .to.emit(manager, "ResolutionDisputed")
      .withArgs(marketId, disputer.address, "oracle source mismatch");
  });

  it("dispute cannot be opened after dispute window", async function () {
    const { manager, resolver, disputer, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 1);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);

    await expect(manager.connect(disputer).startDispute(marketId, "late"))
      .to.be.revertedWithCustomError(manager, "DisputeWindowExpired");
  });

  it("dispute admin can change disputed outcome", async function () {
    const { manager, resolver, disputer, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 1);
    await manager.connect(disputer).startDispute(marketId, "bad answer");

    await expect(manager.changeResolution(marketId, 2))
      .to.emit(manager, "ResolutionChanged")
      .withArgs(marketId, 1, 2);
  });

  it("dispute admin can cancel before finalization", async function () {
    const { manager, marketId } = await loadFixture(deployFixture);

    await expect(manager.cancelMarket(marketId))
      .to.emit(manager, "ResolutionCancelled")
      .withArgs(marketId);

    const resolution = await manager.getResolution(marketId);
    expect(resolution.finalized).to.equal(true);
    expect(resolution.cancelled).to.equal(true);
    expect(resolution.outcome).to.equal(3);
  });
});
