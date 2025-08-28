import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther, zeroAddress } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';
import ERC20Minter from '../../../scripts/utils/ERC20Minter';

describe('AddressBook Contract', function () {
  async function deployAddressBookFixture() {
    const [deployer, user, , , , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
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

    return {
      publicClient,
      mockUSDC,
      ownersMultisig,
      addressBook,
      owners,
      administrator,
      user,
    };
  }

  describe('Upgrade functionality', function () {
    it('Should allow owners to upgrade the contract', async function () {
      const { addressBook, ownersMultisig, publicClient } =
        await loadFixture(deployAddressBookFixture);

      await ERC20Minter.mint(zeroAddress, ownersMultisig.address, 1);
      const newAddressBook = await hre.viem.deployContract('AddressBook');

      await impersonateAccount(ownersMultisig.address);
      await addressBook.write.upgradeToAndCall([newAddressBook.address, '0x'], {
        account: ownersMultisig.address,
      });

      const implementationAddress = await getImplementationAddress(
        publicClient,
        addressBook.address,
      );

      expect(getAddress(implementationAddress)).to.equal(getAddress(newAddressBook.address));
    });

    it('Should revert if non-owner calls upgrade', async function () {
      const { addressBook, administrator, user } = await loadFixture(deployAddressBookFixture);

      const newAddressBook = await hre.viem.deployContract('AddressBook');

      await expect(
        addressBook.write.upgradeToAndCall([newAddressBook.address, '0x'], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');

      await expect(
        addressBook.write.upgradeToAndCall([newAddressBook.address, '0x'], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');
    });
  });
});
