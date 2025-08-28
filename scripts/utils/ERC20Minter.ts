import { network } from 'hardhat';
import {
  parseUnits,
  zeroAddress,
  parseEther,
  Address,
  createWalletClient,
  http,
  createPublicClient,
  erc20Abi,
} from 'viem';
import { hardhat } from 'viem/chains';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { USDC } from '../../constants/addresses';

export default class ERC20Minter {
  public static async mint(tokenAddress: Address, recipient: Address, maxAmountFormated?: number) {
    if (tokenAddress == zeroAddress) {
      const amount = parseUnits(`${maxAmountFormated}`, 18);
      await setBalance(recipient, amount);
      return amount;
    }

    const holders: Record<string, Address> = {
      // [USDT]: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
      [USDC]: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
      // [USDCe]: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245',
    };
    const holderAddress = holders[tokenAddress];

    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [holderAddress],
    });
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [holderAddress],
    });
    const holderClient = createWalletClient({
      chain: hardhat,
      account: holderAddress,
      transport: http(),
    });
    const publicClient = createPublicClient({
      chain: hardhat,
      transport: http(),
    });

    await setBalance(holderAddress, parseEther('0.1'));

    const tokenDecimals = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'decimals',
    });

    const amount = parseUnits(`${maxAmountFormated}`, tokenDecimals as number);

    const holderBalance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [holderAddress],
    });

    if (holderBalance < amount) {
      throw 'ERC20Minter: holder balance < maxAmountFormated';
    }

    await holderClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, amount],
    });

    return amount;
  }
}
