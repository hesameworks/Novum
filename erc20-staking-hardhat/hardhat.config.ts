import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-abi-exporter';
import 'solidity-coverage';

const {
  SEPOLIA_RPC, BSC_TEST_RPC, PRIVATE_KEY, ETHERSCAN_API, BSCSCAN_API, CMC_API
} = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  networks: {
    sepolia: { url: SEPOLIA_RPC || '', accounts },
    bsctest: { url: BSC_TEST_RPC || '', accounts }
  },
  etherscan: {
    // NOTE: You can verify later with these API keys
    apiKey: {
      sepolia: ETHERSCAN_API || '',
      bscTestnet: BSCSCAN_API || ''
    }
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    coinmarketcap: CMC_API || undefined,
    showTimeSpent: true,
    excludeContracts: []
  },
  abiExporter: {
    path: './abi',
    runOnCompile: true,
    clear: true,
    flat: true,
    only: [':Token$', ':Staking$'] // export only our ABIs
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6'
  }
};

export default config;
