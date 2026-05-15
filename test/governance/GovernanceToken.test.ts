import { expect } from "chai";
import { ethers } from "hardhat";

describe("GovernanceToken", function () {
  async function deployTokenFixture() {
    const [owner, user, delegatee, attacker] = await ethers.getSigners();
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const token = await GovernanceToken.deploy(owner.address);
    return { token, owner, user, delegatee, attacker };
  }

  it("deploys with correct name, symbol, and initial supply", async function () {
    const { token, owner } = await deployTokenFixture();

    expect(await token.name()).to.equal("Prediction Governance Token");
    expect(await token.symbol()).to.equal("PGOV");
    expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000"));
  });

  it("updates voting power after delegation", async function () {
    const { token, owner, delegatee } = await deployTokenFixture();

    expect(await token.getVotes(delegatee.address)).to.equal(0);
    await token.connect(owner).delegate(delegatee.address);

    expect(await token.delegates(owner.address)).to.equal(delegatee.address);
    expect(await token.getVotes(delegatee.address)).to.equal(ethers.parseEther("1000000"));
  });

  it("only owner can mint", async function () {
    const { token, owner, user, attacker } = await deployTokenFixture();

    await expect(token.connect(attacker).mint(user.address, 1n)).to.be.revertedWithCustomError(
      token,
      "OwnableUnauthorizedAccount"
    );

    await token.connect(owner).mint(user.address, ethers.parseEther("10"));
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("10"));
  });

  it("supports permit approvals", async function () {
    const { token, owner, user } = await deployTokenFixture();
    const amount = ethers.parseEther("25");
    const nonce = await token.nonces(owner.address);
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
    const { chainId } = await ethers.provider.getNetwork();

    const signature = await owner.signTypedData(
      {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress()
      },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      {
        owner: owner.address,
        spender: user.address,
        value: amount,
        nonce,
        deadline
      }
    );

    const { v, r, s } = ethers.Signature.from(signature);
    await token.permit(owner.address, user.address, amount, deadline, v, r, s);

    expect(await token.allowance(owner.address, user.address)).to.equal(amount);
  });
});
