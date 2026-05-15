// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UpgradeableFeeVaultV1} from "./UpgradeableFeeVaultV1.sol";

/// @title Upgradeable protocol fee vault V2
/// @notice Adds fee recipient metadata while preserving V1 storage layout.
contract UpgradeableFeeVaultV2 is UpgradeableFeeVaultV1 {
    address public feeRecipient;

    event FeeRecipientUpdated(address indexed feeRecipient);

    /// @notice Sets the preferred fee recipient for operational accounting.
    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(newFeeRecipient);
    }

    /// @notice Returns the implementation version.
    function version() external pure returns (string memory) {
        return "2";
    }
}
