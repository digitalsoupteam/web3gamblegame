import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('MultisigWalletModule', m => {
  const owners = [
    '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  ];

  const impl = m.contract('MultisigWallet');
  const initData = m.encodeFunctionCall(impl, 'initialize', [owners.length, owners]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { multisigProxy: proxy, multisigImpl: impl };
});
