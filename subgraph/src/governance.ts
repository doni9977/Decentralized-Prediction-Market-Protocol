import {
  ProposalCreated,
  ProposalExecuted,
  ProposalQueued,
  VoteCast
} from "../../generated/PredictionGovernor/PredictionGovernor";
import {
  DelegateChanged,
  DelegateVotesChanged
} from "../../generated/GovernanceToken/GovernanceToken";
import { Proposal, Vote, Delegation, VotingPowerChange } from "../../generated/schema";
import { eventId } from "./helpers";

export function handleProposalCreated(event: ProposalCreated): void {
  let proposal = new Proposal(event.params.proposalId.toHexString());
  proposal.proposer = event.params.proposer;
  proposal.startBlock = event.params.startBlock;
  proposal.endBlock = event.params.endBlock;
  proposal.state = 0; // Initial state: Pending/Active
  proposal.description = event.params.description;
  proposal.save();
}

export function handleProposalQueued(event: ProposalQueued): void {
  let proposal = Proposal.load(event.params.proposalId.toHexString());
  if (proposal != null) {
    proposal.state = 5; // Queued
    proposal.queuedAt = event.block.timestamp;
    proposal.etaSeconds = event.params.etaSeconds;
    proposal.save();
  }
}

export function handleVoteCast(event: VoteCast): void {
  let vote = new Vote(eventId(event));
  vote.proposal = event.params.proposalId.toHexString();
  vote.voter = event.params.voter;
  vote.support = event.params.support;
  vote.weight = event.params.weight;
  vote.reason = event.params.reason;
  vote.timestamp = event.block.timestamp;
  vote.save();
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  let proposal = Proposal.load(event.params.proposalId.toHexString());
  if (proposal != null) {
    proposal.state = 7; // Executed
    proposal.executedAt = event.block.timestamp;
    proposal.save();
  }
}

export function handleDelegateChanged(event: DelegateChanged): void {
  let delegation = new Delegation(eventId(event));
  delegation.delegator = event.params.delegator;
  delegation.fromDelegate = event.params.fromDelegate;
  delegation.toDelegate = event.params.toDelegate;
  delegation.timestamp = event.block.timestamp;
  delegation.save();
}

export function handleDelegateVotesChanged(event: DelegateVotesChanged): void {
  let change = new VotingPowerChange(eventId(event));
  change.voter = event.params.delegate;
  change.previousBalance = event.params.previousBalance;
  change.newBalance = event.params.newBalance;
  change.timestamp = event.block.timestamp;
  change.save();
}
