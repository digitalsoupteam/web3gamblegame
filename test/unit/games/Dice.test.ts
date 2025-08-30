import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, formatEther, getAddress, parseEther } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import MultisigWallet from '../../../ignition/modules/access/MultisigWallet';

describe('Dice Contract', function () {
  async function deployDiceFixture() {
    const [deployer, user, , , , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
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
      args: [ownersMultisig.address, []],
    });
    const accessRolesProxy = await hre.viem.deployContract('ERC1967Proxy', [
      accessRolesImpl.address,
      accessRolesInitData,
    ]);
    const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesProxy.address);

    const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);
    const DiceImpl = await hre.viem.deployContract('Dice', [MockVRFCoordinator.address]);
    const diceInitData = encodeFunctionData({
      abi: DiceImpl.abi,
      functionName: 'initialize',
      args: [
        MockVRFCoordinator.address,
        1n,
        '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
        accessRoles.address,
        1,
        100,
        parseEther('0.001'),
        parseEther('1'),
        10,
      ],
    });
    const DiceProxy = await hre.viem.deployContract('ERC1967Proxy', [
      DiceImpl.address,
      diceInitData,
    ]);
    const Dice = await hre.viem.getContractAt('Dice', DiceProxy.address);
    await setBalance(Dice.address, parseEther('100'));

    for (const owner of [owner1, owner2]) {
      const isSigner = await ownersMultisig.read.signers([owner.account.address]);
      expect(isSigner).to.be.true;

      await setBalance(owner.account.address, parseEther('100'));
    }

    return {
      publicClient,
      Dice,
      MockVRFCoordinator,
      accessRoles,
      ownersMultisig,
      administrator,
      user,
      owner1,
      owner2,
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { Dice } = await loadFixture(deployDiceFixture);
      expect(Dice.address).to.not.equal(0);
    });
  });

  describe('Roll Function', function () {
    it('Should emit DiceRollRequested event when roll is called', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      const txHash = await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: 1000000000000000n,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.DiceRollRequested(
        {
          roller: user.account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);
      const roller = events[0].args.roller;
      if (!roller) throw new Error('roller is undefined');

      expect(getAddress(roller)).to.equal(getAddress(user.account.address));
    });

    it('Should revert if a roll is already in progress', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      await expect(
        Dice.write.roll([50n, 0], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('RollInProgress');
    });
  });

  describe('Roll Result', function () {
    it('Should return 0 if no roll has been made', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0n);
    });

    it('Should return 0 if a roll is in progress', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0n);
    });

    it('Should correctly identify when a roll is in progress', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const beforeRoll = await Dice.read.isRollInProgress({
        account: user.account.address,
      });

      expect(beforeRoll).to.be.false;

      await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const afterRoll = await Dice.read.isRollInProgress({
        account: user.account.address,
      });

      expect(afterRoll).to.be.true;
    });

    it('Should correctly calculate and store roll result after fulfillment', async function () {
      const { Dice, MockVRFCoordinator, user } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const randomWord = 26n;
      const randomWords = [randomWord];
      try {
        await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
          account: user.account.address,
        });
      } catch (err) {
        // console.error(err);
      }

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(27n);

      const rollInProgress = await Dice.read.isRollInProgress({
        account: user.account.address,
      });
      expect(rollInProgress).to.be.false;
    });

    // it('Should emit DiceRollFulfilled event when random words are fulfilled', async function () {
    //   const { Dice, MockVRFCoordinator, user } = await loadFixture(deployDiceFixture);
    //
    //   await Dice.write.roll([50n, 0], {
    //     user: user.account.address,
    //     value: 1000000000000000n,
    //   });
    //
    //   const randomWords = [123456789n];
    //   const diceAddress = Dice.address;
    //
    //   const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
    //     account: user.account.address,
    //   });
    //   const publicClient = await hre.viem.getPublicClient();
    //   const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    //   const events = await Dice.getEvents.DiceRollFulfilled(
    //     {
    //       roller: user.account.address,
    //     },
    //     {
    //       blockHash: receipt.blockHash,
    //     },
    //   );
    //
    //   expect(events.length).to.equal(1);
    //
    //   const roller = events[0].args.roller;
    //   if (!roller) throw new Error('roller is undefined');
    //   expect(getAddress(roller)).to.equal(getAddress(user.account.address));
    //
    //   const expectedResult = (123456789n % 100n) + 1n;
    //   expect(events[0].args.result).to.equal(expectedResult);
    // });
  });
});
