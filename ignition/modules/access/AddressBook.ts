import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import AccessRolesModule from './AccessRoles';

export default buildModule('AddressBookModule', m => {
  const { accessRolesProxy } = m.useModule(AccessRolesModule);
  const impl = m.contract('AddressBook');
  const initData = m.encodeFunctionCall(impl, 'initialize', [accessRolesProxy]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { addressBookProxy: proxy, addressBookImpl: impl };
});
