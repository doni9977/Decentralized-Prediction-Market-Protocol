// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal market shell used until the final Market/AMM contract is integrated.
contract MinimalPredictionMarket {
    string public question;
    uint256 public closeTime;
    address public collateralToken;
    address public oracle;
    uint256 public feeBps;
    address public creator;

    constructor(
        string memory question_,
        uint256 closeTime_,
        address collateralToken_,
        address oracle_,
        uint256 feeBps_,
        address creator_
    ) {
        question = question_;
        closeTime = closeTime_;
        collateralToken = collateralToken_;
        oracle = oracle_;
        feeBps = feeBps_;
        creator = creator_;
    }
}

/// @title Prediction market factory
/// @notice Demonstrates CREATE and CREATE2 deployments for binary prediction markets.
contract MarketFactory is Ownable {
    uint256 public constant MAX_FEE_BPS = 1_000;

    uint256 private _marketNonce;
    mapping(bytes32 salt => bool used) public saltUsed;
    mapping(bytes32 marketId => address market) public markets;

    error EmptyQuestion();
    error InvalidCloseTime();
    error ZeroAddress();
    error FeeTooHigh();
    error SaltAlreadyUsed();

    event MarketCreated(bytes32 indexed marketId, address indexed market, address indexed creator);
    event DeterministicMarketCreated(bytes32 indexed marketId, address indexed market, bytes32 indexed salt);

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /// @notice Deploys a market with CREATE.
    function createMarket(
        string calldata question,
        uint256 closeTime,
        address collateralToken,
        address oracle,
        uint256 feeBps
    ) external returns (bytes32 marketId, address market) {
        _validateParams(question, closeTime, collateralToken, oracle, feeBps);

        market = address(
            new MinimalPredictionMarket(question, closeTime, collateralToken, oracle, feeBps, msg.sender)
        );
        marketId = _registerMarket(question, closeTime, collateralToken, oracle, feeBps, msg.sender, market);

        emit MarketCreated(marketId, market, msg.sender);
    }

    /// @notice Deploys a market with CREATE2 at a deterministic address.
    function createMarketDeterministic(
        string calldata question,
        uint256 closeTime,
        address collateralToken,
        address oracle,
        uint256 feeBps,
        bytes32 salt
    ) external returns (bytes32 marketId, address market) {
        _validateParams(question, closeTime, collateralToken, oracle, feeBps);
        if (saltUsed[salt]) revert SaltAlreadyUsed();

        bytes memory bytecode = _marketBytecode(question, closeTime, collateralToken, oracle, feeBps, msg.sender);
        market = Create2.deploy(0, salt, bytecode);
        saltUsed[salt] = true;
        marketId = _registerMarket(question, closeTime, collateralToken, oracle, feeBps, msg.sender, market);

        emit DeterministicMarketCreated(marketId, market, salt);
    }

    /// @notice Predicts the CREATE2 market address for a creator and salt.
    function predictMarketAddress(
        string calldata question,
        uint256 closeTime,
        address collateralToken,
        address oracle,
        uint256 feeBps,
        address creator,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = _marketBytecode(question, closeTime, collateralToken, oracle, feeBps, creator);
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    function _registerMarket(
        string calldata question,
        uint256 closeTime,
        address collateralToken,
        address oracle,
        uint256 feeBps,
        address creator,
        address market
    ) private returns (bytes32 marketId) {
        unchecked {
            _marketNonce++;
        }
        marketId = keccak256(
            abi.encode(question, closeTime, collateralToken, oracle, feeBps, creator, block.chainid, _marketNonce)
        );
        markets[marketId] = market;
    }

    function _validateParams(
        string calldata question,
        uint256 closeTime,
        address collateralToken,
        address oracle,
        uint256 feeBps
    ) private view {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();
        if (collateralToken == address(0) || oracle == address(0)) revert ZeroAddress();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
    }

    function _marketBytecode(
        string calldata question,
        uint256 closeTime,
        address collateralToken,
        address oracle,
        uint256 feeBps,
        address creator
    ) private pure returns (bytes memory) {
        return abi.encodePacked(
            type(MinimalPredictionMarket).creationCode,
            abi.encode(question, closeTime, collateralToken, oracle, feeBps, creator)
        );
    }
}
