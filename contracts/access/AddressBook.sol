// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IAccessRoles} from "../_interfaces/access/IAccessRoles.sol";
import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";
import {IGameManager} from "../_interfaces/games/IGameManager.sol";
import {IPauseManager} from "../_interfaces/access/IPauseManager.sol";
import {ITokensManager} from "../_interfaces/tokens/ITokensManager.sol";

contract AddressBook is IAddressBook, UUPSUpgradeable {
    IAccessRoles public accessRoles;
    IGameManager public gameManager;
    IPauseManager public pauseManager;
    address public treasury;
    ITokensManager public tokensManager;

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

    function initialSetPauseManager(address _pauseManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_pauseManager != address(0), "_pause is zero!");
        require(address(pauseManager) == address(0), "pauseManager contract exists!");
        pauseManager = IPauseManager(_pauseManager);
    }

    function initialSetTreasury(address _treasury) external {
        accessRoles.requireDeployer(msg.sender);
        require(_treasury != address(0), "_treasury is zero!");
        require(treasury == address(0), "treasury contract exists!");
        treasury = _treasury;
    }

    function initialSetTokensManager(address _tokensManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_tokensManager != address(0), "_tokensManager is zero!");
        require(address(tokensManager) == address(0), "tokensManager contract exists!");
        tokensManager = ITokensManager(_tokensManager);
    }

    function _authorizeUpgrade(address) internal view override {
        accessRoles.requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
