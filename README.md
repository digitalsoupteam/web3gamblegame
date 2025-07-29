# Dice Contract with Chainlink VRF

This project implements a Dice contract that uses Chainlink VRF v2.5 for verifiable random number generation. The contract provides a `roll` function that returns a random number between 1 and 20.

## Contract Overview

The Dice contract has the following features:

- **roll()**: Initiates a request for a random number and returns a request ID
- **getLatestRollResult()**: Returns the latest roll result for the caller (1-20)
- **isRollInProgress()**: Checks if a roll is currently in progress for the caller

The contract uses Chainlink VRF v2.5 to ensure that the random numbers are verifiably random and cannot be manipulated by miners, users, or even the contract creators.

## Development

### Prerequisites

- Node.js and npm
- Hardhat

### Installation

```shell
npm install
```

### Local Development

For local development, the project includes a MockVRFCoordinator contract that simulates the behavior of the Chainlink VRF Coordinator.

```shell
# Start a local Hardhat node
npx hardhat node

# Deploy the contracts to the local node
npx hardhat ignition deploy ./ignition/modules/dice.ts
```

### Testing

```shell
# Run the tests
npx hardhat test

# Run the tests with gas reporting
REPORT_GAS=true npx hardhat test
```

## Deployment

### Base Sepolia Testnet

Before deploying to Base Sepolia testnet, you need to:

1. Create a Chainlink VRF subscription at [vrf.chain.link](https://vrf.chain.link)
2. Fund the subscription with LINK tokens
3. Update the subscription ID in `ignition/modules/dice.ts`
4. Set your private key in the environment variable `PRIVATE_KEY`

```shell
# Deploy to Base Sepolia testnet
npx hardhat ignition deploy ./ignition/modules/dice.ts --network baseSepolia
```

### Mainnet Deployment

For mainnet deployment, you'll need to:

1. Add the mainnet configuration to `hardhat.config.ts`
2. Update the VRF Coordinator address, subscription ID, and key hash in `ignition/modules/dice.ts`
3. Set your private key in the environment variable `PRIVATE_KEY`

```shell
# Deploy to mainnet
npx hardhat ignition deploy ./ignition/modules/dice.ts --network mainnet
```

## Chainlink VRF Configuration

The Dice contract requires the following Chainlink VRF parameters:

- **VRF Coordinator Address**: The address of the Chainlink VRF Coordinator contract
- **Subscription ID**: The ID of your Chainlink VRF subscription
- **Key Hash**: The gas lane key hash that determines the gas price for the VRF request

These parameters are configured in `ignition/modules/dice.ts` for each network.

## License

This project is licensed under the MIT License.
