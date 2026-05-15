import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("OutcomeToken", function () {
  async function deployFixture() {
    const [admin, minter, alice] = await ethers.getSigners();
    const OutcomeToken = await ethers.getContractFactory("OutcomeToken");
    const token = await OutcomeToken.deploy("ipfs://outcomes/{id}.json", admin.address);
    const minterRole = await token.MINTER_ROLE();
    const burnerRole = await token.BURNER_ROLE();
    await token.grantRole(minterRole, minter.address);
    await token.grantRole(burnerRole, alice.address);
    const marketId = ethers.id("market:eth-3000");
    const amount = ethers.parseEther("10");
    return { token, admin, minter, alice, marketId, amount, minterRole, burnerRole };
  }

  describe("outcomeTokenId", function () {
    it("returns deterministic ids for YES and NO", async function () {
      const { token, marketId } = await loadFixture(deployFixture);

      expect(await token.outcomeTokenId(marketId, 1)).to.equal(ethers.toBigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint8"], [marketId, 1]))));
      expect(await token.outcomeTokenId(marketId, 2)).to.not.equal(await token.outcomeTokenId(marketId, 1));
    });

    it("reverts for invalid outcomes", async function () {
      const { token, marketId } = await loadFixture(deployFixture);

      await expect(token.outcomeTokenId(marketId, 3)).to.be.revertedWithCustomError(token, "InvalidOutcome");
    });
  });

  describe("mintOutcome", function () {
    it("allows authorized minters to mint and emits indexing event", async function () {
      const { token, minter, alice, marketId, amount } = await loadFixture(deployFixture);
      const tokenId = await token.outcomeTokenId(marketId, 1);

      await expect(token.connect(minter).mintOutcome(alice.address, marketId, 1, amount))
        .to.emit(token, "OutcomeMinted")
        .withArgs(minter.address, alice.address, marketId, 1, amount, tokenId);

      expect(await token.balanceOf(alice.address, tokenId)).to.equal(amount);
    });

    it("blocks unauthorized minting", async function () {
      const { token, alice, marketId, amount } = await loadFixture(deployFixture);

      await expect(token.connect(alice).mintOutcome(alice.address, marketId, 1, amount))
        .to.be.revertedWithCustomError(token, "NotAuthorizedMinter");
    });

    it("rejects zero address and zero amount", async function () {
      const { token, minter, marketId } = await loadFixture(deployFixture);

      await expect(token.connect(minter).mintOutcome(ethers.ZeroAddress, marketId, 1, 1))
        .to.be.revertedWithCustomError(token, "ZeroAddress");
      await expect(token.connect(minter).mintOutcome(minter.address, marketId, 1, 0))
        .to.be.revertedWithCustomError(token, "ZeroAmount");
    });
  });

  describe("burnOutcome", function () {
    it("allows authorized burners to burn and emits indexing event", async function () {
      const { token, minter, alice, marketId, amount } = await loadFixture(deployFixture);
      const tokenId = await token.outcomeTokenId(marketId, 2);
      await token.connect(minter).mintOutcome(alice.address, marketId, 2, amount);

      await expect(token.connect(alice).burnOutcome(alice.address, marketId, 2, amount))
        .to.emit(token, "OutcomeBurned")
        .withArgs(alice.address, alice.address, marketId, 2, amount, tokenId);

      expect(await token.balanceOf(alice.address, tokenId)).to.equal(0);
    });

    it("blocks unauthorized burning", async function () {
      const { token, minter, alice, marketId, amount } = await loadFixture(deployFixture);
      await token.connect(minter).mintOutcome(alice.address, marketId, 1, amount);

      await expect(token.connect(minter).burnOutcome(alice.address, marketId, 1, amount))
        .to.be.revertedWithCustomError(token, "NotAuthorizedBurner");
    });

    it("keeps MINTER_ROLE and BURNER_ROLE separated", async function () {
      const { token, minter, alice, marketId, amount } = await loadFixture(deployFixture);

      await expect(token.connect(alice).mintOutcome(alice.address, marketId, 1, amount))
        .to.be.revertedWithCustomError(token, "NotAuthorizedMinter");

      await token.connect(minter).mintOutcome(alice.address, marketId, 1, amount);
      await expect(token.connect(minter).burnOutcome(alice.address, marketId, 1, amount))
        .to.be.revertedWithCustomError(token, "NotAuthorizedBurner");
    });
  });
});
