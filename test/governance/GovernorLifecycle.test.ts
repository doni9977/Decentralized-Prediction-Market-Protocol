import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";

describe("PredictionGovernor lifecycle", function () {
  const MIN_DELAY = 2 * 24 * 60 * 60;
  const VOTING_DELAY_BLOCKS = 7_200n;
  const VOTING_PERIOD_BLOCKS = 50_400n;

  async function deployGovernanceFixture() {
    const [deployer, proposer, voter, lowBalanceAccount] = await ethers.getSigners();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    const token = await GovernanceToken.deploy(deployer.address);

    await token.transfer(proposer.address, ethers.parseEther("20000"));
    await token.transfer(voter.address, ethers.parseEther("80000"));
    await token.connect(proposer).delegate(proposer.address);
    await token.connect(voter).delegate(voter.address);
    await token.connect(deployer).delegate(deployer.address);
    await mine(1);

    const Timelock = await ethers.getContractFactory("TimelockController");
    const timelock = await Timelock.deploy(MIN_DELAY, [], [], deployer.address);

    const PredictionGovernor = await ethers.getContractFactory("PredictionGovernor");
    const governor = await PredictionGovernor.deploy(await token.getAddress(), await timelock.getAddress());

    const proposerRole = await timelock.PROPOSER_ROLE();
    const executorRole = await timelock.EXECUTOR_ROLE();
    const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
    await timelock.grantRole(proposerRole, await governor.getAddress());
    await timelock.grantRole(executorRole, ethers.ZeroAddress);
    await timelock.revokeRole(adminRole, deployer.address);

    const Controlled = await ethers.getContractFactory("GovernanceControlledMock");
    const controlled = await Controlled.deploy(deployer.address);
    await controlled.transferOwnership(await timelock.getAddress());

    return { token, timelock, governor, controlled, deployer, proposer, voter, lowBalanceAccount };
  }

  async function createValueProposal(newValue: bigint) {
    const fixture = await deployGovernanceFixture();
    const calldata = fixture.controlled.interface.encodeFunctionData("setValue", [newValue]);
    const targets = [await fixture.controlled.getAddress()];
    const values = [0n];
    const calldatas = [calldata];
    const description = `Set controlled value to ${newValue}`;

    return { ...fixture, targets, values, calldatas, description };
  }

  it("matches required governance parameters", async function () {
    const { governor, token } = await deployGovernanceFixture();

    expect(await governor.votingDelay()).to.equal(VOTING_DELAY_BLOCKS);
    expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD_BLOCKS);
    expect(await governor["quorumNumerator()"]()).to.equal(4n);
    expect(await governor.proposalThreshold()).to.equal((await token.totalSupply()) / 100n);
    expect(await governor.supportsInterface("0x01ffc9a7")).to.equal(true);
  });

  it("allows account above threshold to create proposal", async function () {
    const { governor, proposer, targets, values, calldatas, description } = await createValueProposal(7n);

    await expect(governor.connect(proposer).propose(targets, values, calldatas, description))
      .to.emit(governor, "ProposalCreated");
  });

  it("rejects account below threshold", async function () {
    const { governor, lowBalanceAccount, targets, values, calldatas, description } = await createValueProposal(7n);

    await expect(governor.connect(lowBalanceAccount).propose(targets, values, calldatas, description))
      .to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotes");
  });

  it("runs propose, vote, queue, and execute lifecycle", async function () {
    const { governor, timelock, controlled, proposer, voter, targets, values, calldatas, description } =
      await createValueProposal(42n);
    const descriptionHash = ethers.id(description);

    const tx = await governor.connect(proposer).propose(targets, values, calldatas, description);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try {
          return governor.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "ProposalCreated");
    const proposalId = event!.args.proposalId;

    expect(await controlled.owner()).to.equal(await timelock.getAddress());
    expect(await governor.state(proposalId)).to.equal(0n);

    await mine(Number(VOTING_DELAY_BLOCKS + 1n));
    expect(await governor.state(proposalId)).to.equal(1n);

    await expect(governor.connect(voter).castVote(proposalId, 1)).to.emit(governor, "VoteCast");

    await mine(Number(VOTING_PERIOD_BLOCKS + 1n));
    expect(await governor.state(proposalId)).to.equal(4n);
    expect(await governor.proposalNeedsQueuing(proposalId)).to.equal(true);

    await expect(governor.queue(targets, values, calldatas, descriptionHash)).to.emit(governor, "ProposalQueued");
    expect(await governor.state(proposalId)).to.equal(5n);

    await expect(governor.execute(targets, values, calldatas, descriptionHash)).to.be.reverted;

    await time.increase(MIN_DELAY + 1);
    await expect(governor.execute(targets, values, calldatas, descriptionHash)).to.emit(governor, "ProposalExecuted");

    expect(await controlled.value()).to.equal(42n);
    expect(await governor.state(proposalId)).to.equal(7n);
  });

  it("allows proposer to cancel a pending proposal", async function () {
    const { governor, proposer, targets, values, calldatas, description } = await createValueProposal(13n);
    const descriptionHash = ethers.id(description);

    const tx = await governor.connect(proposer).propose(targets, values, calldatas, description);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try {
          return governor.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "ProposalCreated");
    const proposalId = event!.args.proposalId;

    await expect(governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash))
      .to.emit(governor, "ProposalCanceled")
      .withArgs(proposalId);
    expect(await governor.state(proposalId)).to.equal(2n);
  });
});
