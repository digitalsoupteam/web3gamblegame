// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IGame {
    function minBetAmount() external view returns (uint256 registered);

    function maxBetAmount() external view returns (uint256 registered);

    function houseEdge() external view returns (uint8 registered);
}
