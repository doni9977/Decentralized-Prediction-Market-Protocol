import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Claiming", function () {
  async function deployFixture() {
    const [admin, alice, bob, funder] = await ethers.getSigners();
    const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
    const outcomeToken = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", admin.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateral = await MockERC20.deploy("Mock USDC", "mUSDC");

    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const manager = await ResolutionManager.deploy(await outcomeToken.getAddress(), 3600, admin.address);
    await outcomeToken.grantRole(await outcomeToken.BURNER_ROLE(), await manager.getAddress());

    const marketId = ethers.id("market:eth-above-5000");
    const closeTime = (await time.latest()) + 100;
    const payoutPerShare = ethers.parseEther("1");
    const amount = ethers.parseEther("100");
    await manager.registerMarket(marketId, closeTime, await collateral.getAddress(), payoutPerShare);

    await outcomeToken.mintOutcome(alice.address, marketId, 1, amount);
    await outcomeToken.mintOutcome(bob.address, marketId, 2, amount);
    await collateral.mint(funder.address, ethers.parseEther("1000"));
    await collateral.connect(funder).approve(await manager.getAddress(), ethers.parseEther("1000"));
    await manager.connect(funder).depositCollateral(marketId, ethers.parseEther("1000"));

    return { admin, alice, bob, funder, outcomeToken, collateral, manager, marketId, closeTime, amount };
  }

  async function finalizeTo(outcome: 1 | 2) {
    const fixture = await loadFixture(deployFixture);
    await time.increaseTo(fixture.closeTime);
    await fixture.manager.resolveMarket(fixture.marketId, outcome);
    const resolution = await fixture.manager.getResolution(fixture.marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);
    await fixture.manager.finalizeResolution(fixture.marketId);
    return fixture;
  }

  it("winning YES can claim after YES finalized", async function () {
    const { manager, collateral, outcomeToken, alice, marketId, amount } = await finalizeTo(1);
    const yesId = await outcomeToken.outcomeTokenId(marketId, 1);

    await expect(manager.connect(alice).claim(marketId, amount))
      .to.emit(manager, "PayoutClaimed")
      .withArgs(marketId, alice.address, 1, amount, amount);

    expect(await outcomeToken.balanceOf(alice.address, yesId)).to.equal(0);
    expect(await collateral.balanceOf(alice.address)).to.equal(amount);
  });

  it("winning NO can claim after NO finalized", async function () {
    const { manager, collateral, outcomeToken, bob, marketId, amount } = await finalizeTo(2);
    const noId = await outcomeToken.outcomeTokenId(marketId, 2);

    await manager.connect(bob).claim(marketId, amount);

    expect(await outcomeToken.balanceOf(bob.address, noId)).to.equal(0);
    expect(await collateral.balanceOf(bob.address)).to.equal(amount);
  });

  it("losing side cannot claim", async function () {
    const { manager, bob, marketId, amount } = await finalizeTo(1);

    await expect(manager.connect(bob).claim(marketId, amount))
      .to.be.reverted;
  });

  it("cannot claim before finalized", async function () {
    const { manager, alice, marketId, amount } = await loadFixture(deployFixture);

    await expect(manager.connect(alice).claim(marketId, amount))
      .to.be.revertedWithCustomError(manager, "MarketNotResolved");
  });

  it("claim reverts if ResolutionManager has insufficient collateral", async function () {
    const [admin, alice] = await ethers.getSigners();
    const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
    const outcomeToken = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", admin.address);
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateral = await MockERC20.deploy("Mock USDC", "mUSDC");
    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const manager = await ResolutionManager.deploy(await outcomeToken.getAddress(), 3600, admin.address);
    await outcomeToken.grantRole(await outcomeToken.BURNER_ROLE(), await manager.getAddress());

    const marketId = ethers.id("market:underfunded");
    const closeTime = (await time.latest()) + 100;
    const amount = ethers.parseEther("100");
    await manager.registerMarket(marketId, closeTime, await collateral.getAddress(), ethers.parseEther("1"));
    await outcomeToken.mintOutcome(alice.address, marketId, 1, amount);
    await time.increaseTo(closeTime);
    await manager.resolveMarket(marketId, 1);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);
    await manager.finalizeResolution(marketId);

    await expect(manager.connect(alice).claim(marketId, amount))
      .to.be.revertedWithCustomError(manager, "InsufficientPayoutLiquidity");
  });

  it("cannot claim twice with same burned tokens", async function () {
    const { manager, alice, marketId, amount } = await finalizeTo(1);

    await manager.connect(alice).claim(marketId, amount);
    await expect(manager.connect(alice).claim(marketId, amount))
      .to.be.reverted;
  });

  it("reentrancy attempt fails during payout transfer", async function () {
    const [admin, funder] = await ethers.getSigners();
    const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
    const outcomeToken = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", admin.address);
    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const manager = await ResolutionManager.deploy(await outcomeToken.getAddress(), 3600, admin.address);
    await outcomeToken.grantRole(await outcomeToken.BURNER_ROLE(), await manager.getAddress());

    const MockReentrantERC20 = await ethers.getContractFactory("MockReentrantERC20");
    const collateral = await MockReentrantERC20.deploy();
    const ReentrantClaimant = await ethers.getContractFactory("ReentrantClaimant");
    const attacker = await ReentrantClaimant.deploy(await manager.getAddress());

    const marketId = ethers.id("market:reentrant");
    const closeTime = (await time.latest()) + 100;
    const amount = ethers.parseEther("10");
    await manager.registerMarket(marketId, closeTime, await collateral.getAddress(), ethers.parseEther("1"));
    await outcomeToken.mintOutcome(await attacker.getAddress(), marketId, 1, amount);
    await collateral.mint(funder.address, ethers.parseEther("100"));
    await collateral.connect(funder).approve(await manager.getAddress(), ethers.parseEther("100"));
    await manager.connect(funder).depositCollateral(marketId, ethers.parseEther("100"));

    await time.increaseTo(closeTime);
    await manager.resolveMarket(marketId, 1);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);
    await manager.finalizeResolution(marketId);
    await collateral.setCallbacksEnabled(true);

    await expect(attacker.attack(marketId, amount)).to.be.reverted;
  });

  it("reentrant claimant can claim normally when callback attack is disabled", async function () {
    const [admin, funder, recipient] = await ethers.getSigners();
    const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
    const outcomeToken = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", admin.address);
    const ResolutionManager = await ethers.getContractFactory("ResolutionManager");
    const manager = await ResolutionManager.deploy(await outcomeToken.getAddress(), 3600, admin.address);
    await outcomeToken.grantRole(await outcomeToken.BURNER_ROLE(), await manager.getAddress());

    const MockReentrantERC20 = await ethers.getContractFactory("MockReentrantERC20");
    const collateral = await MockReentrantERC20.deploy();
    const ReentrantClaimant = await ethers.getContractFactory("ReentrantClaimant");
    const claimant = await ReentrantClaimant.deploy(await manager.getAddress());

    const marketId = ethers.id("market:normal-contract-claim");
    const closeTime = (await time.latest()) + 100;
    const amount = ethers.parseEther("10");
    await manager.registerMarket(marketId, closeTime, await collateral.getAddress(), ethers.parseEther("1"));
    await outcomeToken.mintOutcome(await claimant.getAddress(), marketId, 1, amount);
    await collateral.mint(funder.address, ethers.parseEther("100"));
    await collateral.connect(funder).approve(await manager.getAddress(), ethers.parseEther("100"));
    await manager.connect(funder).depositCollateral(marketId, ethers.parseEther("100"));

    await time.increaseTo(closeTime);
    await manager.resolveMarket(marketId, 1);
    const resolution = await manager.getResolution(marketId);
    await time.increaseTo(resolution.disputeDeadline + 1n);
    await manager.finalizeResolution(marketId);

    expect(await claimant.supportsInterface("0x4e2312e0")).to.equal(true);
    expect(await claimant.onERC1155BatchReceived(admin.address, admin.address, [], [], "0x")).to.equal("0xbc197c81");

    await claimant.attack(marketId, amount);
    await claimant.sweep(collateral, recipient.address);

    expect(await collateral.balanceOf(recipient.address)).to.equal(amount);
  });
});
