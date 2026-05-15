// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceControlledMock is Ownable {
    uint256 public value;

    event ValueUpdated(uint256 indexed newValue);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
        emit ValueUpdated(newValue);
    }
}
