// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessRoles} from "./IAccessRoles.sol";
import {IGameManager} from "../../_interfaces/games/IGameManager.sol";
import {IPauseManager} from "../../_interfaces/access/IPauseManager.sol";
import {ITokensManager} from "../tokens/ITokensManager.sol";
import {IReferralProgram} from "../vaults/IReferralProgram.sol";

interface IAddressBook {
    function accessRoles() external view returns (IAccessRoles);

    function gameManager() external view returns (IGameManager);

    function pauseManager() external view returns (IPauseManager);

    function treasury() external view returns (address);

    function tokensManager() external view returns (ITokensManager);

    function referralProgram() external view returns (IReferralProgram);
}
