import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';

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

    const gameManagerImpl = await hre.viem.deployContract('GameManager');
    const gameManagerInitData = encodeFunctionData({
      abi: gameManagerImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address],
    });
    const gameManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      gameManagerImpl.address,
      gameManagerInitData,
    ]);
    const gameManager = await hre.viem.getContractAt('GameManager', gameManagerProxy.address);

    await addressBook.write.initialSetGameManager([gameManager.address], {
      account: deployer.account.address,
    });

    const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);
    const DiceImpl = await hre.viem.deployContract('Dice', [MockVRFCoordinator.address]);
    const diceInitData = encodeFunctionData({
      abi: DiceImpl.abi,
      functionName: 'initialize',
      args: [
        MockVRFCoordinator.address,
        1n,
        '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
        addressBook.address,
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

    await gameManager.write.addGame([Dice.address], {
      account: ownersMultisig.address,
    });

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
      addressBook,
      gameManager,
      ownersMultisig,
      administrator,
      user,
      owner1,
      owner2,
      deployer,
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { Dice } = await loadFixture(deployDiceFixture);
      expect(Dice.address).to.not.equal(0);
    });

    it('Should be registered in GameManager', async function () {
      const { Dice, gameManager } = await loadFixture(deployDiceFixture);

      const isRegistered = await gameManager.read.isGameExist([Dice.address]);
      expect(isRegistered).to.be.true;
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

    it('Should revert if the game is not registered in GameManager', async function () {
      const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);
      const { user, addressBook } = await loadFixture(deployDiceFixture);

      const UnregisteredDiceImpl = await hre.viem.deployContract('Dice', [
        MockVRFCoordinator.address,
      ]);
      const diceInitData = encodeFunctionData({
        abi: UnregisteredDiceImpl.abi,
        functionName: 'initialize',
        args: [
          MockVRFCoordinator.address,
          1n,
          '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
          addressBook.address,
          1,
          100,
          parseEther('0.001'),
          parseEther('1'),
          10,
        ],
      });
      const UnregisteredDiceProxy = await hre.viem.deployContract('ERC1967Proxy', [
        UnregisteredDiceImpl.address,
        diceInitData,
      ]);
      const UnregisteredDice = await hre.viem.getContractAt('Dice', UnregisteredDiceProxy.address);
      await setBalance(UnregisteredDice.address, parseEther('100'));

      await expect(
        UnregisteredDice.write.roll([50n, 0], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith("Game doesn't exist in GameManager");
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

  describe('Payout Calculation', function () {
    it('Should correctly calculate payout for GREATER_THAN bet', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      const payout = await Dice.read.calculatePayout([betAmount, targetNumber, comparisonType], {
        account: user.account.address,
      });

      // For GREATER_THAN with targetNumber 50, probability is 50%
      // Dynamic house edge = 10 + (50 * 15) / 100 = 17.5% (rounded to 17 in solidity)
      // Multiplier = (100 * (100 - 17)) / 50 = 166
      // Payout = (betAmount * 166) / 100
      const expectedPayout = (betAmount * 166n) / 100n;
      expect(payout).to.equal(expectedPayout);
    });

    it('Should correctly calculate payout for LESS_THAN bet', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 1; // LESS_THAN

      const payout = await Dice.read.calculatePayout([betAmount, targetNumber, comparisonType], {
        account: user.account.address,
      });

      // For LESS_THAN with targetNumber 50, probability is 49%
      // Dynamic house edge = 10 + (49 * 15) / 100 = 17.35% (rounded to 17 in solidity)
      // Multiplier = (100 * (100 - 17)) / 49 = 169
      // Payout = (betAmount * 169) / 100
      const expectedPayout = (betAmount * 169n) / 100n;
      expect(payout).to.equal(expectedPayout);
    });

    it('Should revert for invalid target number (probability = 0)', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      await expect(
        Dice.read.calculatePayout([betAmount, 100n, 0], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('InvalidTargetNumber');

      await expect(
        Dice.read.calculatePayout([betAmount, 1n, 1], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('InvalidTargetNumber');
    });
  });

  describe('Bet Information', function () {
    it('Should return empty bet details when no bet has been placed', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(0n);
      expect(bet[1]).to.equal(0n);
      expect(bet[2]).to.equal(0);
      expect(bet[3]).to.be.false;
      expect(bet[4]).to.be.false;
      expect(bet[5]).to.equal(0n);
    });

    it('Should return correct bet details after placing a bet', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      await Dice.write.roll([targetNumber, comparisonType], {
        account: user.account.address,
        value: betAmount,
      });

      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetNumber);
      expect(bet[2]).to.equal(comparisonType);
      expect(bet[3]).to.be.false;
      expect(bet[4]).to.be.false;

      const calculatedPayout = await Dice.read.calculatePayout(
        [betAmount, targetNumber, comparisonType],
        {
          account: user.account.address,
        },
      );
      expect(bet[5]).to.equal(calculatedPayout);
    });

    it('Should update bet details after fulfillment', async function () {
      const { Dice, MockVRFCoordinator, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      await Dice.write.roll([targetNumber, comparisonType], {
        account: user.account.address,
        value: betAmount,
      });

      const randomWord = 74n;
      const randomWords = [randomWord];

      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
        account: user.account.address,
      });

      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetNumber);
      expect(bet[2]).to.equal(comparisonType);
      expect(bet[3]).to.be.true;
      expect(bet[4]).to.be.true;
    });
  });

  describe('Contract Balance', function () {
    it('Should return the correct contract balance', async function () {
      const { Dice, publicClient } = await loadFixture(deployDiceFixture);

      const contractBalance = await Dice.read.getContractBalance();
      const actualBalance = await publicClient.getBalance({ address: Dice.address });

      expect(contractBalance).to.equal(actualBalance);
    });

    it('Should update contract balance after receiving a bet', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      const initialBalance = await Dice.read.getContractBalance();
      const betAmount = 1000000000000000n;

      await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: betAmount,
      });

      const newBalance = await Dice.read.getContractBalance();
      expect(newBalance).to.equal(initialBalance + betAmount);
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
      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
        account: user.account.address,
      });

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(27n);

      const rollInProgress = await Dice.read.isRollInProgress({
        account: user.account.address,
      });
      expect(rollInProgress).to.be.false;
    });

    it('Should emit DiceRollFulfilled event when random words are fulfilled', async function () {
      const { Dice, MockVRFCoordinator, user } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const randomWords = [123456789n];
      const diceAddress = Dice.address;

      const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account: user.account.address,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.DiceRollFulfilled(
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

      const expectedResult = (123456789n % 100n) + 1n;
      expect(events[0].args.result).to.equal(expectedResult);
    });
  });
  describe('Admin Functions', function () {
    it('Should allow owners multisig to pause the game', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const initialPauseState = await Dice.read.isPaused();
      expect(initialPauseState).to.be.false;

      await Dice.write.pause({
        account: ownersMultisig.address,
      });

      const pausedState = await Dice.read.isPaused();
      expect(pausedState).to.be.true;
    });

    it('Should emit GamePaused event when paused', async function () {
      const { Dice, ownersMultisig, publicClient } = await loadFixture(deployDiceFixture);

      const txHash = await Dice.write.pause({
        account: ownersMultisig.address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.GamePaused(
        {
          pauser: ownersMultisig.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);
      const pauser = events[0].args.pauser;
      if (!pauser) throw new Error('pauser is undefined');
      expect(getAddress(pauser)).to.equal(getAddress(ownersMultisig.address));
    });

    it('Should prevent non-owners from pausing the game', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.pause({
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should prevent betting when game is paused', async function () {
      const { Dice, ownersMultisig, user } = await loadFixture(deployDiceFixture);

      await Dice.write.pause({
        account: ownersMultisig.address,
      });

      await expect(
        Dice.write.roll([50n, 0], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('GameIsPaused');
    });

    it('Should allow owners multisig to unpause the game', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      await Dice.write.pause({
        account: ownersMultisig.address,
      });

      const pausedState = await Dice.read.isPaused();
      expect(pausedState).to.be.true;

      await Dice.write.unpause({
        account: ownersMultisig.address,
      });

      const unpausedState = await Dice.read.isPaused();
      expect(unpausedState).to.be.false;
    });

    it('Should emit GameUnpaused event when unpaused', async function () {
      const { Dice, ownersMultisig, publicClient } = await loadFixture(deployDiceFixture);

      await Dice.write.pause({
        account: ownersMultisig.address,
      });

      const txHash = await Dice.write.unpause({
        account: ownersMultisig.address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.GameUnpaused(
        {
          unpauser: ownersMultisig.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);
      const unpauser = events[0].args.unpauser;
      if (!unpauser) throw new Error('unpauser is undefined');
      expect(getAddress(unpauser)).to.equal(getAddress(ownersMultisig.address));
    });

    it('Should prevent non-owners from unpausing the game', async function () {
      const { Dice, ownersMultisig, user } = await loadFixture(deployDiceFixture);

      await Dice.write.pause({
        account: ownersMultisig.address,
      });

      await expect(
        Dice.write.unpause({
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    // it('Should allow owners multisig to withdraw funds', async function () {
    //   const { Dice, owner1, ownersMultisig, publicClient } = await loadFixture(deployDiceFixture);
    //
    //   const initialContractBalance = await Dice.read.getContractBalance();
    //   const initialMultisigBalance = await publicClient.getBalance({
    //     address: ownersMultisig.address,
    //   });
    //
    //   const withdrawAmount = initialContractBalance / 2n;
    //
    //   await Dice.write.withdraw([withdrawAmount], {
    //     account: owner1.account.address,
    //   });
    //
    //   const finalContractBalance = await Dice.read.getContractBalance();
    //   const finalMultisigBalance = await publicClient.getBalance({
    //     address: ownersMultisig.address,
    //   });
    //   const owner1Balance = await publicClient.getBalance({
    //     address: owner1.account.address,
    //   });
    //   console.log(finalContractBalance, finalMultisigBalance, owner1Balance);
    //
    //   expect(finalContractBalance).to.equal(initialContractBalance - withdrawAmount);
    //
    //   expect(finalMultisigBalance > initialMultisigBalance).to.be.true;
    // });

    // it('Should prevent non-owners from withdrawing funds', async function () {
    //   const { Dice, user } = await loadFixture(deployDiceFixture);
    //
    //   await expect(
    //     Dice.write.withdraw([1000000000000000n], {
    //       account: user.account.address,
    //     }),
    //   ).to.be.rejected;
    // });
    //
    // it('Should prevent withdrawing more than the contract balance', async function () {
    //   const { Dice, owner1 } = await loadFixture(deployDiceFixture);
    //
    //   const contractBalance = await Dice.read.getContractBalance();
    //   const excessiveAmount = contractBalance + 1000000000000000n;
    //
    //   await expect(
    //     Dice.write.withdraw([excessiveAmount], {
    //       account: owner1.account.address,
    //     }),
    //   ).to.be.rejectedWith('Insufficient contract balance');
    // });
  });

  describe('Configuration Functions', function () {
    it('Should allow owners multisig to set minimum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const initialMinBetValue = await Dice.read.minBetValue();
      const newMinBetValue = initialMinBetValue + 1;

      await Dice.write.setMinBetValue([newMinBetValue], {
        account: ownersMultisig.address,
      });

      const updatedMinBetValue = await Dice.read.minBetValue();
      expect(updatedMinBetValue).to.equal(newMinBetValue);
    });

    it('Should prevent setting invalid minimum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const maxBetValue = await Dice.read.maxBetValue();

      await expect(
        Dice.write.setMinBetValue([0], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet value must be greater than 0');

      await expect(
        Dice.write.setMinBetValue([maxBetValue], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet value must be less than max bet');

      await expect(
        Dice.write.setMinBetValue([maxBetValue + 1], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet value must be less than max bet');
    });

    it('Should allow owners multisig to set maximum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const newMaxBetValue = 95;

      await Dice.write.setMaxBetValue([newMaxBetValue], {
        account: ownersMultisig.address,
      });

      const updatedMaxBetValue = await Dice.read.maxBetValue();
      expect(updatedMaxBetValue).to.equal(newMaxBetValue);
    });

    it('Should prevent setting invalid maximum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const minBetValue = await Dice.read.minBetValue();

      await expect(
        Dice.write.setMaxBetValue([101], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet value must be less or equals to 100');

      await expect(
        Dice.write.setMaxBetValue([minBetValue], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet value must be greater than min bet');

      await expect(
        Dice.write.setMaxBetValue([minBetValue - 1], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet value must be greater than min bet');
    });

    it('Should allow owners multisig to set minimum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const initialMinBetAmount = await Dice.read.minBetAmount();
      const newMinBetAmount = initialMinBetAmount + parseEther('0.001');

      await Dice.write.setMinBetAmount([newMinBetAmount], {
        account: ownersMultisig.address,
      });

      const updatedMinBetAmount = await Dice.read.minBetAmount();
      expect(updatedMinBetAmount).to.equal(newMinBetAmount);
    });

    it('Should prevent setting invalid minimum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const maxBetAmount = await Dice.read.maxBetAmount();

      await expect(
        Dice.write.setMinBetAmount([0n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet amount must be greater than 0');

      await expect(
        Dice.write.setMinBetAmount([maxBetAmount], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet amount must be less than max bet');

      await expect(
        Dice.write.setMinBetAmount([maxBetAmount + 1n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet amount must be less than max bet');
    });

    it('Should allow owners multisig to set maximum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const initialMaxBetAmount = await Dice.read.maxBetAmount();
      const newMaxBetAmount = initialMaxBetAmount + parseEther('1');

      await Dice.write.setMaxBetAmount([newMaxBetAmount], {
        account: ownersMultisig.address,
      });

      const updatedMaxBetAmount = await Dice.read.maxBetAmount();
      expect(updatedMaxBetAmount).to.equal(newMaxBetAmount);
    });

    it('Should prevent setting invalid maximum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const minBetAmount = await Dice.read.minBetAmount();

      await expect(
        Dice.write.setMaxBetAmount([minBetAmount], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet amount must be greater than min bet');

      await expect(
        Dice.write.setMaxBetAmount([minBetAmount - 1n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet amount must be greater than min bet');
    });

    it('Should allow owners multisig to set house edge', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      const initialHouseEdge = await Dice.read.houseEdge();
      const newHouseEdge = initialHouseEdge + 5;

      await Dice.write.setHouseEdge([newHouseEdge], {
        account: ownersMultisig.address,
      });

      const updatedHouseEdge = await Dice.read.houseEdge();
      expect(updatedHouseEdge).to.equal(newHouseEdge);
    });

    it('Should prevent setting invalid house edge', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.setHouseEdge([51], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('House edge must be less than or equal to 50');
    });

    it('Should prevent non-owners from changing configuration', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.setMinBetValue([5], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setMaxBetValue([95], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setMinBetAmount([parseEther('0.002')], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setMaxBetAmount([parseEther('2')], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setHouseEdge([15], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });
  });
});
