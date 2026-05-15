// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IReentrantTokenRecipient} from "../interfaces/IReentrantTokenRecipient.sol";

contract MockReentrantERC20 is ERC20 {
    bool public callbacksEnabled;

    constructor() ERC20("Reentrant Collateral", "RNT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setCallbacksEnabled(bool enabled) external {
        callbacksEnabled = enabled;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        bool success = super.transfer(to, value);
        if (callbacksEnabled && to.code.length > 0) {
            IReentrantTokenRecipient(to).onTokenTransfer();
        }
        return success;
    }
}
