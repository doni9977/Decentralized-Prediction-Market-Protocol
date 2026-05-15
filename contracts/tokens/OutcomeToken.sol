// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract OutcomeToken is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    error InvalidOutcome();
    error NotAuthorizedMinter();
    error NotAuthorizedBurner();
    error ZeroAddress();
    error ZeroAmount();

    event OutcomeMinted(address indexed operator, address indexed to, bytes32 indexed marketId, uint8 outcome, uint256 amount, uint256 tokenId);
    event OutcomeBurned(address indexed operator, address indexed from, bytes32 indexed marketId, uint8 outcome, uint256 amount, uint256 tokenId);

    constructor(string memory uri_, address admin) ERC1155(uri_) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
    }

    function mintOutcome(address to, bytes32 marketId, uint8 outcome, uint256 amount) external {
        if (!hasRole(MINTER_ROLE, msg.sender)) revert NotAuthorizedMinter();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 tokenId = outcomeTokenId(marketId, outcome);
        _mint(to, tokenId, amount, "");
        emit OutcomeMinted(msg.sender, to, marketId, outcome, amount, tokenId);
    }

    function burnOutcome(address from, bytes32 marketId, uint8 outcome, uint256 amount) external {
        if (!hasRole(BURNER_ROLE, msg.sender)) revert NotAuthorizedBurner();
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 tokenId = outcomeTokenId(marketId, outcome);
        _burn(from, tokenId, amount);
        emit OutcomeBurned(msg.sender, from, marketId, outcome, amount, tokenId);
    }

    function outcomeTokenId(bytes32 marketId, uint8 outcome) public pure returns (uint256) {
        if (outcome != 1 && outcome != 2) revert InvalidOutcome();
        return uint256(keccak256(abi.encode(marketId, outcome)));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
