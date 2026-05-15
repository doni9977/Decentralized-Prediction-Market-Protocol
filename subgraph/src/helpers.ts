import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Market, Resolution } from "../../generated/schema";

export function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toString());
}

export function marketId(id: Bytes): string {
  return id.toHexString();
}

export function loadOrCreateMarket(id: Bytes, timestamp: BigInt): Market {
  let entityId = marketId(id);
  let market = Market.load(entityId);

  if (market == null) {
    market = new Market(entityId);
    market.question = "Unknown";
    market.creator = Address.zero();
    market.closeTime = BigInt.zero();
    market.collateralToken = Address.zero();
    market.oracle = Address.zero();
    market.feeBps = BigInt.zero();
    market.createdAt = timestamp;
    market.totalLiquidity = BigInt.zero();
    market.yesReserve = BigInt.zero();
    market.noReserve = BigInt.zero();
  }

  return market;
}

export function loadOrCreateResolution(id: Bytes, timestamp: BigInt): Resolution {
  let entityId = marketId(id);
  let resolution = Resolution.load(entityId);

  if (resolution == null) {
    resolution = new Resolution(entityId);
    resolution.market = entityId;
    resolution.outcome = 0;
    resolution.resolvedAt = timestamp;
    resolution.disputed = false;
  }

  return resolution;
}