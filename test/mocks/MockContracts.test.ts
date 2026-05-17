import { expect } from "chai";
import { ethers } from "hardhat";

describe("Mock contracts", function () {
  it("MockOutcomeToken mints and burns outcome balances", async function () {
    const [user] = await ethers.getSigners();
    const MockOutcomeToken = await ethers.getContractFactory("MockOutcomeToken");
    const outcomeToken = await MockOutcomeToken.deploy();
    const marketId = ethers.id("mock-market");
    const amount = ethers.parseEther("4");
    const tokenId = await outcomeToken.outcomeTokenId(marketId, 1);

    await outcomeToken.mintOutcome(user.address, marketId, 1, amount);
    expect(await outcomeToken.balanceOf(user.address, tokenId)).to.equal(amount);

    await expect(outcomeToken.burnOutcome(user.address, marketId, 1, amount))
      .to.emit(outcomeToken, "OutcomeBurned")
      .withArgs(user.address, marketId, 1, amount);

    expect(await outcomeToken.balanceOf(user.address, tokenId)).to.equal(0);
  });
});
