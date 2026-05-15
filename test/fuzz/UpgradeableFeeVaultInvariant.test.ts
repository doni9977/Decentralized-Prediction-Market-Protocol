import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("UpgradeableFeeVault invariants", function () {
  const ONE = 10n ** 18n;

  function randomWei(maxUnits: number): bigint {
    return BigInt(Math.floor(Math.random() * maxUnits) + 1) * ONE;
  }

  async function deployFixture() {
    const [owner, userA, userB] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await MockERC20.deploy("Mock USD", "mUSD");

    const mintAmount = 1_000_000n * ONE;
    await asset.mint(userA.address, mintAmount);
    await asset.mint(userB.address, mintAmount);

    const VaultV1 = await ethers.getContractFactory("UpgradeableFeeVaultV1");
    const vault = await upgrades.deployProxy(VaultV1, [owner.address, await asset.getAddress()], {
      kind: "uups",
      initializer: "initialize"
    });

    return { owner, userA, userB, asset, vault };
  }

  it("keeps totalAssets equal to underlying balance across random ops", async function () {
    const { userA, userB, asset, vault } = await deployFixture();
    const users = [userA, userB];

    for (let i = 0; i < 20; i += 1) {
      const actor = users[i % users.length];
      const doDeposit = Math.random() < 0.7;

      if (doDeposit) {
        const amount = randomWei(500);
        await asset.connect(actor).approve(await vault.getAddress(), amount);

        const previewShares = await vault.previewDeposit(amount);
        const beforeShares = await vault.balanceOf(actor.address);
        await vault.connect(actor).deposit(amount, actor.address);
        const afterShares = await vault.balanceOf(actor.address);

        expect(afterShares - beforeShares).to.equal(previewShares);
      } else {
        const shares = await vault.balanceOf(actor.address);
        if (shares > 0n) {
          const redeemShares = (shares * BigInt(Math.floor(Math.random() * 50) + 1)) / 100n;
          if (redeemShares > 0n) {
            const previewAssets = await vault.previewRedeem(redeemShares);
            const beforeAssets = await asset.balanceOf(actor.address);
            await vault.connect(actor).redeem(redeemShares, actor.address, actor.address);
            const afterAssets = await asset.balanceOf(actor.address);

            expect(afterAssets - beforeAssets).to.equal(previewAssets);
          }
        }
      }

      const totalAssets = await vault.totalAssets();
      const vaultBalance = await asset.balanceOf(await vault.getAddress());
      expect(totalAssets).to.equal(vaultBalance);
    }
  });
});
