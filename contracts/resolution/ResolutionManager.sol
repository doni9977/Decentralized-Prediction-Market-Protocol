// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IOutcomeToken} from "../interfaces/IOutcomeToken.sol";
import {IOracleAdapter} from "../interfaces/IOracleAdapter.sol";

contract ResolutionManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKET_MANAGER_ROLE = keccak256("MARKET_MANAGER_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant DISPUTE_ADMIN_ROLE = keccak256("DISPUTE_ADMIN_ROLE");

    uint8 public constant OUTCOME_UNRESOLVED = 0;
    uint8 public constant OUTCOME_YES = 1;
    uint8 public constant OUTCOME_NO = 2;
    uint8 public constant OUTCOME_CANCELLED = 3;
    uint256 public constant PAYOUT_SCALE = 1e18;

    IOutcomeToken public immutable outcomeToken;
    uint256 public immutable disputeWindow;

    struct Resolution {
        uint256 closeTime;
        uint256 disputeDeadline;
        uint256 payoutPerShare;
        address collateralToken;
        uint8 outcome;
        bool resolved;
        bool disputed;
        bool finalized;
        bool cancelled;
    }

    mapping(bytes32 => Resolution) private resolutions;

    error MarketNotClosed();
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error DisputeWindowActive();
    error DisputeWindowExpired();
    error MarketAlreadyFinalized();
    error InvalidOutcome();
    error UnauthorizedResolver();
    error MarketAlreadyRegistered();
    error MarketNotRegistered();
    error InvalidCloseTime();
    error InvalidCollateralToken();
    error InvalidPayoutPerShare();
    error InvalidThresholdPrice();
    error InvalidDisputeWindow();
    error ZeroAddress();
    error ZeroAmount();
    error LosingOutcome();
    error MarketCancelled();
    error InsufficientPayoutLiquidity();

    event MarketRegistered(bytes32 indexed marketId, uint256 closeTime, address indexed collateralToken, uint256 payoutPerShare);
    event CollateralDeposited(bytes32 indexed marketId, address indexed funder, uint256 amount);
    event MarketResolved(bytes32 indexed marketId, uint8 outcome, uint256 disputeDeadline);
    event ResolutionDisputed(bytes32 indexed marketId, address indexed disputer, string reason);
    event ResolutionChanged(bytes32 indexed marketId, uint8 oldOutcome, uint8 newOutcome);
    event ResolutionFinalized(bytes32 indexed marketId, uint8 finalOutcome);
    event ResolutionCancelled(bytes32 indexed marketId);
    event PayoutClaimed(bytes32 indexed marketId, address indexed user, uint8 outcome, uint256 burnedShares, uint256 payout);

    constructor(IOutcomeToken outcomeToken_, uint256 disputeWindow_, address admin) {
        if (address(outcomeToken_) == address(0)) revert ZeroAddress();
        if (admin == address(0)) revert ZeroAddress();
        if (disputeWindow_ == 0) revert InvalidDisputeWindow();
        outcomeToken = outcomeToken_;
        disputeWindow = disputeWindow_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MARKET_MANAGER_ROLE, admin);
        _grantRole(RESOLVER_ROLE, admin);
        _grantRole(DISPUTE_ADMIN_ROLE, admin);
    }

    function registerMarket(bytes32 marketId, uint256 closeTime, address collateralToken, uint256 payoutPerShare) external onlyRole(MARKET_MANAGER_ROLE) {
        if (resolutions[marketId].closeTime != 0) revert MarketAlreadyRegistered();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();
        if (collateralToken == address(0)) revert InvalidCollateralToken();
        if (payoutPerShare == 0) revert InvalidPayoutPerShare();

        resolutions[marketId].closeTime = closeTime;
        resolutions[marketId].collateralToken = collateralToken;
        resolutions[marketId].payoutPerShare = payoutPerShare;
        emit MarketRegistered(marketId, closeTime, collateralToken, payoutPerShare);
    }

    function depositCollateral(bytes32 marketId, uint256 amount) external nonReentrant {
        Resolution storage resolution = _registered(marketId);
        if (amount == 0) revert ZeroAmount();

        IERC20(resolution.collateralToken).safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(marketId, msg.sender, amount);
    }

    function resolveMarket(bytes32 marketId, uint8 outcome) external {
        if (!hasRole(RESOLVER_ROLE, msg.sender)) revert UnauthorizedResolver();
        _resolveMarket(marketId, outcome);
    }

    function resolveMarketFromOracle(bytes32 marketId, address oracleAdapter, int256 thresholdPrice) external {
        if (!hasRole(RESOLVER_ROLE, msg.sender)) revert UnauthorizedResolver();
        if (oracleAdapter == address(0)) revert ZeroAddress();
        if (thresholdPrice <= 0) revert InvalidThresholdPrice();

        (int256 price,) = IOracleAdapter(oracleAdapter).getLatestAnswer();
        uint8 outcome = price >= thresholdPrice ? OUTCOME_YES : OUTCOME_NO;
        _resolveMarket(marketId, outcome);
    }

    function _resolveMarket(bytes32 marketId, uint8 outcome) internal {
        if (outcome != OUTCOME_YES && outcome != OUTCOME_NO) revert InvalidOutcome();

        Resolution storage resolution = _registered(marketId);
        if (block.timestamp < resolution.closeTime) revert MarketNotClosed();
        if (resolution.resolved) revert MarketAlreadyResolved();

        resolution.outcome = outcome;
        resolution.resolved = true;
        resolution.disputeDeadline = block.timestamp + disputeWindow;

        emit MarketResolved(marketId, outcome, resolution.disputeDeadline);
    }

    function startDispute(bytes32 marketId, string calldata reason) external {
        Resolution storage resolution = _registered(marketId);
        if (!resolution.resolved) revert MarketNotResolved();
        if (resolution.finalized) revert MarketAlreadyFinalized();
        if (block.timestamp > resolution.disputeDeadline) revert DisputeWindowExpired();

        resolution.disputed = true;
        emit ResolutionDisputed(marketId, msg.sender, reason);
    }

    function changeResolution(bytes32 marketId, uint8 newOutcome) external onlyRole(DISPUTE_ADMIN_ROLE) {
        if (newOutcome != OUTCOME_YES && newOutcome != OUTCOME_NO) revert InvalidOutcome();

        Resolution storage resolution = _registered(marketId);
        if (!resolution.resolved) revert MarketNotResolved();
        if (resolution.finalized) revert MarketAlreadyFinalized();
        if (!resolution.disputed && block.timestamp > resolution.disputeDeadline) revert DisputeWindowExpired();

        uint8 oldOutcome = resolution.outcome;
        resolution.outcome = newOutcome;
        emit ResolutionChanged(marketId, oldOutcome, newOutcome);
    }

    function cancelMarket(bytes32 marketId) external onlyRole(DISPUTE_ADMIN_ROLE) {
        Resolution storage resolution = _registered(marketId);
        if (resolution.finalized) revert MarketAlreadyFinalized();

        resolution.outcome = OUTCOME_CANCELLED;
        resolution.resolved = true;
        resolution.cancelled = true;
        resolution.finalized = true;
        emit ResolutionCancelled(marketId);
        emit ResolutionFinalized(marketId, OUTCOME_CANCELLED);
    }

    function finalizeResolution(bytes32 marketId) external {
        Resolution storage resolution = _registered(marketId);
        if (!resolution.resolved) revert MarketNotResolved();
        if (resolution.finalized) revert MarketAlreadyFinalized();
        if (block.timestamp <= resolution.disputeDeadline) revert DisputeWindowActive();

        resolution.finalized = true;
        emit ResolutionFinalized(marketId, resolution.outcome);
    }

    function claim(bytes32 marketId, uint256 amount) external nonReentrant {
        Resolution storage resolution = _registered(marketId);
        if (!resolution.finalized) revert MarketNotResolved();
        if (resolution.cancelled || resolution.outcome == OUTCOME_CANCELLED) revert MarketCancelled();
        if (amount == 0) revert ZeroAmount();

        uint8 winningOutcome = resolution.outcome;
        uint256 payout = (amount * resolution.payoutPerShare) / PAYOUT_SCALE;
        if (IERC20(resolution.collateralToken).balanceOf(address(this)) < payout) {
            revert InsufficientPayoutLiquidity();
        }

        outcomeToken.burnOutcome(msg.sender, marketId, winningOutcome, amount);
        IERC20(resolution.collateralToken).safeTransfer(msg.sender, payout);

        emit PayoutClaimed(marketId, msg.sender, winningOutcome, amount, payout);
    }

    function getResolution(bytes32 marketId) external view returns (Resolution memory) {
        return resolutions[marketId];
    }

    function _registered(bytes32 marketId) private view returns (Resolution storage resolution) {
        resolution = resolutions[marketId];
        if (resolution.closeTime == 0) revert MarketNotRegistered();
    }
}
