// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IPauseManager {
    function requireNotPaused() external view;
}
