// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockV3Aggregator {
    uint8 public immutable decimals;
    uint80 public roundId = 1;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound = 1;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        answer = initialAnswer;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, startedAt, updatedAt, answeredInRound);
    }

    function setAnswer(int256 answer_) external {
        answer = answer_;
        roundId += 1;
        answeredInRound = roundId;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 updatedAt_) external {
        updatedAt = updatedAt_;
    }

    function setRoundData(uint80 roundId_, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80 answeredInRound_) external {
        roundId = roundId_;
        answer = answer_;
        startedAt = startedAt_;
        updatedAt = updatedAt_;
        answeredInRound = answeredInRound_;
    }
}
