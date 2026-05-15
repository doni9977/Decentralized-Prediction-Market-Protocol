// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOutcomeToken {
    function mintOutcome(address to, bytes32 marketId, uint8 outcome, uint256 amount) external;

    function burnOutcome(address from, bytes32 marketId, uint8 outcome, uint256 amount) external;

    function outcomeTokenId(bytes32 marketId, uint8 outcome) external pure returns (uint256);
}
