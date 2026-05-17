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

    return { owner, userA, userB, asset, vault, mintAmount };
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

  it("fuzz invariant: totalSupply equals the sum of tracked user shares", async function () {
    const { userA, userB, asset, vault } = await deployFixture();
    const users = [userA, userB];

    for (let i = 0; i < 20; i += 1) {
      const actor = users[i % users.length];
      const amount = randomWei(250);

      await asset.connect(actor).approve(await vault.getAddress(), amount);
      await vault.connect(actor).deposit(amount, actor.address);

      const trackedShares = (await vault.balanceOf(userA.address)) + (await vault.balanceOf(userB.address));
      expect(await vault.totalSupply()).to.equal(trackedShares);
    }
  });

  it("fuzz invariant: random deposits mint exactly previewed shares", async function () {
    const { userA, userB, asset, vault } = await deployFixture();
    const users = [userA, userB];

    for (let i = 0; i < 20; i += 1) {
      const actor = users[i % users.length];
      const amount = randomWei(300);
      const previewShares = await vault.previewDeposit(amount);
      const sharesBefore = await vault.balanceOf(actor.address);

      await asset.connect(actor).approve(await vault.getAddress(), amount);
      await vault.connect(actor).deposit(amount, actor.address);

      expect((await vault.balanceOf(actor.address)) - sharesBefore).to.equal(previewShares);
    }
  });

  it("fuzz invariant: collected fee counter is monotonic and exact", async function () {
    const { userA, userB, asset, vault } = await deployFixture();
    const users = [userA, userB];
    let expectedFees = 0n;

    for (let i = 0; i < 20; i += 1) {
      const actor = users[i % users.length];
      const amount = randomWei(75);

      await asset.connect(actor).approve(await vault.getAddress(), amount);
      await vault.connect(actor).collectFee(amount);
      expectedFees += amount;

      expect(await vault.totalFeesCollected()).to.equal(expectedFees);
    }
  });

  it("fuzz invariant: user balances plus vault balance conserve minted assets", async function () {
    const { userA, userB, asset, vault, mintAmount } = await deployFixture();
    const users = [userA, userB];
    const initialAssets = mintAmount * BigInt(users.length);

    for (let i = 0; i < 20; i += 1) {
      const actor = users[i % users.length];
      const shouldDeposit = Math.random() < 0.55;
      const shouldCollectFee = !shouldDeposit && Math.random() < 0.5;

      if (shouldDeposit) {
        const amount = randomWei(120);
        await asset.connect(actor).approve(await vault.getAddress(), amount);
        await vault.connect(actor).deposit(amount, actor.address);
      } else if (shouldCollectFee) {
        const amount = randomWei(30);
        await asset.connect(actor).approve(await vault.getAddress(), amount);
        await vault.connect(actor).collectFee(amount);
      } else {
        const shares = await vault.balanceOf(actor.address);
        if (shares > 0n) {
          const redeemShares = (shares * BigInt(Math.floor(Math.random() * 30) + 1)) / 100n;
          if (redeemShares > 0n) {
            await vault.connect(actor).redeem(redeemShares, actor.address, actor.address);
          }
        }
      }

      const accountedAssets =
        (await asset.balanceOf(userA.address)) +
        (await asset.balanceOf(userB.address)) +
        (await asset.balanceOf(await vault.getAddress()));

      expect(accountedAssets).to.equal(initialAssets);
    }
  });

  it("fuzz invariant: upgrade preserves random vault accounting", async function () {
    const { userA, userB, asset, vault } = await deployFixture();
    const users = [userA, userB];

    for (let i = 0; i < 10; i += 1) {
      const actor = users[i % users.length];
      const amount = randomWei(200);

      await asset.connect(actor).approve(await vault.getAddress(), amount);
      await vault.connect(actor).deposit(amount, actor.address);
    }

    const totalAssetsBefore = await vault.totalAssets();
    const totalSupplyBefore = await vault.totalSupply();
    const userASharesBefore = await vault.balanceOf(userA.address);
    const userBSharesBefore = await vault.balanceOf(userB.address);

    const VaultV2 = await ethers.getContractFactory("UpgradeableFeeVaultV2");
    const upgraded = await upgrades.upgradeProxy(await vault.getAddress(), VaultV2);

    expect(await upgraded.totalAssets()).to.equal(totalAssetsBefore);
    expect(await upgraded.totalSupply()).to.equal(totalSupplyBefore);
    expect(await upgraded.balanceOf(userA.address)).to.equal(userASharesBefore);
    expect(await upgraded.balanceOf(userB.address)).to.equal(userBSharesBefore);
    expect(await upgraded.version()).to.equal("2");
  });
});
