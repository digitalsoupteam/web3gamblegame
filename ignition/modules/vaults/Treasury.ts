import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import addressBookModule from '../access/AddressBook';

export default buildModule('TreasuryModule', m => {
  const { addressBookProxy } = m.useModule(addressBookModule);
  const impl = m.contract('Treasury');
  const initData = m.encodeFunctionCall(impl, 'initialize', [addressBookProxy]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);
  const addressBook = m.contractAt('AddressBook', addressBookProxy);
  m.call(addressBook, 'initialSetTreasury', [proxy]);
  return { treasuryProxy: proxy, treasuryImpl: impl };
});
