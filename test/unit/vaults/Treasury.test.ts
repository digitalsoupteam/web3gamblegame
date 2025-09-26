import { expect } from 'chai';
import hre from 'hardhat';
import {encodeFunctionData, getAddress, parseEther, zeroAddress} from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';

describe('Treasury Contract', function () {
  async function deployTreasuryFixture() {
    const [deployer, user, recipient, , , , , administrator, owner1, owner2] =
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

    // Deploy Treasury
    const treasuryImpl = await hre.viem.deployContract('Treasury');
    const treasuryInitData = encodeFunctionData({
      abi: treasuryImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address],
    });
    const treasuryProxy = await hre.viem.deployContract('ERC1967Proxy', [
      treasuryImpl.address,
      treasuryInitData,
    ]);
    const treasury = await hre.viem.getContractAt('Treasury', treasuryProxy.address);

    // Set Treasury in AddressBook
    await addressBook.write.initialSetTreasury([treasury.address], {
      account: deployer.account.address,
    });

    // Deploy a mock ERC20 token for testing
    const mockToken = await hre.viem.deployContract('MockERC20', ['Mock Token', 'MTK', 18]);
    await mockToken.write.mint([treasury.address, parseEther('1000')]);

    // Setup owners
    for (const owner of [owner1, owner2]) {
      const isSigner = await ownersMultisig.read.signers([owner.account.address]);
      expect(isSigner).to.be.true;
      await setBalance(owner.account.address, parseEther('100'));
    }

    return {
      publicClient,
      treasury,
      accessRoles,
      addressBook,
      ownersMultisig,
      administrator,
      user,
      recipient,
      deployer,
      mockToken,
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { treasury } = await loadFixture(deployTreasuryFixture);
      expect(treasury.address).to.not.equal(0);
    });

    it('Should be registered in AddressBook', async function () {
      const { treasury, addressBook } = await loadFixture(deployTreasuryFixture);
      const registeredTreasury = await addressBook.read.treasury();
      expect(getAddress(registeredTreasury)).to.equal(getAddress(treasury.address));
    });
  });

  describe('Initialization', function () {
    it('Should initialize with correct address book', async function () {
      const { treasury, addressBook } = await loadFixture(deployTreasuryFixture);
      const treasuryAddressBook = await treasury.read.addressBook();
      expect(getAddress(treasuryAddressBook)).to.equal(getAddress(addressBook.address));
    });

    it('Should revert if initialized with zero address', async function () {
      const treasuryImpl = await hre.viem.deployContract('Treasury');
      const initData = encodeFunctionData({
        abi: treasuryImpl.abi,
        functionName: 'initialize',
        args: [zeroAddress],
      });

      await expect(
        hre.viem.deployContract('ERC1967Proxy', [treasuryImpl.address, initData])
      ).to.be.rejected;
    });
  });

  describe('Receive Function', function () {
    it('Should accept ETH transfers', async function () {
      const { treasury, user, publicClient } = await loadFixture(deployTreasuryFixture);
      
      const initialBalance = await publicClient.getBalance({ address: treasury.address });
      const transferAmount = parseEther('1');
      
      await user.sendTransaction({
        to: treasury.address,
        value: transferAmount,
      });
      
      const finalBalance = await publicClient.getBalance({ address: treasury.address });
      expect(finalBalance).to.equal(initialBalance + transferAmount);
    });
  });

  describe('Withdraw Function', function () {
    it('Should allow owners multisig to withdraw ERC20 tokens', async function () {
      const { treasury, ownersMultisig, recipient, mockToken } = await loadFixture(deployTreasuryFixture);
      
      const initialTreasuryBalance = await mockToken.read.balanceOf([treasury.address]);
      const initialRecipientBalance = await mockToken.read.balanceOf([recipient.account.address]);
      const withdrawAmount = parseEther('100');
      
      await treasury.write.withdraw([mockToken.address, withdrawAmount, recipient.account.address], {
        account: ownersMultisig.address,
      });
      
      const finalTreasuryBalance = await mockToken.read.balanceOf([treasury.address]);
      const finalRecipientBalance = await mockToken.read.balanceOf([recipient.account.address]);
      
      expect(finalTreasuryBalance).to.equal(initialTreasuryBalance - withdrawAmount);
      expect(finalRecipientBalance).to.equal(initialRecipientBalance + withdrawAmount);
    });

    it('Should revert if non-owner tries to withdraw', async function () {
      const { treasury, user, recipient, mockToken } = await loadFixture(deployTreasuryFixture);
      
      await expect(
        treasury.write.withdraw([mockToken.address, parseEther('100'), recipient.account.address], {
          account: user.account.address,
        })
      ).to.be.rejected;
    });

    it('Should revert if administrator tries to withdraw', async function () {
      const { treasury, administrator, recipient, mockToken } = await loadFixture(deployTreasuryFixture);
      
      await expect(
        treasury.write.withdraw([mockToken.address, parseEther('100'), recipient.account.address], {
          account: administrator.account.address,
        })
      ).to.be.rejected;
    });

    it('Should revert if withdrawal amount is zero', async function () {
      const { treasury, ownersMultisig, recipient, mockToken } = await loadFixture(deployTreasuryFixture);
      
      await expect(
        treasury.write.withdraw([mockToken.address, 0n, recipient.account.address], {
          account: ownersMultisig.address,
        })
      ).to.be.rejectedWith('_amounts is zero!');
    });

    it('Should revert if withdrawal amount exceeds balance', async function () {
      const { treasury, ownersMultisig, recipient, mockToken } = await loadFixture(deployTreasuryFixture);
      
      const balance = await mockToken.read.balanceOf([treasury.address]);
      const excessiveAmount = balance + 1n;
      
      await expect(
        treasury.write.withdraw([mockToken.address, excessiveAmount, recipient.account.address], {
          account: ownersMultisig.address,
        })
      ).to.be.rejected;
    });
  });

  describe('Upgrade Functionality', function () {
    it('Should allow owners multisig to upgrade the contract', async function () {
      const { treasury, ownersMultisig, publicClient } = await loadFixture(deployTreasuryFixture);
      
      const newTreasuryImpl = await hre.viem.deployContract('Treasury');
      
      await treasury.write.upgradeToAndCall([newTreasuryImpl.address, '0x'], {
        account: ownersMultisig.address,
      });
      
      const implementationAddress = await getImplementationAddress(
        publicClient,
        treasury.address,
      );
      
      expect(getAddress(implementationAddress)).to.equal(getAddress(newTreasuryImpl.address));
    });

    it('Should revert if non-owner tries to upgrade', async function () {
      const { treasury, user } = await loadFixture(deployTreasuryFixture);
      
      const newTreasuryImpl = await hre.viem.deployContract('Treasury');
      
      await expect(
        treasury.write.upgradeToAndCall([newTreasuryImpl.address, '0x'], {
          account: user.account.address,
        })
      ).to.be.rejected;
    });

    it('Should revert if administrator tries to upgrade', async function () {
      const { treasury, administrator } = await loadFixture(deployTreasuryFixture);
      
      const newTreasuryImpl = await hre.viem.deployContract('Treasury');
      
      await expect(
        treasury.write.upgradeToAndCall([newTreasuryImpl.address, '0x'], {
          account: administrator.account.address,
        })
      ).to.be.rejected;
    });
  });
});