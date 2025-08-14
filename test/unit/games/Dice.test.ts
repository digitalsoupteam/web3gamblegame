import { expect } from 'chai'
import hre from 'hardhat'
import { getAddress } from 'viem'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'

describe('Dice Contract', function () {
  async function deployDiceFixture() {
    const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', [])
    const mockVRFCoordinatorAddress = getAddress(MockVRFCoordinator.address)

    const Dice = await hre.viem.deployContract('Dice', [
      mockVRFCoordinatorAddress,
      1n,
      '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
    ])

    const [deployer] = await hre.viem.getWalletClients()
    await deployer.sendTransaction({
      to: Dice.address,
      value: 100n * 10n ** 18n,
    })

    return { Dice, MockVRFCoordinator }
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { Dice } = await loadFixture(deployDiceFixture)
      expect(Dice.address).to.not.equal(0)
    })
  })

  describe('Roll Function', function () {
    it('Should emit DiceRollRequested event when roll is called', async function () {
      const { Dice } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()
      const txHash = await Dice.write.roll([50n, 0], {
        account,
        value: 1000000000000000n, // 0.001 ether (MIN_BET)
      })
      const publicClient = await hre.viem.getPublicClient()
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const events = await Dice.getEvents.DiceRollRequested(
        {
          roller: account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      )

      expect(events.length).to.equal(1)
      const roller = events[0].args.roller
      if (!roller) throw new Error('roller is undefined')

      expect(getAddress(roller)).to.equal(getAddress(account.address))
    })

    it('Should revert if a roll is already in progress', async function () {
      const { Dice } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()

      await Dice.write.roll([50n, 0], {
        account,
        value: 1000000000000000n,
      })

      await expect(
        Dice.write.roll([50n, 0], {
          account,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('RollInProgress')
    })
  })

  describe('Roll Result', function () {
    it('Should return 0 if no roll has been made', async function () {
      const { Dice } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()
      const result = await Dice.read.getLatestRollResult({
        account,
      })

      expect(result).to.equal(0n)
    })

    it('Should return 0 if a roll is in progress', async function () {
      const { Dice } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()

      await Dice.write.roll([50n, 0], {
        account,
        value: 1000000000000000n,
      })

      const result = await Dice.read.getLatestRollResult({
        account,
      })

      expect(result).to.equal(0n)
    })

    it('Should correctly identify when a roll is in progress', async function () {
      const { Dice } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()
      const beforeRoll = await Dice.read.isRollInProgress({
        account,
      })

      expect(beforeRoll).to.be.false

      await Dice.write.roll([50n, 0], {
        account,
        value: 1000000000000000n,
      })

      const afterRoll = await Dice.read.isRollInProgress({
        account,
      })

      expect(afterRoll).to.be.true
    })

    it('Should correctly calculate and store roll result after fulfillment', async function () {
      const { Dice, MockVRFCoordinator } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()

      await Dice.write.roll([50n, 0], {
        account,
        value: 1000000000000000n,
      })

      const randomWord = 26n
      const randomWords = [randomWord]
      const diceAddress = Dice.address

      await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account,
      })

      const result = await Dice.read.getLatestRollResult({
        account,
      })
      expect(result).to.equal(27n)

      const rollInProgress = await Dice.read.isRollInProgress({
        account,
      })
      expect(rollInProgress).to.be.false
    })

    it('Should emit DiceRollFulfilled event when random words are fulfilled', async function () {
      const { Dice, MockVRFCoordinator } = await loadFixture(deployDiceFixture)
      const [{ account }] = await hre.viem.getWalletClients()

      await Dice.write.roll([50n, 0], {
        account,
        value: 1000000000000000n,
      })

      const randomWords = [123456789n]
      const diceAddress = Dice.address
      const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account,
      })
      const publicClient = await hre.viem.getPublicClient()
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const events = await Dice.getEvents.DiceRollFulfilled(
        {
          roller: account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      )

      expect(events.length).to.equal(1)

      const roller = events[0].args.roller
      if (!roller) throw new Error('roller is undefined')
      expect(getAddress(roller)).to.equal(getAddress(account.address))

      const expectedResult = (123456789n % 100n) + 1n
      expect(events[0].args.result).to.equal(expectedResult)
    })
  })
})
