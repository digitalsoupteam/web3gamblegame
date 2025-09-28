import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import addressBookModule from './AddressBook';

export default buildModule('PauseManagerModule', m => {
  const { addressBookProxy } = m.useModule(addressBookModule);
  const impl = m.contract('PauseManager');
  const initData = m.encodeFunctionCall(impl, 'initialize', [addressBookProxy]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);
  const addressBook = m.contractAt("AddressBook", addressBookProxy);
  m.call(addressBook, 'initialSetPauseManager', [proxy]);
  return { pauseManagerProxy: proxy, pauseManagerImpl: impl };
});
