import {
  MarketRegistered,
  MarketResolved,
  PayoutClaimed,
  ResolutionCancelled,
  ResolutionChanged,
  ResolutionDisputed,
  ResolutionFinalized
} from "../../generated/ResolutionManager/ResolutionManager";
import { loadOrCreateMarket, loadOrCreateResolution } from "./helpers";

export function handleMarketRegistered(event: MarketRegistered): void {
  let market = loadOrCreateMarket(event.params.marketId, event.block.timestamp);
  market.closeTime = event.params.closeTime;
  market.collateralToken = event.params.collateralToken;
  market.save();

  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.closeTime = event.params.closeTime;
  resolution.collateralToken = event.params.collateralToken;
  resolution.payoutPerShare = event.params.payoutPerShare;
  resolution.save();
}

export function handleMarketResolved(event: MarketResolved): void {
  let market = loadOrCreateMarket(event.params.marketId, event.block.timestamp);
  market.save();

  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.outcome = event.params.outcome;
  resolution.resolvedAt = event.block.timestamp;
  resolution.disputeDeadline = event.params.disputeDeadline;
  resolution.resolved = true;
  resolution.save();
}

export function handleResolutionFinalized(event: ResolutionFinalized): void {
  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.outcome = event.params.finalOutcome;
  resolution.finalized = true;
  if (event.params.finalOutcome == 3) {
    resolution.cancelled = true;
  }
  resolution.save();
}

export function handleResolutionDisputed(event: ResolutionDisputed): void {
  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.disputed = true;
  resolution.save();
}

export function handleResolutionChanged(event: ResolutionChanged): void {
  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.outcome = event.params.newOutcome;
  resolution.save();
}

export function handleResolutionCancelled(event: ResolutionCancelled): void {
  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.outcome = 3;
  resolution.resolved = true;
  resolution.finalized = true;
  resolution.cancelled = true;
  resolution.resolvedAt = event.block.timestamp;
  resolution.save();
}

export function handlePayoutClaimed(event: PayoutClaimed): void {
  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.claimedShares = resolution.claimedShares.plus(event.params.burnedShares);
  resolution.claimedPayout = resolution.claimedPayout.plus(event.params.payout);
  resolution.save();
}
