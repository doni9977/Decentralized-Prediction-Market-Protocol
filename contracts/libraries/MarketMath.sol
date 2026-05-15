// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library MarketMath {
    uint256 internal constant BPS = 10_000;

    error InvalidFee();
    error InvalidReserve();
    error InvalidAmount();

    function amountAfterFee(uint256 amountIn, uint256 feeBps) internal pure returns (uint256) {
        if (amountIn == 0) revert InvalidAmount();
        if (feeBps >= BPS) revert InvalidFee();

        return (amountIn * (BPS - feeBps)) / BPS;
    }

    function quoteBuy(
        uint256 outcomeReserve,
        uint256 oppositeReserve,
        uint256 amountIn,
        uint256 feeBps
    ) internal pure returns (uint256 sharesOut) {
        if (outcomeReserve == 0 || oppositeReserve == 0) revert InvalidReserve();

        uint256 netAmountIn = amountAfterFee(amountIn, feeBps);
        uint256 newOppositeReserve = oppositeReserve + netAmountIn;
        uint256 invariant = mul(outcomeReserve, oppositeReserve);
        uint256 newOutcomeReserve = ceilDiv(invariant, newOppositeReserve);

        sharesOut = outcomeReserve - newOutcomeReserve;
        if (sharesOut == 0) revert InvalidAmount();
    }

    function mul(uint256 a, uint256 b) internal pure returns (uint256 result) {
        assembly ("memory-safe") {
            result := mul(a, b)
        }
    }

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256 result) {
        result = a == 0 ? 0 : ((a - 1) / b) + 1;
    }
}
