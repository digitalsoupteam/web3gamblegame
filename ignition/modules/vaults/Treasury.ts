import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import addressBookModule from '../access/AddressBook';

export default buildModule('PauseManagerModule', m => {
    const { addressBookProxy } = m.useModule(addressBookModule);
    const impl = m.contract('Treasury');
    const initData = m.encodeFunctionCall(impl, 'initialize', [addressBookProxy]);
    const proxy = m.contract('ERC1967Proxy', [impl, initData]);
    m.call(addressBookProxy, 'initialSetTreasury', [proxy]);
    return { PauseManagerProxy: proxy, PauseManagerImpl: impl };
});
