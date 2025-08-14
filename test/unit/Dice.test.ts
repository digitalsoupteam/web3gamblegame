/**
 * OUTDATED TEST FILE
 * 
 * This file tests an older version of the Dice contract without betting functionality.
 * It is kept for reference but should not be used for current testing.
 * 
 * For current tests, see:
 * - DiceTest.ts: Tests payout calculations
 * - DiceEconomyTest.ts: Tests economy stability
 */

import { expect } from "chai";
import hre from "hardhat";
import { getAddress } from "viem";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import '@typechain/hardhat'
import '@nomicfoundation/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import { Dice } from "../../typechain-types/contracts/Dice";

describe("Dice Contract", function () {
  // We define a fixture to reuse the same setup in every test
  async function deployDiceFixture() {
    // Create a mock VRF Coordinator for testing
    const MockVRFCoordinator = await hre.viem.deployContract("MockVRFCoordinator", []);
    const mockVRFCoordinatorAddress = getAddress(MockVRFCoordinator.address);

    // Deploy the Dice contract
    const Dice = await hre.viem.deployContract("Dice", [
      mockVRFCoordinatorAddress,
      1n, // Mock subscription ID as BigInt
      0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef // Mock key hash as bytes32
    ]);

    return { Dice, MockVRFCoordinator };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { Dice } = await loadFixture(deployDiceFixture);
      expect(Dice.address).to.not.equal(0);
    });
  });

  describe("Roll Function", function () {
    it("Should emit DiceRollRequested event when roll is called", async function () {
      const { Dice } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Call the roll function
      const tx = await Dice.write.roll({
        account
      });

      // Get the transaction receipt
      const receipt = await hre.viem.publicClient.waitForTransactionReceipt({ hash: tx });

      // Check if the DiceRollRequested event was emitted
      const events = await Dice.getEvents.DiceRollRequested({
        blockHash: receipt.blockHash
      });

      expect(events.length).to.equal(1);
      expect(events[0].args.roller).to.equal(account.account.address);
    });

    it("Should revert if a roll is already in progress", async function () {
      const { Dice } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Call the roll function once
      await Dice.write.roll({
        account
      });

      // Call the roll function again, should revert
      await expect(
        Dice.write.roll({
          account
        })
      ).to.be.rejectedWith("RollInProgress");
    });
  });

  describe("Roll Result", function () {
    it("Should return 0 if no roll has been made", async function () {
      const { Dice } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Check the roll result
      const result = await Dice.read.getLatestRollResult({
        account
      });

      expect(result).to.equal(0n);
    });

    it("Should return 0 if a roll is in progress", async function () {
      const { Dice } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Call the roll function
      await Dice.write.roll({
        account
      });

      // Check the roll result
      const result = await Dice.read.getLatestRollResult({
        account
      });

      expect(result).to.equal(0n);
    });

    it("Should correctly identify when a roll is in progress", async function () {
      const { Dice } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Check if a roll is in progress before calling roll
      const beforeRoll = await Dice.read.isRollInProgress({
        account
      });

      expect(beforeRoll).to.be.false;

      // Call the roll function
      await Dice.write.roll({
        account
      });

      // Check if a roll is in progress after calling roll
      const afterRoll = await Dice.read.isRollInProgress({
        account
      });

      expect(afterRoll).to.be.true;
    });

    it("Should correctly calculate and store roll result after fulfillment", async function () {
      const { Dice, MockVRFCoordinator } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Call the roll function
      await Dice.write.roll({
        account
      });

      // Create a random word that will result in a specific dice roll
      // For example, if we want to test a roll of 7, we can use 7-1=6 as the remainder when divided by 20
      // So we need a number that gives remainder 6 when divided by 20, like 26, 46, etc.
      const randomWord = 26n; // This will result in a roll of 7 (26 % 20 + 1 = 7)
      const randomWords = [randomWord];

      // Get the Dice contract address
      const diceAddress = await Dice.getAddress();

      // Fulfill the random words request
      await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account
      });

      // Check the roll result
      const result = await Dice.read.getLatestRollResult({
        account
      });

      // Verify the result is as expected (7)
      expect(result).to.equal(7n);

      // Verify the roll is no longer in progress
      const rollInProgress = await Dice.read.isRollInProgress({
        account
      });
      expect(rollInProgress).to.be.false;
    });

    it("Should emit DiceRollFulfilled event when random words are fulfilled", async function () {
      const { Dice, MockVRFCoordinator } = await loadFixture(deployDiceFixture);

      // Get a test account
      const [account] = await hre.viem.getWalletClients();

      // Call the roll function
      await Dice.write.roll({
        account
      });

      // Create a random word
      const randomWords = [123456789n];

      // Get the Dice contract address
      const diceAddress = await Dice.getAddress();

      // Fulfill the random words request
      const tx = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account
      });

      // Get the transaction receipt
      const receipt = await hre.viem.publicClient.waitForTransactionReceipt({ hash: tx });

      // Check if the DiceRollFulfilled event was emitted
      const events = await Dice.getEvents.DiceRollFulfilled({
        blockHash: receipt.blockHash
      });

      expect(events.length).to.equal(1);
      expect(events[0].args.roller).to.equal(account.account.address);

      // Calculate the expected result (123456789 % 20 + 1)
      const expectedResult = (123456789n % 20n) + 1n;
      expect(events[0].args.result).to.equal(expectedResult);
    });
  });
});
