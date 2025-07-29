import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VRF_COORDINATOR_ADDRESSES = {
  baseSepolia: "0x2D159AE3b973FFF05f1BF6fC1f2e33d2C4f7Ee3a",
  hardhat: "0x0000000000000000000000000000000000000000"
};

const SUBSCRIPTION_IDS = {
  baseSepolia: 1,
  hardhat: 1
};

const KEY_HASHES = {
  baseSepolia: "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef",
  hardhat: "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef"
};

export default buildModule("DiceModule", (m) => {
  const network = process.env.HARDHAT_NETWORK || "hardhat";
  
  let vrfCoordinatorAddress = VRF_COORDINATOR_ADDRESSES[network as keyof typeof VRF_COORDINATOR_ADDRESSES];
  
  if (network === "hardhat") {
    const mockVRFCoordinator = m.contract("MockVRFCoordinator");
    vrfCoordinatorAddress = mockVRFCoordinator.address;
  }
  
  const subscriptionId = SUBSCRIPTION_IDS[network as keyof typeof SUBSCRIPTION_IDS];
  const keyHash = KEY_HASHES[network as keyof typeof KEY_HASHES];
  
  const dice = m.contract("Dice", [
    vrfCoordinatorAddress,
    subscriptionId,
    keyHash
  ]);
  
  return { dice };
});