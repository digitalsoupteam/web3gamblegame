import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import multisigWalletModule from './MultisigWallet';

export default buildModule('AccessRolesModule', m => {
  const { multisigProxy } = m.useModule(multisigWalletModule);
  const administrators = ['0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'];
  const impl = m.contract('AccessRoles');
  const initData = m.encodeFunctionCall(impl, 'initialize', [multisigProxy, administrators]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { accessRolesProxy: proxy, accessRolesImpl: impl };
});
