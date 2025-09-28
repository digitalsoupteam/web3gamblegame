import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import addressBookModule from '../access/AddressBook';
import { ETH, USDC, CHAINLINK_ETH, CHAINLINK_USDC } from '../../../constants/addresses';

export default buildModule('TokensManagerModule', m => {
  const { addressBookProxy } = m.useModule(addressBookModule);
  const impl = m.contract('TokensManager');
  const initData = m.encodeFunctionCall(impl, 'initialize', [
    addressBookProxy,
    [ETH, USDC],
    [CHAINLINK_ETH, CHAINLINK_USDC],
  ]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);
  const addressBook = m.contractAt("AddressBook", addressBookProxy);
  m.call(addressBook, 'initialSetTokensManager', [proxy]);
  return { tokensManagerProxy: proxy, tokensManagerImpl: impl };
});
