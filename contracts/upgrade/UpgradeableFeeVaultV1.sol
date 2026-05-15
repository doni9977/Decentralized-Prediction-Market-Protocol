// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title Upgradeable protocol fee vault V1
/// @notice UUPS vault that collects and withdraws ERC20 protocol fees.
contract UpgradeableFeeVaultV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    IERC20 public asset;
    uint256 private _totalFeesCollected;

    error ZeroAddress();

    event FeeCollected(address indexed payer, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    /// @notice Initializes the vault owner and fee asset.
    function initialize(address owner, address asset_) public initializer {
        if (owner == address(0) || asset_ == address(0)) revert ZeroAddress();
        __Ownable_init(owner);
        asset = IERC20(asset_);
    }

    /// @notice Pulls protocol fees from the caller.
    function collectFee(uint256 amount) external {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        _totalFeesCollected += amount;
        emit FeeCollected(msg.sender, amount);
    }

    /// @notice Withdraws collected fees to a recipient.
    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        asset.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Returns lifetime collected fee amount.
    function totalFeesCollected() external view returns (uint256) {
        return _totalFeesCollected;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
