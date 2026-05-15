// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Small timelock-owned target used to demonstrate governance execution.
contract GovernanceControlledMock is Ownable {
    uint256 public value;

    event ValueUpdated(uint256 indexed newValue);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Updates a controlled value through the owner, expected to be the timelock.
    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
        emit ValueUpdated(newValue);
    }
}
