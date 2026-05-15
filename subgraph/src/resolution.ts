import {
  MarketResolved,
  ResolutionCancelled,
  ResolutionChanged,
  ResolutionDisputed,
  ResolutionFinalized
} from "../../generated/ResolutionManager/ResolutionManager";
import { loadOrCreateMarket, loadOrCreateResolution } from "./helpers";

export function handleMarketResolved(event: MarketResolved): void {
  let market = loadOrCreateMarket(event.params.marketId, event.block.timestamp);
  market.save();

  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.outcome = event.params.outcome;
  resolution.resolvedAt = event.block.timestamp;
  resolution.save();
}

export function handleResolutionFinalized(event: ResolutionFinalized): void {
  let resolution = loadOrCreateResolution(event.params.marketId, event.block.timestamp);
  resolution.outcome = event.params.finalOutcome;
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
  resolution.save();
}
