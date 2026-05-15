import {
  DeterministicMarketCreated,
  MarketCreated
} from "../../generated/MarketFactory/MarketFactory";
import { MinimalPredictionMarket } from "../../generated/MarketFactory/MinimalPredictionMarket";
import {
  FeeUpdated,
  LiquidityAdded,
  LiquidityRemoved,
  OutcomePurchased,
  PredictionMarket as PredictionMarketContract
} from "../../generated/PredictionMarket/PredictionMarket";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { LiquidityEvent, Market, Trade } from "../../generated/schema";
import { eventId, loadOrCreateMarket, marketId } from "./helpers";

export function handleMarketCreated(event: MarketCreated): void {
  saveFactoryMarket(event.params.marketId, event.params.market, event.params.creator, event.block.timestamp);
}

export function handleDeterministicMarketCreated(event: DeterministicMarketCreated): void {
  saveFactoryMarket(event.params.marketId, event.params.market, event.transaction.from, event.block.timestamp);
}

export function handleLiquidityAdded(event: LiquidityAdded): void {
  let market = loadOrCreateMarket(event.params.marketId, event.block.timestamp);
  market.totalLiquidity = market.totalLiquidity.plus(event.params.liquidityMinted);
  market.yesReserve = event.params.yesReserve;
  market.noReserve = event.params.noReserve;
  market.save();

  let liquidity = new LiquidityEvent(eventId(event));
  liquidity.market = market.id;
  liquidity.provider = event.params.provider;
  liquidity.amount = event.params.liquidityMinted;
  liquidity.isAdd = true;
  liquidity.timestamp = event.block.timestamp;
  liquidity.save();
}

export function handleLiquidityRemoved(event: LiquidityRemoved): void {
  let market = loadOrCreateMarket(event.params.marketId, event.block.timestamp);
  market.totalLiquidity = market.totalLiquidity.minus(event.params.liquidityBurned);
  market.yesReserve = event.params.yesReserve;
  market.noReserve = event.params.noReserve;
  market.save();

  let liquidity = new LiquidityEvent(eventId(event));
  liquidity.market = market.id;
  liquidity.provider = event.params.provider;
  liquidity.amount = event.params.liquidityBurned;
  liquidity.isAdd = false;
  liquidity.timestamp = event.block.timestamp;
  liquidity.save();
}

export function handleOutcomePurchased(event: OutcomePurchased): void {
  let market = loadOrCreateMarket(event.params.marketId, event.block.timestamp);
  market.yesReserve = event.params.yesReserve;
  market.noReserve = event.params.noReserve;
  market.save();

  let trade = new Trade(eventId(event));
  trade.market = market.id;
  trade.buyer = event.params.buyer;
  trade.outcome = event.params.outcome;
  trade.collateralIn = event.params.collateralIn;
  trade.sharesOut = event.params.sharesOut;
  trade.feeAmount = event.params.feeAmount;
  trade.timestamp = event.block.timestamp;
  trade.save();
}

export function handleFeeUpdated(event: FeeUpdated): void {
  let marketContract = PredictionMarketContract.bind(event.address);
  let marketIdCall = marketContract.try_marketId();

  if (marketIdCall.reverted) {
    return;
  }

  let market = loadOrCreateMarket(marketIdCall.value, event.block.timestamp);
  market.feeBps = event.params.newFeeBps;
  market.save();
}

function saveFactoryMarket(id: Bytes, address: Address, creator: Address, timestamp: BigInt): void {
  let entityId = marketId(id);
  let market = Market.load(entityId);

  if (market == null) {
    market = new Market(entityId);
    market.totalLiquidity = BigInt.zero();
    market.yesReserve = BigInt.zero();
    market.noReserve = BigInt.zero();
  }

  let marketContract = MinimalPredictionMarket.bind(address);
  let question = marketContract.try_question();
  let closeTime = marketContract.try_closeTime();
  let collateralToken = marketContract.try_collateralToken();
  let oracle = marketContract.try_oracle();
  let feeBps = marketContract.try_feeBps();

  market.question = question.reverted ? "Unknown" : question.value;
  market.creator = creator;
  market.closeTime = closeTime.reverted ? BigInt.zero() : closeTime.value;
  market.collateralToken = collateralToken.reverted ? Bytes.empty() : collateralToken.value;
  market.oracle = oracle.reverted ? Bytes.empty() : oracle.value;
  market.feeBps = feeBps.reverted ? BigInt.zero() : feeBps.value;
  market.createdAt = timestamp;
  market.save();
}
