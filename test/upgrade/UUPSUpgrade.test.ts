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

  it("initializes and collects fees in V1", async function () {
    const { user, asset, vault } = await deployVaultFixture();
    const amount = ethers.parseEther("12");

    await asset.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).collectFee(amount);

    expect(await vault.totalFeesCollected()).to.equal(amount);
    expect(await asset.balanceOf(await vault.getAddress())).to.equal(amount);
  });

  it("upgrades to V2 while preserving storage", async function () {
    const { owner, user, recipient, asset, vault } = await deployVaultFixture();
    const amount = ethers.parseEther("12");

    await asset.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).collectFee(amount);

    const VaultV2 = await ethers.getContractFactory("UpgradeableFeeVaultV2");
    const upgraded = await upgrades.upgradeProxy(await vault.getAddress(), VaultV2);

    expect(await upgraded.totalFeesCollected()).to.equal(amount);
    expect(await upgraded.asset()).to.equal(await asset.getAddress());
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
});
