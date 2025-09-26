// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IVRFCoordinatorV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import { VRFConsumerBaseV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import { VRFV2PlusClient } from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IGame } from "../_interfaces/games/IGame.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { AddressBook } from "../access/AddressBook.sol";

/**
 * @title Dice Contract
 * @notice A contract that provides a dice roll function using Chainlink VRF v2.5 for randomness
 * @dev Returns a random number between 1 and 100 (inclusive) and allows betting
 * @dev Implements UUPS upgradeable pattern
 */
contract Dice is VRFConsumerBaseV2Plus, UUPSUpgradeable, IGame {
    uint256 private subscriptionId;
    bytes32 private keyHash;
    uint32 private callbackGasLimit;
    uint16 private requestConfirmations;
    IAddressBook private addressBook;
    uint8 public minBetValue;
    uint8 public maxBetValue;
    uint256 public minBetAmount;
    uint256 public maxBetAmount;
    uint8 public houseEdge;

    enum ComparisonType {
        GREATER_THAN,
        LESS_THAN
    }

    struct Bet {
        uint256 amount;
        uint256 targetNumber;
        ComparisonType comparisonType;
        bool settled;
        bool won;
        uint256 payout;
    }

    mapping(uint256 => address) private requestIdToSender;
    mapping(address => uint256) private rollResults;
    mapping(address => Bet) private bets;
    mapping(uint256 => Bet) private requestIdToBet;

    event DiceRollRequested(
        uint256 indexed requestId,
        address indexed roller,
        uint256 betAmount,
        uint256 targetNumber,
        ComparisonType comparisonType
    );
    event DiceRollFulfilled(
        uint256 indexed requestId,
        address indexed roller,
        uint256 result,
        bool won,
        uint256 payout
    );
    event BetSettled(
        address indexed player,
        uint256 amount,
        uint256 targetNumber,
        ComparisonType comparisonType,
        uint256 result,
        bool won,
        uint256 payout
    );

    error RollInProgress();
    error InvalidRollRange();
    error InvalidBetAmount();
    error InvalidTargetNumber();
    error InsufficientContractBalance();

    /**
     * @notice Constructor that disables initializers
     * @param _vrfCoordinator The address of the VRF Coordinator
     */
    constructor(address _vrfCoordinator) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        _disableInitializers();
    }

    /**
     * @notice Initializes the Dice contract with Chainlink VRF parameters
     * @param _vrfCoordinator The address of the VRF Coordinator
     * @param _subscriptionId The ID of the VRF subscription
     * @param _keyHash The gas lane key hash
     * @param _addressBook The address of the AddressBook contract
     * @param _minBetValue The minimum target number value allowed in the game (from 1)
     * @param _maxBetValue The maximum target number value allowed in the game (up to 100)
     * @param _minBetAmount The minimum bet amount allowed in the game (in wei)
     * @param _maxBetAmount The maximum bet amount allowed in the game (in wei)
     * @param _houseEdge The house edge percentage (e.g., 10 for 10%)
     */
    function initialize(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _addressBook,
        uint8 _minBetValue,
        uint8 _maxBetValue,
        uint256 _minBetAmount,
        uint256 _maxBetAmount,
        uint8 _houseEdge
    ) external initializer {
        require(_vrfCoordinator != address(0), "_vrfCoordinator is zero!");
        require(_addressBook != address(0), "_addressBook is zero!");
        require(_houseEdge <= 50, "House edge must be less than or equal to 50");
        require(_minBetAmount > 0, "Min bet amount must be greater than 0");
        require(_minBetAmount < _maxBetAmount, "Min bet amount must be less than max bet");
        require(_maxBetAmount > _minBetAmount, "Max bet amount must be greater than min bet");
        require(_minBetValue > 0, "Min bet value must be greater than 0");
        require(_minBetValue < _maxBetValue, "Min bet value must be less than max bet");
        require(_maxBetValue <= 100, "Max bet value must be less or equals to 100");
        require(_maxBetValue > _minBetValue, "Max bet value must be greater than min bet");
        __UUPSUpgradeable_init();

        s_vrfCoordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        callbackGasLimit = 100000;
        requestConfirmations = 3;
        addressBook = IAddressBook(_addressBook);
        minBetValue = _minBetValue;
        maxBetValue = _maxBetValue;
        minBetAmount = _minBetAmount;
        maxBetAmount = _maxBetAmount;
        houseEdge = _houseEdge;
    }

    /**
     * @notice Authorizes an upgrade to a new implementation
     * @dev Only the owners multisig can upgrade the contract
     */
    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    /**
     * @notice Receive function to allow the contract to receive ETH
     */
    receive() external payable {}

    /**
     * @notice Fallback function to allow the contract to receive ETH
     */
    fallback() external payable {}

    /**
     * @notice Initiates a dice roll with a bet and requests randomness from Chainlink VRF
     * @dev Validates bet amount and target number, stores the bet, and sends a VRF request
     * @param targetNumber The number to compare the roll result against (must be between minBetValue and maxBetValue)
     * @param comparisonType The type of comparison for the bet: GREATER_THAN or LESS_THAN
     * @return requestId The ID of the Chainlink VRF request associated with this dice roll
     */
    function roll(
        uint256 targetNumber,
        ComparisonType comparisonType
    ) external payable returns (uint256) {
        require(
            addressBook.gameManager().isGameExist(address(this)),
            "Game doesn't exist in GameManager"
        );
        addressBook.pauseManager().requireNotPaused();
        
        if (rollResults[msg.sender] == type(uint256).max) revert RollInProgress();
        if (msg.value < minBetAmount || msg.value > maxBetAmount) revert InvalidBetAmount();
        if (targetNumber < minBetValue || targetNumber > maxBetValue) revert InvalidTargetNumber();

        uint256 payout = calculatePayout(msg.value, targetNumber, comparisonType);

        if (address(this).balance < payout) revert InsufficientContractBalance();

        rollResults[msg.sender] = type(uint256).max;

        Bet memory bet = Bet({
            amount: msg.value,
            targetNumber: targetNumber,
            comparisonType: comparisonType,
            settled: false,
            won: false,
            payout: payout
        });

        bets[msg.sender] = bet;

        VRFV2PlusClient.RandomWordsRequest memory request = VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash,
            subId: subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: 1,
            extraArgs: VRFV2PlusClient._argsToBytes(
                VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
            )
        });

        uint256 requestId = s_vrfCoordinator.requestRandomWords(request);

        requestIdToSender[requestId] = msg.sender;

        requestIdToBet[requestId] = bet;

        emit DiceRollRequested(requestId, msg.sender, msg.value, targetNumber, comparisonType);

        return requestId;
    }

    /**
     * @notice Calculate the potential payout for a bet
     * @dev Calculates payout based on the odds of winning and dynamic house edge
     * @param betAmount The amount of the bet
     * @param targetNumber The number to compare the roll result against (between minBetValue and maxBetValue)
     * @param comparisonType The type of comparison (GREATER_THAN, LESS_THAN)
     * @return The potential payout amount
     */
    function calculatePayout(
        uint256 betAmount,
        uint256 targetNumber,
        ComparisonType comparisonType
    ) public view returns (uint256) {
        uint256 probability;

        if (comparisonType == ComparisonType.GREATER_THAN) {
            probability = 100 - targetNumber;
        } else {
            probability = targetNumber - 1;
        }

        if (probability == 0) revert InvalidTargetNumber();

        uint256 dynamicHouseEdge = houseEdge + (probability * 15) / 100;

        if (dynamicHouseEdge < houseEdge) dynamicHouseEdge = houseEdge;

        uint256 multiplier = (100 * (100 - dynamicHouseEdge)) / probability;

        return (betAmount * multiplier) / 100;
    }

    /**
     * @notice Callback function used by Chainlink VRF to deliver random words
     * @dev Processes the random words, calculates the dice roll result, and settles the bet
     * @param requestId The ID of the request
     * @param randomWords The random words generated by Chainlink VRF
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        address roller = requestIdToSender[requestId];

        Bet storage bet = requestIdToBet[requestId];

        uint256 result = (randomWords[0] % 100) + 1;

        rollResults[roller] = result;

        bool won = false;

        if (bet.comparisonType == ComparisonType.GREATER_THAN) {
            won = result > bet.targetNumber;
        } else {
            won = result < bet.targetNumber;
        }

        bet.settled = true;
        bet.won = won;

        bets[roller] = bet;

        if (won) {
            (bool success, ) = payable(roller).call{ value: bet.payout }("");
            require(success, "Transfer failed");
        }

        emit DiceRollFulfilled(requestId, roller, result, won, won ? bet.payout : 0);
        emit BetSettled(
            roller,
            bet.amount,
            bet.targetNumber,
            bet.comparisonType,
            result,
            won,
            won ? bet.payout : 0
        );
    }

    /**
     * @notice Get the latest dice roll result for the caller
     * @dev Returns the latest roll result or 0 if no roll has been made
     * @return The dice roll result (1-100) or 0 if no roll has been made
     */
    function getLatestRollResult() external view returns (uint256) {
        uint256 result = rollResults[msg.sender];

        if (result == type(uint256).max) return 0;

        return result;
    }

    /**
     * @notice Check if a roll is in progress for the caller
     * @dev Returns true if a roll is in progress, false otherwise
     * @return True if a roll is in progress, false otherwise
     */
    function isRollInProgress() external view returns (bool) {
        return rollResults[msg.sender] == type(uint256).max;
    }

    /**
     * @notice Get the current bet details for the caller
     * @dev Returns the current bet details for the caller
     * @return amount The bet amount
     * @return targetNumber The target number
     * @return comparisonType The comparison type
     * @return settled Whether the bet has been settled
     * @return won Whether the bet was won
     * @return payout The potential payout
     */
    function getCurrentBet()
        external
        view
        returns (
            uint256 amount,
            uint256 targetNumber,
            ComparisonType comparisonType,
            bool settled,
            bool won,
            uint256 payout
        )
    {
        Bet memory bet = bets[msg.sender];
        return (bet.amount, bet.targetNumber, bet.comparisonType, bet.settled, bet.won, bet.payout);
    }

    /**
     * @notice Get the contract balance
     * @dev Returns the current balance of the contract
     * @return The contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    //    /**
    //     * @notice Withdraw funds from the contract (owners multisig only)
    //     * @dev Allows the owners multisig to withdraw funds from the contract
    //     * @param amount The amount to withdraw
    //     */
    //    function withdraw(uint256 amount) external {
    //        accessRoles.requireAdministrator(msg.sender);
    //        require(amount <= address(this).balance, "Insufficient contract balance");
    //
    //        (bool success, ) = payable(msg.sender).call{ value: amount }("");
    //        require(success, "Transfer failed");
    //    }

    /**
     * @notice Sets the minimum target number value (owners multisig only)
     * @dev Allows the owners multisig to update the minimum target number value
     * @param newMinBetValue The new minimum target number value
     */
    function setMinBetValue(uint8 newMinBetValue) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newMinBetValue > 0, "Min bet value must be greater than 0");
        require(newMinBetValue < maxBetValue, "Min bet value must be less than max bet");
        minBetValue = newMinBetValue;
    }

    /**
     * @notice Sets the maximum target number value (owners multisig only)
     * @dev Allows the owners multisig to update the maximum target number value
     * @param newMaxBetValue The new maximum target number value
     */
    function setMaxBetValue(uint8 newMaxBetValue) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newMaxBetValue <= 100, "Max bet value must be less or equals to 100");
        require(newMaxBetValue > minBetValue, "Max bet value must be greater than min bet");
        maxBetValue = newMaxBetValue;
    }

    /**
     * @notice Sets the minimum bet amount (owners multisig only)
     * @dev Allows the owners multisig to update the minimum bet amount
     * @param newMinBetAmount The new minimum bet amount
     */
    function setMinBetAmount(uint256 newMinBetAmount) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newMinBetAmount > 0, "Min bet amount must be greater than 0");
        require(newMinBetAmount < maxBetAmount, "Min bet amount must be less than max bet");
        minBetAmount = newMinBetAmount;
    }

    /**
     * @notice Sets the maximum bet amount (owners multisig only)
     * @dev Allows the owners multisig to update the maximum bet amount
     * @param newMaxBetAmount The new maximum bet amount
     */
    function setMaxBetAmount(uint256 newMaxBetAmount) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newMaxBetAmount > minBetAmount, "Max bet amount must be greater than min bet");
        maxBetAmount = newMaxBetAmount;
    }

    /**
     * @notice Sets the house edge percentage (owners multisig only)
     * @dev Allows the owners multisig to update the house edge percentage
     * @param newHouseEdge The new house edge percentage
     */
    function setHouseEdge(uint8 newHouseEdge) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newHouseEdge <= 50, "House edge must be less than or equal to 50");
        houseEdge = newHouseEdge;
    }
}
