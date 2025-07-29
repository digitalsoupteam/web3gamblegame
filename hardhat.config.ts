import type {HardhatUserConfig} from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@typechain/hardhat";

const config: HardhatUserConfig = {
    solidity: "0.8.28",
    networks: {
        hardhat: {
            chainId: 1337,
            blockGasLimit: 30_000_000,
            accounts: {
                count: 10,
            },
            loggingEnabled: false,
        },
        // baseSepolia: {
        //     url: "https://sepolia.base.org",
        //     chainId: 84532,
        //     accounts: [process.env.PRIVATE_KEY!],
        // },
    },
};

export default config;
