// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOutcomeToken} from "../interfaces/IOutcomeToken.sol";
import {MarketMath} from "../libraries/MarketMath.sol";

contract PredictionMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant OUTCOME_YES = 1;
    uint8 public constant OUTCOME_NO = 2;

    IERC20 public immutable collateralToken;
    IOutcomeToken public immutable outcomeToken;
    bytes32 public immutable marketId;
    string public question;
    uint256 public closeTime;
    uint256 public feeBps;
    uint256 public yesReserve;
    uint256 public noReserve;
    uint256 public totalLiquidity;
    uint256 public collectedFees;

    mapping(address provider => uint256 liquidity) public liquidityBalanceOf;

    error InvalidOutcome();
    error InvalidCloseTime();
    error InvalidQuestion();
    error InvalidAmount();
    error SlippageExceeded(uint256 actualSharesOut, uint256 minimumSharesOut);
    error MarketClosed();
    error MarketStillOpen();
    error InsufficientLiquidity();
    error InvalidFee();

    event LiquidityAdded(
        bytes32 indexed marketId,
        address indexed provider,
        uint256 collateralAmount,
        uint256 liquidityMinted,
        uint256 yesReserve,
        uint256 noReserve
    );
    event LiquidityRemoved(
        bytes32 indexed marketId,
        address indexed provider,
        uint256 collateralAmount,
        uint256 liquidityBurned,
        uint256 yesReserve,
        uint256 noReserve
    );
    event OutcomePurchased(
        bytes32 indexed marketId,
        address indexed buyer,
        uint8 indexed outcome,
        uint256 collateralIn,
        uint256 sharesOut,
        uint256 feeAmount,
        uint256 yesReserve,
        uint256 noReserve
    );
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    constructor(
        IERC20 collateralToken_,
        IOutcomeToken outcomeToken_,
        bytes32 marketId_,
        string memory question_,
        uint256 closeTime_,
        uint256 feeBps_,
        address owner_
    ) Ownable(owner_) {
        if (address(collateralToken_) == address(0) || address(outcomeToken_) == address(0) || owner_ == address(0)) {
            revert InvalidAmount();
        }
        if (bytes(question_).length == 0) revert InvalidQuestion();
        if (closeTime_ <= block.timestamp) revert InvalidCloseTime();
        if (feeBps_ >= MarketMath.BPS) revert InvalidFee();

        collateralToken = collateralToken_;
        outcomeToken = outcomeToken_;
        marketId = marketId_;
        question = question_;
        closeTime = closeTime_;
        feeBps = feeBps_;
    }

    function addLiquidity(uint256 collateralAmount) external nonReentrant onlyOpen returns (uint256 liquidityMinted) {
        if (collateralAmount == 0) revert InvalidAmount();

        liquidityMinted = collateralAmount;
        liquidityBalanceOf[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        yesReserve += collateralAmount;
        noReserve += collateralAmount;

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        emit LiquidityAdded(marketId, msg.sender, collateralAmount, liquidityMinted, yesReserve, noReserve);
    }

    function removeLiquidity(uint256 liquidityAmount) external nonReentrant returns (uint256 collateralAmount) {
        if (liquidityAmount == 0) revert InvalidAmount();
        if (liquidityBalanceOf[msg.sender] < liquidityAmount) revert InsufficientLiquidity();
        if (totalLiquidity == 0) revert InsufficientLiquidity();

        collateralAmount = (collateralToken.balanceOf(address(this)) * liquidityAmount) / totalLiquidity;
        uint256 yesReserveRemoved = (yesReserve * liquidityAmount) / totalLiquidity;
        uint256 noReserveRemoved = (noReserve * liquidityAmount) / totalLiquidity;

        liquidityBalanceOf[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        yesReserve -= yesReserveRemoved;
        noReserve -= noReserveRemoved;

        collateralToken.safeTransfer(msg.sender, collateralAmount);

        emit LiquidityRemoved(marketId, msg.sender, collateralAmount, liquidityAmount, yesReserve, noReserve);
    }

    function buyOutcome(uint8 outcome, uint256 collateralIn, uint256 minSharesOut)
        external
        nonReentrant
        onlyOpen
        returns (uint256 sharesOut)
    {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();
        if (collateralIn == 0) revert InvalidAmount();
        if (yesReserve == 0 || noReserve == 0) revert InsufficientLiquidity();

        uint256 oldYesReserve = yesReserve;
        uint256 oldNoReserve = noReserve;

        if (outcome == OUTCOME_YES) {
            sharesOut = MarketMath.quoteBuy(yesReserve, noReserve, collateralIn, feeBps);
            uint256 netAmountIn = MarketMath.amountAfterFee(collateralIn, feeBps);
            yesReserve -= sharesOut;
            noReserve += netAmountIn;
        } else {
            sharesOut = MarketMath.quoteBuy(noReserve, yesReserve, collateralIn, feeBps);
            uint256 netAmountIn = MarketMath.amountAfterFee(collateralIn, feeBps);
            noReserve -= sharesOut;
            yesReserve += netAmountIn;
        }

        if (sharesOut < minSharesOut) revert SlippageExceeded(sharesOut, minSharesOut);

        uint256 feeAmount = collateralIn - MarketMath.amountAfterFee(collateralIn, feeBps);
        collectedFees += feeAmount;

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralIn);
        outcomeToken.mintOutcome(msg.sender, marketId, outcome, sharesOut);

        assert(yesReserve * noReserve >= oldYesReserve * oldNoReserve);

        emit OutcomePurchased(
            marketId,
            msg.sender,
            outcome,
            collateralIn,
            sharesOut,
            feeAmount,
            yesReserve,
            noReserve
        );
    }

    function quoteBuy(uint8 outcome, uint256 collateralIn) external view returns (uint256) {
        if (outcome == OUTCOME_YES) {
            return MarketMath.quoteBuy(yesReserve, noReserve, collateralIn, feeBps);
        }
        if (outcome == OUTCOME_NO) {
            return MarketMath.quoteBuy(noReserve, yesReserve, collateralIn, feeBps);
        }
        revert InvalidOutcome();
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps >= MarketMath.BPS) revert InvalidFee();

        uint256 oldFeeBps = feeBps;
        feeBps = newFeeBps;

        emit FeeUpdated(oldFeeBps, newFeeBps);
    }

    function isOpen() public view returns (bool) {
        return block.timestamp < closeTime;
    }

    modifier onlyOpen() {
        if (!isOpen()) revert MarketClosed();
        _;
    }
}
