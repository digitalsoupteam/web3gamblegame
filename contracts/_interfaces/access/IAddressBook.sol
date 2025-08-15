// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAccessRoles } from "./IAccessRoles.sol";

interface IAddressBook {
    function accessRoles() external view returns (IAccessRoles);
}
