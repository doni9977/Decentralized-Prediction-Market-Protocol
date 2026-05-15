// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleAdapter {
    function getLatestAnswer() external view returns (int256 price, uint256 updatedAt);
}
