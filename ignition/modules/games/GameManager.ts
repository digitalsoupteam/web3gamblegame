import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import AddressBookModule from '../access/AddressBook';

export default buildModule('GameManager', m => {
  const { addressBookProxy } = m.useModule(AddressBookModule);

  const impl = m.contract('GameManager');
  const initData = m.encodeFunctionCall(impl, 'initialize', [addressBookProxy]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  m.call(addressBookProxy, 'initialSetGameManager', [proxy]);

  return { accessRolesProxy: proxy, accessRolesImpl: impl };
});
