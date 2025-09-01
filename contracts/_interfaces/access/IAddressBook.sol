// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAccessRoles } from "./IAccessRoles.sol";
import { IGameManager } from "../../_interfaces/games/IGameManager.sol";

interface IAddressBook {
    function accessRoles() external view returns (IAccessRoles);
    function gameManager() external view returns (IGameManager);
}
