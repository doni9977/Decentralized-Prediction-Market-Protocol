// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IOutcomeToken} from "../interfaces/IOutcomeToken.sol";

contract MockOutcomeToken is ERC1155, IOutcomeToken {
    uint8 public constant OUTCOME_YES = 1;
    uint8 public constant OUTCOME_NO = 2;

    error InvalidOutcome();

    event OutcomeMinted(address indexed to, bytes32 indexed marketId, uint8 indexed outcome, uint256 amount);
    event OutcomeBurned(address indexed from, bytes32 indexed marketId, uint8 indexed outcome, uint256 amount);

    constructor() ERC1155("") {}

    function mintOutcome(address to, bytes32 marketId, uint8 outcome, uint256 amount) external {
        uint256 tokenId = outcomeTokenId(marketId, outcome);
        _mint(to, tokenId, amount, "");
        emit OutcomeMinted(to, marketId, outcome, amount);
    }

    function burnOutcome(address from, bytes32 marketId, uint8 outcome, uint256 amount) external {
        uint256 tokenId = outcomeTokenId(marketId, outcome);
        _burn(from, tokenId, amount);
        emit OutcomeBurned(from, marketId, outcome, amount);
    }

    function outcomeTokenId(bytes32 marketId, uint8 outcome) public pure returns (uint256) {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();
        return uint256(keccak256(abi.encode(marketId, outcome)));
    }
}
