// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAccessRoles } from "../_interfaces/access/IAccessRoles.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IGameManager } from "../_interfaces/games/IGameManager.sol";

contract AddressBook is IAddressBook, UUPSUpgradeable {
    IAccessRoles public accessRoles;
    IGameManager public gameManager;

    function initialize(address _accessRoles) public initializer {
        require(_accessRoles != address(0), "_accessRoles is zero!");
        accessRoles = IAccessRoles(_accessRoles);
    }

    function initialSetGameManager(address _gameManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_gameManager != address(0), "_gameManager is zero!");
        require(address(gameManager) == address(0), "gameManager contract exists!");
        gameManager = IGameManager(_gameManager);
    }

    function _authorizeUpgrade(address) internal view override {
        accessRoles.requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
