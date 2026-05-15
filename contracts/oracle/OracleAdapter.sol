// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

contract OracleAdapter is Ownable {
    AggregatorV3Interface public feed;
    uint256 public stalePeriod;

    error StaleOraclePrice();
    error InvalidOraclePrice();
    error InvalidOracleRound();
    error InvalidFeed();
    error InvalidStalePeriod();

    event FeedUpdated(address indexed oldFeed, address indexed newFeed);
    event StalePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);

    constructor(address feed_, uint256 stalePeriod_, address owner_) Ownable(owner_) {
        if (feed_ == address(0)) revert InvalidFeed();
        if (stalePeriod_ == 0) revert InvalidStalePeriod();
        feed = AggregatorV3Interface(feed_);
        stalePeriod = stalePeriod_;
    }

    function getLatestAnswer() external view returns (int256 price, uint256 updatedAt) {
        (uint80 roundId, int256 answer,, uint256 answerUpdatedAt, uint80 answeredInRound) = feed.latestRoundData();
        if (answer <= 0) revert InvalidOraclePrice();
        if (answerUpdatedAt == 0) revert StaleOraclePrice();
        if (answeredInRound < roundId) revert InvalidOracleRound();
        if (block.timestamp - answerUpdatedAt > stalePeriod) revert StaleOraclePrice();
        return (answer, answerUpdatedAt);
    }

    function isFresh() external view returns (bool) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
        return answer > 0 && updatedAt != 0 && answeredInRound >= roundId && block.timestamp - updatedAt <= stalePeriod;
    }

    function setFeed(address newFeed) external onlyOwner {
        if (newFeed == address(0)) revert InvalidFeed();
        address oldFeed = address(feed);
        feed = AggregatorV3Interface(newFeed);
        emit FeedUpdated(oldFeed, newFeed);
    }

    function setStalePeriod(uint256 newStalePeriod) external onlyOwner {
        if (newStalePeriod == 0) revert InvalidStalePeriod();
        uint256 oldPeriod = stalePeriod;
        stalePeriod = newStalePeriod;
        emit StalePeriodUpdated(oldPeriod, newStalePeriod);
    }
}
