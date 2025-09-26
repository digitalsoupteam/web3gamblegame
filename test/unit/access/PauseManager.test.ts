import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';

describe('PauseManager Contract', function () {
  async function deployPauseManagerFixture() {
    const [deployer, user, mockContract1, mockContract2, , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    const owners = [owner1, owner2];

    // Deploy owners multisig
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

    // Deploy AccessRoles
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

    // Deploy AddressBook
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

    // Deploy PauseManager
    const pauseManagerImpl = await hre.viem.deployContract('PauseManager');
    const pauseManagerInitData = encodeFunctionData({
      abi: pauseManagerImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address],
    });
    const pauseManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      pauseManagerImpl.address,
      pauseManagerInitData,
    ]);
    const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerProxy.address);

    // Set PauseManager in AddressBook
    await addressBook.write.initialSetPauseManager([pauseManager.address], {
      account: deployer.account.address,
    });

    // Setup owners
    for (const owner of [owner1, owner2]) {
      const isSigner = await ownersMultisig.read.signers([owner.account.address]);
      expect(isSigner).to.be.true;
      await setBalance(owner.account.address, parseEther('100'));
    }

    // Verify setup
    const addressBookPauseManager = await addressBook.read.pauseManager();
    expect(getAddress(pauseManager.address)).to.equal(getAddress(addressBookPauseManager));

    return {
      publicClient,
      pauseManager,
      accessRoles,
      addressBook,
      ownersMultisig,
      administrator,
      user,
      mockContract1,
      mockContract2,
      deployer,
    };
  }

  describe('Initialization', function () {
    it('Should initialize with correct address book', async function () {
      const { pauseManager, addressBook } = await loadFixture(deployPauseManagerFixture);
      const addressBookAddress = await pauseManager.read.addressBook();
      expect(getAddress(addressBookAddress)).to.equal(getAddress(addressBook.address));
    });

    it('Should initialize with enabled set to false', async function () {
      const { pauseManager } = await loadFixture(deployPauseManagerFixture);
      const enabled = await pauseManager.read.enabled();
      expect(enabled).to.be.false;
    });
  });

  describe('Global Pause Functions', function () {
    it('Should allow administrator to pause', async function () {
      const { pauseManager, administrator } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pause({
        account: administrator.account.address,
      });
      
      const enabled = await pauseManager.read.enabled();
      expect(enabled).to.be.true;
    });

    it('Should prevent non-administrator from pausing', async function () {
      const { pauseManager, user } = await loadFixture(deployPauseManagerFixture);
      
      await expect(
        pauseManager.write.pause({
          account: user.account.address,
        })
      ).to.be.rejected;
    });

    it('Should allow owners multisig to unpause', async function () {
      const { pauseManager, administrator, ownersMultisig } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pause({
        account: administrator.account.address,
      });
      
      let enabled = await pauseManager.read.enabled();
      expect(enabled).to.be.true;
      
      await pauseManager.write.unpause({
        account: ownersMultisig.address,
      });
      
      enabled = await pauseManager.read.enabled();
      expect(enabled).to.be.false;
    });

    it('Should prevent non-owners multisig from unpausing', async function () {
      const { pauseManager, administrator, user } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pause({
        account: administrator.account.address,
      });
      
      await expect(
        pauseManager.write.unpause({
          account: user.account.address,
        })
      ).to.be.rejected;
      
      await expect(
        pauseManager.write.unpause({
          account: administrator.account.address,
        })
      ).to.be.rejected;
    });
  });

  describe('Contract-specific Pause Functions', function () {
    it('Should allow administrator to pause specific contract', async function () {
      const { pauseManager, administrator, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pauseContract([mockContract1.account.address], {
        account: administrator.account.address,
      });
      
      const isPaused = await pauseManager.read.pausedContracts([mockContract1.account.address]);
      expect(isPaused).to.be.true;
    });

    it('Should prevent non-administrator from pausing specific contract', async function () {
      const { pauseManager, user, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await expect(
        pauseManager.write.pauseContract([mockContract1.account.address], {
          account: user.account.address,
        })
      ).to.be.rejected;
    });

    it('Should allow owners multisig to unpause specific contract', async function () {
      const { pauseManager, administrator, ownersMultisig, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pauseContract([mockContract1.account.address], {
        account: administrator.account.address,
      });
      
      let isPaused = await pauseManager.read.pausedContracts([mockContract1.account.address]);
      expect(isPaused).to.be.true;
      
      await pauseManager.write.unpauseContract([mockContract1.account.address], {
        account: ownersMultisig.address,
      });
      
      isPaused = await pauseManager.read.pausedContracts([mockContract1.account.address]);
      expect(isPaused).to.be.false;
    });

    it('Should prevent non-owners multisig from unpausing specific contract', async function () {
      const { pauseManager, administrator, user, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pauseContract([mockContract1.account.address], {
        account: administrator.account.address,
      });
      
      await expect(
        pauseManager.write.unpauseContract([mockContract1.account.address], {
          account: user.account.address,
        })
      ).to.be.rejected;
      
      await expect(
        pauseManager.write.unpauseContract([mockContract1.account.address], {
          account: administrator.account.address,
        })
      ).to.be.rejected;
    });
  });

  describe('requireNotPaused Function', function () {
    it('Should not revert when not paused', async function () {
      const { pauseManager, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await impersonateAccount(mockContract1.account.address);
      await setBalance(mockContract1.account.address, parseEther('1'));
      
      await pauseManager.read.requireNotPaused({
        account: mockContract1.account.address,
      });
    });

    it('Should revert when globally paused', async function () {
      const { pauseManager, administrator, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pause({
        account: administrator.account.address,
      });
      
      await impersonateAccount(mockContract1.account.address);
      await setBalance(mockContract1.account.address, parseEther('1'));
      
      await expect(
        pauseManager.read.requireNotPaused({
          account: mockContract1.account.address,
        })
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when specific contract is paused', async function () {
      const { pauseManager, administrator, mockContract1 } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pauseContract([mockContract1.account.address], {
        account: administrator.account.address,
      });
      
      await impersonateAccount(mockContract1.account.address);
      await setBalance(mockContract1.account.address, parseEther('1'));
      
      await expect(
        pauseManager.read.requireNotPaused({
          account: mockContract1.account.address,
        })
      ).to.be.rejectedWith('paused!');
    });

    it('Should not affect other contracts when one is paused', async function () {
      const { pauseManager, administrator, mockContract1, mockContract2 } = await loadFixture(deployPauseManagerFixture);
      
      await pauseManager.write.pauseContract([mockContract1.account.address], {
        account: administrator.account.address,
      });
      
      await impersonateAccount(mockContract2.account.address);
      await setBalance(mockContract2.account.address, parseEther('1'));
      
      await pauseManager.read.requireNotPaused({
        account: mockContract2.account.address,
      });
    });
  });

  describe('Upgrade functionality', function () {
    it('Should allow owners multisig to upgrade the contract', async function () {
      const { pauseManager, ownersMultisig, publicClient } = await loadFixture(deployPauseManagerFixture);
      const newPauseManager = await hre.viem.deployContract('PauseManager');

      await pauseManager.write.upgradeToAndCall([newPauseManager.address, '0x'], {
        account: ownersMultisig.address,
      });

      const implementationAddress = await getImplementationAddress(
        publicClient,
        pauseManager.address,
      );

      expect(getAddress(implementationAddress)).to.equal(getAddress(newPauseManager.address));
    });

    it('Should revert if non-owner tries to upgrade', async function () {
      const { pauseManager, user, administrator } = await loadFixture(deployPauseManagerFixture);
      const newPauseManager = await hre.viem.deployContract('PauseManager');

      await expect(
        pauseManager.write.upgradeToAndCall([newPauseManager.address, '0x'], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        pauseManager.write.upgradeToAndCall([newPauseManager.address, '0x'], {
          account: administrator.account.address,
        }),
      ).to.be.rejected;
    });
  });
});