/**
 * Safe Deployment Service
 * Handles creation of Safe accounts with modules enabled in a single transaction
 */

import Safe, { EthersAdapter, SafeFactory, SafeAccountConfig, ContractNetworksConfig } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

// Module addresses per chain
const MODULE_ADDRESSES: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_MODULE_ADDRESS || '0xa87f82433294cE8A3C8f08Ec5D2825e946C0c0FE',
  42161: process.env.ARBITRUM_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb', // V3 module
};

export interface SafeDeploymentConfig {
  owner: string;
  chainId: number;
  moduleAddress?: string;
  threshold?: number;
}

export interface SafeDeploymentResult {
  safeAddress: string;
  txHash?: string;
  moduleEnabled: boolean;
}

/**
 * Deploy Safe with trading module enabled in a single transaction
 * This uses Safe's setup() function to enable the module during deployment
 */
export async function deploySafeWithModule(
  signer: ethers.Signer,
  config: SafeDeploymentConfig
): Promise<SafeDeploymentResult> {
  const { owner, chainId, threshold = 1 } = config;
  const moduleAddress = config.moduleAddress || MODULE_ADDRESSES[chainId];

  if (!moduleAddress) {
    throw new Error(`No module address configured for chain ${chainId}`);
  }

  console.log('[SafeDeployment] Deploying Safe with module:', {
    owner,
    chainId,
    moduleAddress,
    threshold,
  });

  // Create EthersAdapter
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  });

  // Create SafeFactory
  const safeFactory = await SafeFactory.create({ ethAdapter });

  // Encode enableModule call for setup
  const safeInterface = new ethers.utils.Interface([
    'function enableModule(address module) external',
  ]);
  const enableModuleData = safeInterface.encodeFunctionData('enableModule', [moduleAddress]);

  // Configure Safe with module enabled during deployment
  const safeAccountConfig: SafeAccountConfig = {
    owners: [owner],
    threshold,
    // This will call enableModule during Safe deployment setup
    to: ethers.constants.AddressZero, // Safe contract address (will call itself)
    data: enableModuleData,
    fallbackHandler: ethers.constants.AddressZero,
    paymentToken: ethers.constants.AddressZero,
    payment: 0,
    paymentReceiver: ethers.constants.AddressZero,
  };

  // Deploy Safe with module enabled
  const safeSdk = await safeFactory.deploySafe({ safeAccountConfig });
  const safeAddress = await safeSdk.getAddress();

  console.log('[SafeDeployment] Safe deployed:', safeAddress);

  // Verify module is enabled
  const isModuleEnabled = await safeSdk.isModuleEnabled(moduleAddress);
  console.log('[SafeDeployment] Module enabled:', isModuleEnabled);

  return {
    safeAddress,
    moduleEnabled: isModuleEnabled,
  };
}

/**
 * Predict Safe address before deployment
 * Useful for showing users their Safe address before they deploy
 */
export async function predictSafeAddress(
  owner: string,
  chainId: number,
  saltNonce?: string
): Promise<string> {
  // This is a simplified prediction - in production you'd use Safe SDK's prediction
  // For now, we'll deploy and return the address
  throw new Error('Safe address prediction not yet implemented - deploy to get address');
}

/**
 * Check if Safe exists at address
 */
export async function isSafeDeployed(
  provider: ethers.providers.Provider,
  safeAddress: string
): Promise<boolean> {
  const code = await provider.getCode(safeAddress);
  return code !== '0x' && code !== '0x0';
}

/**
 * Simplified: Create Safe deployment transaction data
 * This returns the transaction data for frontend to execute
 */
export function prepareSafeDeployment(config: SafeDeploymentConfig): {
  config: SafeAccountConfig;
  moduleAddress: string;
} {
  const { owner, chainId, threshold = 1 } = config;
  const moduleAddress = config.moduleAddress || MODULE_ADDRESSES[chainId];

  if (!moduleAddress) {
    throw new Error(`No module address configured for chain ${chainId}`);
  }

  // Encode enableModule call
  const safeInterface = new ethers.utils.Interface([
    'function enableModule(address module) external',
  ]);
  const enableModuleData = safeInterface.encodeFunctionData('enableModule', [moduleAddress]);

  const safeAccountConfig: SafeAccountConfig = {
    owners: [owner],
    threshold,
    to: ethers.constants.AddressZero,
    data: enableModuleData,
    fallbackHandler: ethers.constants.AddressZero,
    paymentToken: ethers.constants.AddressZero,
    payment: 0,
    paymentReceiver: ethers.constants.AddressZero,
  };

  return {
    config: safeAccountConfig,
    moduleAddress,
  };
}

