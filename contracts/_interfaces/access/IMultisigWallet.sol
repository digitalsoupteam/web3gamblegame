// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IMultisigWallet {
    function signers(address _account) external view returns (bool registered);
}
