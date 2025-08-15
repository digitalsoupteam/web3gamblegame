// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAccessRoles } from "../_interfaces/access/IAccessRoles.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract AddressBook is IAddressBook, UUPSUpgradeable {
    IAccessRoles public accessRoles;

    function initialize(address _accessRoles) public initializer {
        require(_accessRoles != address(0), "_accessRoles is zero!");
        accessRoles = IAccessRoles(_accessRoles);
    }

    function _authorizeUpgrade(address) internal view override {
        accessRoles.requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
