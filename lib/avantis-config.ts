/**
 * Avantis Configuration
 * Handles network-specific configuration for Avantis integration on Base chain
 */

// Mainnet Configuration (Base)
const MAINNET_CONFIG = {
    chainId: 8453, // Base Mainnet
    rpcUrl: 'https://mainnet.base.org',
    rpcBackup: 'https://mainnet.base.org',
    tradingContract: '0x44914408af82bc9983bbb330e3578e1105e11d4e',
    tradingStorageContract: '0x8a311D7048c35985aa31C131B9A13e03a5f7422d',
    usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    networkName: 'Base Mainnet',
    chainName: 'Base',
    currencySymbol: 'ETH',
    blockExplorerUrl: 'https://basescan.org',
    sdkNetwork: 'mainnet',
};

const avantisConfig = MAINNET_CONFIG;

// Export the configuration
export default avantisConfig;

export const getAvantisConfig = () => {
    return avantisConfig;
};

export const {
    chainId,
    rpcUrl,
    rpcBackup,
    tradingContract,
    tradingStorageContract,
    usdcContract,
    networkName,
    chainName,
    currencySymbol,
    blockExplorerUrl,
    sdkNetwork,
} = avantisConfig;
