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

  it("rejects invalid constructor inputs", async function () {
    const { admin, outcomeToken } = await loadFixture(deployFixture);
    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");

    await expect(ResolutionManager.deploy(ethers.ZeroAddress, 3600, admin.address)).to.be.revertedWithCustomError(
      ResolutionManager,
      "ZeroAddress"
    );
    await expect(ResolutionManager.deploy(await outcomeToken.getAddress(), 0, admin.address)).to.be.revertedWithCustomError(
      ResolutionManager,
      "InvalidDisputeWindow"
    );
    await expect(
      ResolutionManager.deploy(await outcomeToken.getAddress(), 3600, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(ResolutionManager, "ZeroAddress");
  });

  it("rejects duplicate and invalid market registration", async function () {
    const { manager, marketId, closeTime, collateral, payoutPerShare } = await loadFixture(deployFixture);
    const secondMarketId = ethers.id("market:eth-10k");

    await expect(
      manager.registerMarket(marketId, closeTime, await collateral.getAddress(), payoutPerShare)
    ).to.be.revertedWithCustomError(manager, "MarketAlreadyRegistered");

    await expect(
      manager.registerMarket(secondMarketId, await time.latest(), await collateral.getAddress(), payoutPerShare)
    ).to.be.revertedWithCustomError(manager, "InvalidCloseTime");

    await expect(manager.registerMarket(secondMarketId, closeTime, ethers.ZeroAddress, payoutPerShare))
      .to.be.revertedWithCustomError(manager, "InvalidCollateralToken");

    await expect(manager.registerMarket(secondMarketId, closeTime, await collateral.getAddress(), 0))
      .to.be.revertedWithCustomError(manager, "InvalidPayoutPerShare");
  });

  it("rejects deposits for unknown markets and zero deposit amounts", async function () {
    const { manager, marketId } = await loadFixture(deployFixture);

    await expect(manager.depositCollateral(ethers.id("missing-market"), 1)).to.be.revertedWithCustomError(
      manager,
      "MarketNotRegistered"
    );

    await expect(manager.depositCollateral(marketId, 0)).to.be.revertedWithCustomError(manager, "ZeroAmount");
  });

  it("rejects invalid resolution outcomes and double resolution", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);

    await expect(manager.connect(resolver).resolveMarket(marketId, 3)).to.be.revertedWithCustomError(
      manager,
      "InvalidOutcome"
    );

    await manager.connect(resolver).resolveMarket(marketId, 1);
    await expect(manager.connect(resolver).resolveMarket(marketId, 2)).to.be.revertedWithCustomError(
      manager,
      "MarketAlreadyResolved"
    );
  });

  it("rejects invalid oracle resolution inputs", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);
    await time.increaseTo(closeTime);

    await expect(
      manager.connect(resolver).resolveMarketFromOracle(marketId, ethers.ZeroAddress, 1)
    ).to.be.revertedWithCustomError(manager, "ZeroAddress");

    await expect(
      manager.connect(resolver).resolveMarketFromOracle(marketId, resolver.address, 0)
    ).to.be.revertedWithCustomError(manager, "InvalidThresholdPrice");
  });

  it("rejects finalization before resolution and after finalization", async function () {
    const { manager, resolver, marketId, closeTime } = await loadFixture(deployFixture);

    await expect(manager.finalizeResolution(marketId)).to.be.revertedWithCustomError(manager, "MarketNotResolved");

    await time.increaseTo(closeTime);
    await manager.connect(resolver).resolveMarket(marketId, 2);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);
    await manager.finalizeResolution(marketId);

    await expect(manager.finalizeResolution(marketId)).to.be.revertedWithCustomError(manager, "MarketAlreadyFinalized");
  });

  it("rejects dispute and resolution changes before resolution or with invalid outcomes", async function () {
    const { manager, disputer, marketId } = await loadFixture(deployFixture);

    await expect(manager.connect(disputer).startDispute(marketId, "too early")).to.be.revertedWithCustomError(
      manager,
      "MarketNotResolved"
    );

    await expect(manager.changeResolution(marketId, 3)).to.be.revertedWithCustomError(manager, "InvalidOutcome");
    await expect(manager.changeResolution(marketId, 1)).to.be.revertedWithCustomError(manager, "MarketNotResolved");
  });
});
