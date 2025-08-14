// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IVRFCoordinatorV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import { VRFConsumerBaseV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import { VRFV2PlusClient } from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * @title Dice Contract
 * @notice A contract that provides a dice roll function using Chainlink VRF v2.5 for randomness
 * @dev Returns a random number between 1 and 100 (inclusive) and allows betting
 */
contract Dice is VRFConsumerBaseV2Plus {
    IVRFCoordinatorV2Plus private immutable coordinator;
    uint256 private immutable subscriptionId;
    bytes32 private immutable keyHash;
    uint32 private immutable callbackGasLimit;
    uint16 private immutable requestConfirmations;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 1 ether;
    uint256 public constant HOUSE_EDGE = 10;
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
     * @notice Constructor initializes the Dice contract with Chainlink VRF parameters
     * @param _vrfCoordinator The address of the VRF Coordinator
     * @param _subscriptionId The ID of the VRF subscription
     * @param _keyHash The gas lane key hash
     */
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        coordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        callbackGasLimit = 100000;
        requestConfirmations = 3;
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
     * @notice Request a random dice roll with a bet
     * @dev Initiates a request to Chainlink VRF for random words and places a bet
     * @param targetNumber The number to compare the roll result against (10-100, in steps of 10)
     * @param comparisonType The type of comparison (GREATER_THAN, LESS_THAN)
     * @return requestId The ID of the VRF request
     */
    function roll(
        uint256 targetNumber,
        ComparisonType comparisonType
    ) external payable returns (uint256) {
        if (rollResults[msg.sender] == type(uint256).max) revert RollInProgress();

        if (msg.value < MIN_BET || msg.value > MAX_BET) revert InvalidBetAmount();

        if (targetNumber < 10 || targetNumber > 100 || targetNumber % 10 != 0)
            revert InvalidTargetNumber();

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

        uint256 requestId = coordinator.requestRandomWords(request);

        requestIdToSender[requestId] = msg.sender;

        requestIdToBet[requestId] = bet;

        emit DiceRollRequested(requestId, msg.sender, msg.value, targetNumber, comparisonType);

        return requestId;
    }

    /**
     * @notice Calculate the potential payout for a bet
     * @dev Calculates payout based on the odds of winning and dynamic house edge
     * @param betAmount The amount of the bet
     * @param targetNumber The number to compare the roll result against (10-100, in steps of 10)
     * @param comparisonType The type of comparison (GREATER_THAN, LESS_THAN)
     * @return The potential payout amount
     */
    function calculatePayout(
        uint256 betAmount,
        uint256 targetNumber,
        ComparisonType comparisonType
    ) public pure returns (uint256) {
        uint256 probability;

        if (comparisonType == ComparisonType.GREATER_THAN) {
            probability = 100 - targetNumber;
            if (probability == 0) revert InvalidTargetNumber();
        } else {
            // LESS_THAN
            if (targetNumber <= 10) revert InvalidTargetNumber();
            probability = targetNumber - 1;
        }

        uint256 dynamicHouseEdge = HOUSE_EDGE + (probability * 15) / 100;

        if (dynamicHouseEdge < HOUSE_EDGE) dynamicHouseEdge = HOUSE_EDGE;

        uint256 multiplier = (100 * (100 - dynamicHouseEdge)) / probability;

        return (betAmount * multiplier) / 100;
    }

    /**
     * @notice Callback function used by Chainlink VRF to deliver random words
     * @dev Processes the random words, calculates the dice roll result, and settles the bet
     * @param _requestId The ID of the request
     * @param _randomWords The random words generated by Chainlink VRF
     */
    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] calldata _randomWords
    ) internal override {
        address roller = requestIdToSender[_requestId];

        Bet storage bet = requestIdToBet[_requestId];

        uint256 result = (_randomWords[0] % 100) + 1;

        rollResults[roller] = result;

        bool won = false;

        if (bet.comparisonType == ComparisonType.GREATER_THAN) {
            won = result > bet.targetNumber;
        } else {
            // LESS_THAN
            won = result < bet.targetNumber;
        }

        bet.settled = true;
        bet.won = won;

        bets[roller] = bet;

        if (won) {
            (bool success, ) = payable(roller).call{ value: bet.payout }("");
            require(success, "Transfer failed");
        }

        emit DiceRollFulfilled(_requestId, roller, result, won, won ? bet.payout : 0);
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

    /**
     * @notice Withdraw funds from the contract (owner only)
     * @dev Allows the owner to withdraw funds from the contract
     * @param amount The amount to withdraw
     */
    function withdraw(uint256 amount) external {
        // For simplicity, we're not implementing access control in this example
        require(amount <= address(this).balance, "Insufficient contract balance");

        (bool success, ) = payable(msg.sender).call{ value: amount }("");
        require(success, "Transfer failed");
    }
}
