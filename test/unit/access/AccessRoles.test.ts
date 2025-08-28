import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';

describe('AccessRoles Contract', function () {
  async function deployAccessRolesFixture() {
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

    await impersonateAccount(ownersMultisig.address);
    await setBalance(ownersMultisig.address, parseEther('100'));

    const accessRolesImpl = await hre.viem.deployContract('AccessRoles');
    const accessRolesInitData = encodeFunctionData({
      abi: accessRolesImpl.abi,
      functionName: 'initialize',
      args: [ownersMultisig.address, [administrator.account.address]],
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

    const addressBookAccessRoles = await addressBook.read.accessRoles();
    expect(getAddress(accessRoles.address)).to.equal(getAddress(addressBookAccessRoles));

    const accessRolesOwnersMultisig = await accessRoles.read.ownersMultisig();
    expect(getAddress(ownersMultisig.address)).to.equal(getAddress(accessRolesOwnersMultisig));

    const isAdministrator = await accessRoles.read.administrators([administrator.account.address]);
    expect(isAdministrator).to.be.true;

    await impersonateAccount(deployer.account.address);
    await setBalance(deployer.account.address, parseEther('100'));
    await accessRoles.write.renounceDeployer({
      account: deployer.account.address,
    });

    return {
      publicClient,
      mockUSDC,
      accessRoles,
      ownersMultisig,
      addressBook,
      owners,
      administrator,
      user,
    };
  }

  describe('Initial data', function () {
    it('Should have correct ownersMultisig', async function () {
      const { accessRoles, ownersMultisig } = await loadFixture(deployAccessRolesFixture);
      const multisigAddress = await accessRoles.read.ownersMultisig();
      expect(getAddress(ownersMultisig.address)).to.equal(getAddress(multisigAddress));
    });

    it('Should have correct administrators', async function () {
      const { accessRoles, administrator } = await loadFixture(deployAccessRolesFixture);
      const isAdmin = await accessRoles.read.administrators([administrator.account.address]);
      expect(isAdmin).to.be.true;
    });

    it('Should have deployer removed', async function () {
      const { accessRoles } = await loadFixture(deployAccessRolesFixture);
      const deployer = await accessRoles.read.deployer();
      expect(deployer).to.equal('0x0000000000000000000000000000000000000000');
    });
  });

  describe('setOwnersMultisig', function () {
    it('Should allow owners to set a new multisig wallet', async function () {
      const { accessRoles, ownersMultisig } = await loadFixture(deployAccessRolesFixture);

      const newMultisigWallet = await hre.viem.deployContract('MultisigWallet');
      await accessRoles.write.setOwnersMultisig([newMultisigWallet.address], {
        account: ownersMultisig.address,
      });

      const updatedMultisig = await accessRoles.read.ownersMultisig();
      expect(getAddress(updatedMultisig)).to.equal(getAddress(newMultisigWallet.address));
    });

    it("Should revert if the new address doesn't support the multisig interface", async function () {
      const { accessRoles, ownersMultisig, user } = await loadFixture(deployAccessRolesFixture);

      await expect(
        accessRoles.write.setOwnersMultisig([user.account.address], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('not supported multisig wallet!');
    });

    it('Should revert if called by non-owner', async function () {
      const { accessRoles, user, administrator } = await loadFixture(deployAccessRolesFixture);

      const newMultisigWallet = await hre.viem.deployContract('MultisigWallet');

      await expect(
        accessRoles.write.setOwnersMultisig([newMultisigWallet.address], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');

      await expect(
        accessRoles.write.setOwnersMultisig([newMultisigWallet.address], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');
    });
  });

  describe('setDeployer', function () {
    it('Should allow owners to set and remove a deployer', async function () {
      const { accessRoles, ownersMultisig, user } = await loadFixture(deployAccessRolesFixture);

      await accessRoles.write.setDeployer([user.account.address], {
        account: ownersMultisig.address,
      });

      const deployer = await accessRoles.read.deployer();
      expect(getAddress(deployer)).to.equal(getAddress(user.account.address));

      await accessRoles.write.setDeployer(['0x0000000000000000000000000000000000000000'], {
        account: ownersMultisig.address,
      });

      const removedDeployer = await accessRoles.read.deployer();
      expect(removedDeployer).to.equal('0x0000000000000000000000000000000000000000');
    });

    it('Should revert if called by non-owner', async function () {
      const { accessRoles, user, administrator } = await loadFixture(deployAccessRolesFixture);

      await expect(
        accessRoles.write.setDeployer([user.account.address], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');

      await expect(
        accessRoles.write.setDeployer([administrator.account.address], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');
    });
  });

  describe('setAdministrator', function () {
    it('Should allow owners to set and remove an administrator', async function () {
      const { accessRoles, ownersMultisig, user } = await loadFixture(deployAccessRolesFixture);

      await accessRoles.write.setAdministrator([user.account.address, true], {
        account: ownersMultisig.address,
      });

      const isAdmin = await accessRoles.read.administrators([user.account.address]);
      expect(isAdmin).to.be.true;

      await accessRoles.write.setAdministrator([user.account.address, false], {
        account: ownersMultisig.address,
      });

      const isStillAdmin = await accessRoles.read.administrators([user.account.address]);
      expect(isStillAdmin).to.be.false;
    });

    it('Should revert if called by non-owner', async function () {
      const { accessRoles, user, administrator } = await loadFixture(deployAccessRolesFixture);

      await expect(
        accessRoles.write.setAdministrator([user.account.address, true], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');

      await expect(
        accessRoles.write.setAdministrator([user.account.address, true], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');
    });
  });

  describe('Role verification functions', function () {
    it('Should verify deployer correctly', async function () {
      const { accessRoles, user } = await loadFixture(deployAccessRolesFixture);

      await accessRoles.read.requireDeployer(['0x0000000000000000000000000000000000000000']);

      await expect(accessRoles.read.requireDeployer([user.account.address])).to.be.rejectedWith(
        'only deployer!',
      );
    });

    it('Should verify administrator correctly', async function () {
      const { accessRoles, user, administrator, ownersMultisig } =
        await loadFixture(deployAccessRolesFixture);

      await accessRoles.read.requireAdministrator([administrator.account.address]);

      const owner0 = await ownersMultisig.read.owners([0n]);

      await accessRoles.read.requireAdministrator([owner0]);

      await expect(
        accessRoles.read.requireAdministrator([user.account.address]),
      ).to.be.rejectedWith('only administrator!');
    });

    it('Should verify ownersMultisig correctly', async function () {
      const { accessRoles, user, ownersMultisig } = await loadFixture(deployAccessRolesFixture);

      await accessRoles.read.requireOwnersMultisig([ownersMultisig.address]);

      await expect(
        accessRoles.read.requireOwnersMultisig([user.account.address]),
      ).to.be.rejectedWith('only owners multisig!');
    });
  });

  describe('Upgrade functionality', function () {
    it('Should allow owners to upgrade the contract', async function () {
      const { accessRoles, ownersMultisig, publicClient } =
        await loadFixture(deployAccessRolesFixture);
      const newAccessRoles = await hre.viem.deployContract('AccessRoles');

      await accessRoles.write.upgradeToAndCall([newAccessRoles.address, '0x'], {
        account: ownersMultisig.address,
      });

      const implementationAddress = await getImplementationAddress(
        publicClient,
        accessRoles.address,
      );

      expect(getAddress(implementationAddress)).to.equal(getAddress(newAccessRoles.address));
    });

    it('Should revert if non-owner tries to upgrade', async function () {
      const { accessRoles, user, administrator } = await loadFixture(deployAccessRolesFixture);
      const newAccessRoles = await hre.viem.deployContract('AccessRoles');

      await expect(
        accessRoles.write.upgradeToAndCall([newAccessRoles.address, '0x'], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');

      await expect(
        accessRoles.write.upgradeToAndCall([newAccessRoles.address, '0x'], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('only owners multisig!');
    });
  });
});
