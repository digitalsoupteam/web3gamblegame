// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title IGameManager
 * @dev Interface for the GameManager contract
 */
interface IGameManager {
    function addGame(address gameAddress) external returns (bool success);

    function getAllGames() external view returns (address[] memory);

    function isGameExist(address gameAddress) external view returns (bool);
}
