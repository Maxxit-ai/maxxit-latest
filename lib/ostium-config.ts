/**
 * Ostium Configuration
 * Handles network-specific configuration for Ostium integration
 * Reads from environment variables to determine whether to use testnet or mainnet
 */

// Environment flag to determine which network to use
// When true, uses Arbitrum Sepolia testnet; when false, uses Arbitrum mainnet
const IS_MAINNET = process.env.NEXT_PUBLIC_OSTIUM_MAINNET === 'true';

// Testnet Configuration
const TESTNET_CONFIG = {
  chainId: 421614, // Arbitrum Sepolia
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  rpcBackup: 'https://sepolia-rollup.arbitrum.io/rpc',
  tradingContract: '0x2A9B9c988393f46a2537B0ff11E98c2C15a95afe',
  storageContract: '0x0b9F5243B29938668c9Cfbd7557A389EC7Ef88b8',
  usdcContract: '0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548',
  networkName: 'Arbitrum Sepolia Testnet',
  chainName: 'Arbitrum Sepolia',
  currencySymbol: 'ETH',
  blockExplorerUrl: 'https://sepolia.arbiscan.io',
  sdkNetwork: 'testnet'
};

// Mainnet Configuration
const MAINNET_CONFIG = {
  chainId: 42161, // Arbitrum Mainnet
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  rpcBackup: 'https://arb1.arbitrum.io/rpc',
  tradingContract: '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411',
  storageContract: '0xccd5891083a8acd2074690f65d3024e7d13d66e7',
  usdcContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  networkName: 'Arbitrum Mainnet',
  chainName: 'Arbitrum One',
  currencySymbol: 'ETH',
  blockExplorerUrl: 'https://arbiscan.io',
  sdkNetwork: 'mainnet'
};

// Select the appropriate configuration based on the environment flag
const ostiumConfig = IS_MAINNET ? MAINNET_CONFIG : TESTNET_CONFIG;

// Export the configuration
export default ostiumConfig;

// Export a helper function to get network-specific values
export const getOstiumConfig = () => {
  return ostiumConfig;
};

// Export a helper to check if we're on mainnet
export const isMainnet = () => IS_MAINNET;

// Export individual values for convenience
export const {
  chainId,
  rpcUrl,
  rpcBackup,
  tradingContract,
  storageContract,
  usdcContract,
  networkName,
  chainName,
  currencySymbol,
  blockExplorerUrl,
  sdkNetwork
} = ostiumConfig;