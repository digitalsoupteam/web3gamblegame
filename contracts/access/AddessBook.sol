// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

contract AddressBook is IAddressBook, UUPSUpgradeable {
    function initialize(address _accessRoles) public initializer {
    }


    function _authorizeUpgrade(address) internal view override {
    }

    constructor() {
        _disableInitializers();
    }
}
