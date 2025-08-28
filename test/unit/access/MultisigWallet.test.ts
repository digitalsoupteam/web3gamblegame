import { expect } from 'chai';
import hre from 'hardhat';
import { getAddress, zeroAddress, parseEther, parseUnits, encodeFunctionData } from 'viem';
import { loadFixture, setBalance } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import ERC20Minter from '../../../scripts/utils/ERC20Minter';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';

describe(`MultisigWallet`, () => {
  async function deployMultisigWalletFixture() {
    const [deployer, user, , , , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
    const mockUSDCImpl = await hre.viem.deployContract('MockERC20', ['MockUSDC', 'mUSDC', 6]);
    const mockUSDC = await hre.viem.getContractAt('MockERC20', mockUSDCImpl.address);
    const owners = [owner1, owner2];

    const ownersMultisigImpl = await hre.viem.deployContract('MultisigWallet');
    const ownersMultisigImplInitData = encodeFunctionData({
      abi: ownersMultisigImpl.abi,
      functionName: 'initialize',
      args: [BigInt(owners.length), owners.map(owner => owner.account.address)],
    });
    const ownersMultisigProxy = await hre.viem.deployContract('ERC1967Proxy', [
      ownersMultisigImpl.address,
      ownersMultisigImplInitData,
    ]);
    const ownersMultisig = await hre.viem.getContractAt(
      'MultisigWallet',
      ownersMultisigProxy.address,
    );

    const accessRolesImpl = await hre.viem.deployContract('AccessRoles');
    const accessRolesInitData = encodeFunctionData({
      abi: accessRolesImpl.abi,
      functionName: 'initialize',
      args: [ownersMultisig.address, []],
    });
    const accessRolesProxy = await hre.viem.deployContract('ERC1967Proxy', [
      accessRolesImpl.address,
      accessRolesInitData,
    ]);
    const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesProxy.address);

    const addressBookImpl = await hre.viem.deployContract('AddressBook');
    const addressBookInitData = encodeFunctionData({
      abi: addressBookImpl.abi,
      functionName: 'initialize',
      args: [accessRoles.address],
    });
    const addressBookProxy = await hre.viem.deployContract('ERC1967Proxy', [
      addressBookImpl.address,
      addressBookInitData,
    ]);
    const addressBook = await hre.viem.getContractAt('AddressBook', addressBookProxy.address);

    for (const owner of [owner1, owner2]) {
      const isSigner = await ownersMultisig.read.signers([owner.account.address]);
      expect(isSigner).to.be.true;

      await setBalance(owner.account.address, parseEther('100'));
    }

    const publicClient = await hre.viem.getPublicClient();

    return { mockUSDC, ownersMultisig, addressBook, owners, user, publicClient };
  }

  it(`Initial data: owners`, async function () {
    const { ownersMultisig, owners } = await loadFixture(deployMultisigWalletFixture);

    const signersCount = await ownersMultisig.read.signersCount();
    expect(signersCount).to.equal(BigInt(owners.length));

    for (const ownerClient of owners) {
      if (!ownerClient.account) throw new Error('ownerClient is undefined');
      const isSigner = await ownersMultisig.read.signers([ownerClient.account.address]);
      expect(isSigner).to.be.true;
    }
  });

  it(`Regular`, async function () {
    const { ownersMultisig, owners, user, publicClient } = await loadFixture(
      deployMultisigWalletFixture,
    );

    const recipient = user.account.address;
    const value = parseEther('1');

    const recipientBalanceBefore = await publicClient.getBalance({ address: recipient });

    const txId = 1n;
    await ownersMultisig.write.submitTransaction([recipient, value, '0x'], {
      account: owners[0].account.address,
      value,
    });

    await ownersMultisig.write.revokeTransaction([txId], { account: owners[0].account.address });

    const txConfirmationsCount = await ownersMultisig.read.txConfirmationsCount([txId]);
    expect(txConfirmationsCount).to.equal(0n);

    await expect(
      ownersMultisig.write.revokeTransaction([txId], { account: owners[0].account.address }),
    ).to.be.rejectedWith('not confirmed!');

    await ownersMultisig.write.acceptTransaction([txId], { account: owners[1].account.address });
    await ownersMultisig.write.acceptTransaction([txId], { account: owners[0].account.address });

    const recipientBalanceAfter = await publicClient.getBalance({ address: recipient });

    expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + value);

    await expect(
      ownersMultisig.write.acceptTransaction([txId], { account: owners[1].account.address }),
    ).to.be.rejectedWith('tx already executed!');

    await expect(
      ownersMultisig.write.revokeTransaction([txId], { account: owners[1].account.address }),
    ).to.be.rejectedWith('tx already executed!');
  });

  it(`Error: not owner submitTransaction`, async function () {
    const { ownersMultisig, user } = await loadFixture(deployMultisigWalletFixture);

    const recipient = user.account.address;
    const value = parseEther('1');

    await expect(
      ownersMultisig.write.submitTransaction([recipient, value, '0x'], {
        account: user.account,
        value,
      }),
    ).to.be.rejectedWith('only signer!');
  });

  it(`Should revert if non-owner tries to accept transaction`, async function () {
    const { ownersMultisig, owners, user } = await loadFixture(deployMultisigWalletFixture);

    const recipient = user.account.address;
    const value = parseEther('1');

    const txId = 1n;
    await ownersMultisig.write.submitTransaction([recipient, value, '0x'], {
      account: owners[0].account.address,
      value,
    });

    await expect(
      ownersMultisig.write.acceptTransaction([txId], { account: user.account }),
    ).to.be.rejectedWith('only signer!');
  });

  it(`Should revert if trying to accepting non-existent transaction`, async function () {
    const { ownersMultisig, owners } = await loadFixture(deployMultisigWalletFixture);

    const txId = 100n;
    await expect(
      ownersMultisig.write.acceptTransaction([txId], { account: owners[1].account.address }),
    ).to.be.rejectedWith('not found txId!');
  });

  it(`Should revert if trying to revoke non-existent transaction`, async function () {
    const { ownersMultisig, owners } = await loadFixture(deployMultisigWalletFixture);

    const txId = 100n;
    await expect(
      ownersMultisig.write.revokeTransaction([txId], { account: owners[1].account.address }),
    ).to.be.rejectedWith('not found txId!');
  });

  it(`Should allow owners to withdraw native tokens via multisig`, async function () {
    const { ownersMultisig, owners, user, publicClient } = await loadFixture(
      deployMultisigWalletFixture,
    );

    await ERC20Minter.mint(zeroAddress, ownersMultisig.address, 1);
    const value = parseEther('1');
    const recipient = user.account.address;

    const data = encodeFunctionData({
      abi: ownersMultisig.abi,
      functionName: 'withdraw',
      args: [recipient, zeroAddress, value],
    });

    const contractBalanceBefore = await publicClient.getBalance({
      address: ownersMultisig.address,
    });
    const recipientBalanceBefore = await publicClient.getBalance({ address: recipient });

    const txId = 1n;
    await ownersMultisig.write.submitTransaction([ownersMultisig.address, 0n, data], {
      account: owners[0].account.address,
    });

    await ownersMultisig.write.acceptTransaction([txId], { account: owners[1].account.address });

    const contractBalanceAfter = await publicClient.getBalance({ address: ownersMultisig.address });
    const recipientBalanceAfter = await publicClient.getBalance({ address: recipient });

    expect(contractBalanceAfter).to.equal(contractBalanceBefore - value);
    expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + value);
  });

  it(`Should allow owners to withdraw ERC20 tokens via multisig`, async function () {
    const { ownersMultisig, owners, user, mockUSDC } = await loadFixture(
      deployMultisigWalletFixture,
    );

    const decimals = await mockUSDC.read.decimals();
    const value = parseUnits('10', Number(decimals));
    const recipient = user.account.address;
    await mockUSDC.write.mint([ownersMultisig.address, value]);

    const data = encodeFunctionData({
      abi: ownersMultisig.abi,
      functionName: 'withdraw',
      args: [recipient, mockUSDC.address, value],
    });

    const contractBalanceBefore = await mockUSDC.read.balanceOf([ownersMultisig.address]);
    const recipientBalanceBefore = await mockUSDC.read.balanceOf([recipient]);

    const txId = 1n;
    await ownersMultisig.write.submitTransaction([ownersMultisig.address, 0n, data], {
      account: owners[0].account.address,
    });

    await ownersMultisig.write.acceptTransaction([txId], { account: owners[1].account.address });

    const contractBalanceAfter = await mockUSDC.read.balanceOf([ownersMultisig.address]);
    const recipientBalanceAfter = await mockUSDC.read.balanceOf([recipient]);

    expect(contractBalanceAfter).to.equal((contractBalanceBefore as bigint) - value);
    expect(recipientBalanceAfter).to.equal((recipientBalanceBefore as bigint) + value);
  });

  it('Should allow multisig to upgrade itself', async function () {
    const { ownersMultisig, owners, publicClient } = await loadFixture(deployMultisigWalletFixture);

    const newMultisigWallet = await hre.viem.deployContract('MultisigWallet');

    const data = encodeFunctionData({
      abi: ownersMultisig.abi,
      functionName: 'upgradeToAndCall',
      args: [newMultisigWallet.address, '0x'],
    });

    const txId = 1n;
    await ownersMultisig.write.submitTransaction([ownersMultisig.address, 0n, data], {
      account: owners[0].account.address,
    });

    await ownersMultisig.write.acceptTransaction([txId], { account: owners[1].account.address });

    const implementationAddress = await getImplementationAddress(
      publicClient,
      ownersMultisig.address,
    );

    expect(getAddress(implementationAddress)).to.equal(getAddress(newMultisigWallet.address));
  });

  it('Should revert if non-owner tries to upgrade', async function () {
    const { ownersMultisig, user } = await loadFixture(deployMultisigWalletFixture);
    await expect(
      ownersMultisig.write.upgradeToAndCall([zeroAddress, '0x'], { account: user.account }),
    ).to.be.rejectedWith('only mutisig!');
  });
});
