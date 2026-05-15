// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ResolutionManager} from "../resolution/ResolutionManager.sol";
import {IReentrantTokenRecipient} from "../interfaces/IReentrantTokenRecipient.sol";

contract ReentrantClaimant is IERC1155Receiver, IReentrantTokenRecipient {
    ResolutionManager public immutable manager;
    bytes32 public marketId;
    uint256 public amount;
    bool public attackEnabled;

    constructor(ResolutionManager manager_) {
        manager = manager_;
    }

    function attack(bytes32 marketId_, uint256 amount_) external {
        marketId = marketId_;
        amount = amount_;
        attackEnabled = true;
        manager.claim(marketId_, amount_);
        attackEnabled = false;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function onTokenTransfer() external {
        if (attackEnabled) {
            manager.claim(marketId, amount);
        }
    }

    function sweep(IERC20 token, address to) external {
        token.transfer(to, token.balanceOf(address(this)));
    }
}
