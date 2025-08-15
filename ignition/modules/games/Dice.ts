import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const VRF_COORDINATOR_ADDRESSES = {
  baseSepolia: '0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE',
  hardhat: '0x0000000000000000000000000000000000000000',
};

const SUBSCRIPTION_IDS = {
  baseSepolia: 1,
  hardhat: 1,
};

const KEY_HASHES = {
  baseSepolia: '0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71',
  hardhat: '0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
};

export default buildModule('DiceModule', m => {
  const network = process.env.HARDHAT_NETWORK || 'hardhat';

  let vrfCoordinatorAddress;

  if (network === 'hardhat') {
    vrfCoordinatorAddress = m.contract('MockVRFCoordinator');
  } else {
    vrfCoordinatorAddress =
      VRF_COORDINATOR_ADDRESSES[network as keyof typeof VRF_COORDINATOR_ADDRESSES];
  }

  const impl = m.contract('Dice', [
    vrfCoordinatorAddress,
    SUBSCRIPTION_IDS[network as keyof typeof SUBSCRIPTION_IDS],
    KEY_HASHES[network as keyof typeof KEY_HASHES],
  ]);
  const initData = m.encodeFunctionCall(impl, 'initialize', [
    vrfCoordinatorAddress,
    SUBSCRIPTION_IDS[network as keyof typeof SUBSCRIPTION_IDS],
    KEY_HASHES[network as keyof typeof KEY_HASHES],
  ]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { diceImpl: impl, diceProxy: proxy };
});
