// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UpgradeableFeeVaultV1} from "./UpgradeableFeeVaultV1.sol";

contract UpgradeableFeeVaultV2 is UpgradeableFeeVaultV1 {
    address public feeRecipient;

    event FeeRecipientUpdated(address indexed feeRecipient);

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(newFeeRecipient);
    }

    function version() external pure returns (string memory) {
        return "2";
    }
}
