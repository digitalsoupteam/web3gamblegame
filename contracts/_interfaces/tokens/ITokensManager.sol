// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITokensManager {
    function requireTokenSupport(address _token) external view;
    function getPrice(address _token) external view returns (uint256);
    function usdAmountToToken(uint256 _usdAmount, address _token) external view returns (uint256 tokenAmount);
}
