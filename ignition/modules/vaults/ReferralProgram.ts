import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import addressBookModule from '../access/AddressBook';

export default buildModule('ReferralProgramModule', m => {
  const { addressBookProxy } = m.useModule(addressBookModule);
  const impl = m.contract('ReferralProgram');
  const initialReferralPercent = 500; // 5% (500 / 10000)
  const initData = m.encodeFunctionCall(impl, 'initialize', [addressBookProxy, initialReferralPercent]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);
  const addressBook = m.contractAt('AddressBook', addressBookProxy);
  m.call(addressBook, 'initialSetReferralProgram', [proxy]);
  return { referralProgramProxy: proxy, referralProgramImpl: impl };
});
