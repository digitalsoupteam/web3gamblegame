// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVRFCoordinatorV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * @title MockVRFCoordinator
 * @notice A mock implementation of the Chainlink VRF Coordinator for testing
 * @dev This contract simulates the behavior of the VRF Coordinator without requiring an actual Chainlink subscription
 */
contract MockVRFCoordinator is IVRFCoordinatorV2Plus {
    // Mapping to track the last request ID for each consumer
    mapping(address => uint256) private lastRequestId;

    // Counter for generating unique request IDs
    uint256 private requestIdCounter;

    /**
     * @notice Request random words from the VRF Coordinator
     * @dev This is a mock implementation that returns a predictable request ID
     * @param req The random words request
     * @return requestId The ID of the VRF request
     */
    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external override returns (uint256) {
        // Increment the request ID counter
        requestIdCounter++;

        // Store the request ID for this consumer
        lastRequestId[msg.sender] = requestIdCounter;

        return requestIdCounter;
    }

    /**
     * @notice Fulfill a random words request with mock random values
     * @dev This function can be called to simulate the VRF Coordinator fulfilling a request
     * @param consumer The address of the VRF consumer contract
     * @param randomWords The random words to return to the consumer
     */
    function fulfillRandomWords(address consumer, uint256[] memory randomWords) external {
        // Get the last request ID for this consumer
        uint256 requestId = lastRequestId[consumer];

        // Call the fulfillRandomWords function on the consumer
        // This uses a low-level call because we don't have the interface
        (bool success, ) = consumer.call(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                randomWords
            )
        );

        require(success, "Failed to fulfill random words");
    }

    // The following functions are required by the interface but not used in testing

    function getRequestConfig() external pure returns (uint16, uint32, bytes32[] memory) {
        bytes32[] memory keyhashes = new bytes32[](0);
        return (3, 2000000, keyhashes);
    }

    function getSubscription(uint256) external pure override returns (
        uint96 balance,
        uint96 nativeBalance,
        uint64 reqCount,
        address owner,
        address[] memory consumers
    ) {
        address[] memory consumersList = new address[](0);
        return (0, 0, 0, address(0), consumersList);
    }

    function createSubscription() external pure override returns (uint256) {
        return 1;
    }

    function createSubscriptionWithConsumer(address) external pure returns (uint256) {
        return 1;
    }

    function requestSubscriptionOwnerTransfer(uint256 subId, address newOwner) external override {}

    function acceptSubscriptionOwnerTransfer(uint256 subId) external override {}

    function addConsumer(uint256 subId, address consumer) external override {}

    function removeConsumer(uint256 subId, address consumer) external override {}

    function cancelSubscription(uint256 subId, address to) external override {}

    function pendingRequestExists(uint256 subId) external view override returns (bool) {
        return false;
    }

    function getFeeConfig() external pure returns (
        uint32,
        uint32,
        uint32,
        uint32,
        uint32,
        uint32,
        uint32
    ) {
        return (0, 0, 0, 0, 0, 0, 0);
    }

    function getFallbackWeiPerUnitLink() external pure returns (int256) {
        return 0;
    }

    function requestRandomWordsV1(
        bytes32,
        uint256,
        uint16,
        uint32,
        uint32
    ) external pure returns (uint256) {
        return 0;
    }

    function fundSubscriptionWithNative(uint256) external payable override {}

    function fundSubscriptionWithLink(uint256, uint256) external {}

    function withdrawNative(address, uint256) external {}

    function withdrawLink(address, uint256) external {}

    function getSubscriptionOwner(uint256) external pure returns (address) {
        return address(0);
    }

    function getLinkBalance(address) external pure returns (uint256) {
        return 0;
    }

    function getFeeTier(uint256) external pure returns (uint32) {
        return 0;
    }

    function getFeeTierNativePerLink(uint32) external pure returns (int256) {
        return 0;
    }

    function calculateNativePaymentAmount(uint256) external pure returns (uint256) {
        return 0;
    }

    function calculateLinkPaymentAmount(uint256) external pure returns (uint256) {
        return 0;
    }

    function getCurrentSubId() external pure returns (uint256) {
        return 1;
    }

    function recoverFunds(address, address) external {}

    function oracleWithdraw(address, uint256) external {}

    /**
     * @notice Paginate through all active VRF subscriptions.
     * @param startIndex index of the subscription to start from
     * @param maxCount maximum number of subscriptions to return, 0 to return all
     * @return subscriptionIds array of subscription IDs
     */
    function getActiveSubscriptionIds(uint256 startIndex, uint256 maxCount) external pure override returns (uint256[] memory) {
        uint256[] memory subscriptionIds = new uint256[](0);
        return subscriptionIds;
    }
}
