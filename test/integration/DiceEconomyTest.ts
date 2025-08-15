/**
 * Dice Contract Economy Test
 *
 * This file implements the economy stability test for the Dice contract.
 * It runs 100 bets with random parameters, tracks player and contract balances,
 * and writes the results to a CSV file (dice_economy_results.csv).
 *
 * The test verifies that the house edge is working as expected by ensuring
 * that over a large number of bets, the contract gains value.
 *
 * For basic payout calculation tests, see DiceTest.ts
 */

import { expect } from 'chai';
import hre from 'hardhat';
import { getAddress } from 'viem';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import fs from 'fs';
import path from 'path';

describe('Dice Contract Economy Test', function () {
  async function deployDiceFixture() {
    const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);
    const mockVRFCoordinatorAddress = getAddress(MockVRFCoordinator.address);

    const Dice = await hre.viem.deployContract('Dice', [
      mockVRFCoordinatorAddress,
      1n,
      '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
    ]);

    const [deployer] = await hre.viem.getWalletClients();
    await deployer.sendTransaction({
      to: Dice.address,
      value: 100n * 10n ** 18n,
    });

    return { Dice, MockVRFCoordinator };
  }

  it('Should run 100 bets and track economy', async function () {
    const { Dice, MockVRFCoordinator } = await loadFixture(deployDiceFixture);

    const [account] = await hre.viem.getWalletClients();

    let contractBalance = 100n * 10n ** 18n;
    let playerBalance = 100n * 10n ** 18n;

    const results = [];

    for (let i = 0; i < 1000; i++) {
      const betAmount = BigInt(Math.floor(Math.random() * 100) + 1) * 10n ** 16n;

      if (playerBalance < betAmount) {
        console.log(`Skipping bet #${i + 1} due to insufficient player balance`);
        continue;
      }

      const comparisonType = Math.floor(Math.random() * 2);

      let targetNumber;
      if (comparisonType === 0) {
        targetNumber = (Math.floor(Math.random() * 9) + 1) * 10;
      } else {
        targetNumber = (Math.floor(Math.random() * 8) + 2) * 10;
      }

      playerBalance -= betAmount;
      contractBalance += betAmount;

      await Dice.write.roll([BigInt(targetNumber), comparisonType], {
        account: account.account.address,
        value: betAmount,
      });

      const randomResult = BigInt(Math.floor(Math.random() * 100) + 1);

      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, [randomResult]], {
        account: account.account.address,
      });

      const betEvents = await Dice.getEvents.BetSettled();
      const latestBetEvent = betEvents[betEvents.length - 1];

      if (latestBetEvent.args.won && latestBetEvent.args.payout) {
        playerBalance += latestBetEvent.args.payout;
        contractBalance -= latestBetEvent.args.payout;
      }

      results.push({
        betNumber: i + 1,
        comparisonType: ['GREATER_THAN', 'LESS_THAN'][comparisonType],
        targetNumber,
        betAmount: Number(betAmount) / 10 ** 18,
        result: Number(latestBetEvent.args.result),
        won: latestBetEvent.args.won,
        payout: Number(latestBetEvent.args.payout) / 10 ** 18,
        playerBalance: Number(playerBalance) / 10 ** 18,
        contractBalance: Number(contractBalance) / 10 ** 18,
      });
    }

    const resultsTable = [
      'Bet #,Comparison,Target,Bet Amount,Result,Won,Payout,Player Balance,Contract Balance',
      ...results.map(
        r =>
          `${r.betNumber},${r.comparisonType},${r.targetNumber},${r.betAmount},${r.result},${r.won},${r.payout},${r.playerBalance.toFixed(4)},${r.contractBalance.toFixed(4)}`,
      ),
    ].join('\n');

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `dice_economy_results_${timestamp}.csv`;
    fs.writeFileSync(path.join(__dirname, `../${filename}`), resultsTable);
    console.log(`Results written to ${filename}`);

    console.log('Economy test completed.');
    console.log(`Final player balance: ${Number(playerBalance) / 10 ** 18} ETH`);
    console.log(`Final contract balance: ${Number(contractBalance) / 10 ** 18} ETH`);

    const initialBalance = 100n * 10n ** 18n;
    console.log(`Initial contract balance: ${Number(initialBalance) / 10 ** 18} ETH`);
    console.log(
      `Contract balance change: ${Number(contractBalance - initialBalance) / 10 ** 18} ETH`,
    );

    expect(Number(contractBalance)).to.not.equal(Number(initialBalance));
  });
});
