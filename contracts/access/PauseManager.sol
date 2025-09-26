// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IPauseManager } from "../_interfaces/access/IPauseManager.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

contract PauseManager is IPauseManager, UUPSUpgradeable {
    IAddressBook public addressBook;

    bool public enabled;

    mapping(address => bool paused) public pausedContracts;

    function initialize(address _addressBook) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
    }

    function pause() external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        enabled = true;
    }

    function pauseContract(address _contract) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        pausedContracts[_contract] = true;
    }

    function unpause() external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        enabled = false;
    }

    function unpauseContract(address _contract) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        pausedContracts[_contract] = false;
    }

    function requireNotPaused() external view {
        require(enabled == false && pausedContracts[msg.sender] == false, "paused!");
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
