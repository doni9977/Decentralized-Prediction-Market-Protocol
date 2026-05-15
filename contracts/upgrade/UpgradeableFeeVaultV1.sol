// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";

contract UpgradeableFeeVaultV1 is Initializable, ERC20Upgradeable, ERC4626Upgradeable, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    uint256 private _totalFeesCollected;

    error ZeroAddress();
    error ZeroAmount();

    event FeeCollected(address indexed payer, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    function initialize(address owner, address asset_) public initializer {
        if (owner == address(0) || asset_ == address(0)) revert ZeroAddress();
        __ERC20_init("Fee Vault Share", "FVS");
        __ERC4626_init(IERC20Metadata(asset_));
        __Ownable_init(owner);
    }

    function collectFee(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        _totalFeesCollected += amount;
        emit FeeCollected(msg.sender, amount);
    }

    function withdrawFees(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(asset()).safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    function decimals() public view override(ERC20Upgradeable, ERC4626Upgradeable) returns (uint8) {
        return super.decimals();
    }

    function totalFeesCollected() external view returns (uint256) {
        return _totalFeesCollected;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
