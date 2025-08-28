import { getAddress, PublicClient } from 'viem';

export async function getImplementationAddress(
  client: PublicClient,
  proxyAddress: `0x${string}`,
): Promise<`0x${string}`> {
  const storage = await client.getStorageAt({
    address: proxyAddress,
    slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  });

  if (storage === undefined) return '0x';

  return getAddress(`0x${storage.slice(26)}`);
}
