import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("UpgradeableFeeVault UUPS", function () {
  async function deployVaultFixture() {
    const [owner, user, recipient, attacker] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await MockERC20.deploy("Mock USD", "mUSD");
    await asset.mint(user.address, ethers.parseEther("1000"));

    const VaultV1 = await ethers.getContractFactory("UpgradeableFeeVaultV1");
    const vault = await upgrades.deployProxy(VaultV1, [owner.address, await asset.getAddress()], {
      kind: "uups",
      initializer: "initialize"
    });

    return { owner, user, recipient, attacker, asset, vault };
  }

  it("initializes and supports ERC4626 deposits in V1", async function () {
    const { user, asset, vault } = await deployVaultFixture();
    const amount = ethers.parseEther("12");
    const feeAmount = ethers.parseEther("3");

    await asset.connect(user).approve(await vault.getAddress(), amount + feeAmount);

    const previewShares = await vault.previewDeposit(amount);
    await vault.connect(user).deposit(amount, user.address);

    expect(await vault.balanceOf(user.address)).to.equal(previewShares);
    expect(await vault.totalAssets()).to.equal(amount);

    await expect(vault.connect(user).collectFee(feeAmount))
      .to.emit(vault, "FeeCollected")
      .withArgs(user.address, feeAmount);
    expect(await vault.totalFeesCollected()).to.equal(feeAmount);
    expect(await vault.totalAssets()).to.equal(amount + feeAmount);
    expect(await vault.decimals()).to.equal(await asset.decimals());
  });

  it("upgrades to V2 while preserving storage", async function () {
    const { owner, user, recipient, asset, vault } = await deployVaultFixture();
    const amount = ethers.parseEther("12");
    const feeAmount = ethers.parseEther("5");

    await asset.connect(user).approve(await vault.getAddress(), amount + feeAmount);
    const previewShares = await vault.previewDeposit(amount);
    await vault.connect(user).deposit(amount, user.address);
    await vault.connect(user).collectFee(feeAmount);

    const VaultV2 = await ethers.getContractFactory("UpgradeableFeeVaultV2");
    const upgraded = await upgrades.upgradeProxy(await vault.getAddress(), VaultV2);

    expect(await upgraded.totalFeesCollected()).to.equal(feeAmount);
    expect(await upgraded.asset()).to.equal(await asset.getAddress());
    expect(await upgraded.totalAssets()).to.equal(amount + feeAmount);
    expect(await upgraded.balanceOf(user.address)).to.equal(previewShares);
    expect(await upgraded.version()).to.equal("2");

    await upgraded.connect(owner).setFeeRecipient(recipient.address);
    expect(await upgraded.feeRecipient()).to.equal(recipient.address);
  });

  it("rejects unauthorized upgrades", async function () {
    const { attacker, vault } = await deployVaultFixture();
    const VaultV2AsAttacker = await ethers.getContractFactory("UpgradeableFeeVaultV2", attacker);

    await expect(upgrades.upgradeProxy(await vault.getAddress(), VaultV2AsAttacker)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
  });

  it("rejects invalid initialization inputs", async function () {
    const { owner, asset } = await deployVaultFixture();
    const VaultV1 = await ethers.getContractFactory("UpgradeableFeeVaultV1");

    await expect(
      upgrades.deployProxy(VaultV1, [ethers.ZeroAddress, await asset.getAddress()], {
        kind: "uups",
        initializer: "initialize"
      })
    ).to.be.revertedWithCustomError(VaultV1, "ZeroAddress");

    await expect(
      upgrades.deployProxy(VaultV1, [owner.address, ethers.ZeroAddress], {
        kind: "uups",
        initializer: "initialize"
      })
    ).to.be.revertedWithCustomError(VaultV1, "ZeroAddress");

    const implementation = await VaultV1.deploy();
    await implementation.initialize(owner.address, await asset.getAddress());
    await expect(implementation.initialize(owner.address, await asset.getAddress())).to.be.revertedWithCustomError(
      implementation,
      "InvalidInitialization"
    );
  });

  it("rejects zero fee collection and invalid withdrawals", async function () {
    const { owner, user, recipient, attacker, vault } = await deployVaultFixture();

    await expect(vault.connect(user).collectFee(0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
    await expect(vault.connect(owner).withdrawFees(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(
      vault,
      "ZeroAddress"
    );
    await expect(vault.connect(owner).withdrawFees(recipient.address, 0)).to.be.revertedWithCustomError(
      vault,
      "ZeroAmount"
    );
    await expect(vault.connect(attacker).withdrawFees(recipient.address, 1)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
  });

  it("allows owner to withdraw collected fees", async function () {
    const { owner, user, recipient, asset, vault } = await deployVaultFixture();
    const feeAmount = ethers.parseEther("9");

    await asset.connect(user).approve(await vault.getAddress(), feeAmount);
    await vault.connect(user).collectFee(feeAmount);

    await expect(vault.connect(owner).withdrawFees(recipient.address, feeAmount))
      .to.emit(vault, "FeesWithdrawn")
      .withArgs(recipient.address, feeAmount);

    expect(await asset.balanceOf(recipient.address)).to.equal(feeAmount);
  });

  it("allows owner to withdraw ERC4626 vault liquidity", async function () {
    const { user, asset, vault } = await deployVaultFixture();
    const amount = ethers.parseEther("7");

    await asset.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount, user.address);

    const shares = await vault.balanceOf(user.address);
    await vault.connect(user).withdraw(amount, user.address, user.address);

    expect(await vault.balanceOf(user.address)).to.be.lessThan(shares);
    expect(await asset.balanceOf(user.address)).to.equal(ethers.parseEther("1000"));
  });

  it("rejects invalid V2 fee recipient updates", async function () {
    const { attacker, vault } = await deployVaultFixture();
    const VaultV2 = await ethers.getContractFactory("UpgradeableFeeVaultV2");
    const upgraded = await upgrades.upgradeProxy(await vault.getAddress(), VaultV2);

    await expect(upgraded.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(upgraded, "ZeroAddress");
    await expect(upgraded.connect(attacker).setFeeRecipient(attacker.address)).to.be.revertedWithCustomError(
      upgraded,
      "OwnableUnauthorizedAccount"
    );
  });
});
