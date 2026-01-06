/**
 * Helper library for interacting with ImpactFactorStorage smart contract
 */

import { ethers } from "ethers";
import { hashWebhookData, hashEigenAIData } from "./data-hash";

const CONTRACT_ADDRESS = process.env.IMPACT_FACTOR_CONTRACT_ADDRESS || "";
const ARBITRUM_RPC_URL = process.env.ARBITRUM_RPC_URL || process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY || "";

// ABI for ImpactFactorStorage contract
const CONTRACT_ABI = [
  "function initializeSignal(string memory signalId, bytes32 webhookDataHash)",
  "function storeEigenAIData(string memory signalId, bytes32 eigenAIDataHash)",
  "function updateImpactFactor(string memory signalId, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag)",
  "function getSignal(string memory signalId) view returns (bytes32 webhookDataHash, bytes32 eigenAIDataHash, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag, uint256 lastUpdated)",
  "function getActiveSignalIds(uint256 limit, uint256 offset) view returns (string[])",
  "function verifyData(string memory signalId, bytes32 webhookDataHash, bytes32 eigenAIDataHash) view returns (bool webhookDataMatch, bool eigenAIDataMatch)",
];

let provider: ethers.providers.JsonRpcProvider | undefined = undefined;
let signer: ethers.Wallet | null = null;
let contract: ethers.Contract | null = null;

/**
 * Initialize contract connection (lazy initialization)
 */
function getContract(): ethers.Contract {
  if (!CONTRACT_ADDRESS) {
    throw new Error("IMPACT_FACTOR_CONTRACT_ADDRESS environment variable is required");
  }
  
  if (!PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY or EXECUTOR_PRIVATE_KEY environment variable is required");
  }

  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }

  return contract!;
}

/**
 * Initialize signal with webhook data hash
 * Called from webhook when signal is created
 */
export async function initializeSignalInContract(
  signalId: string,
  webhookData: Parameters<typeof hashWebhookData>[0]
): Promise<void> {
  try {
    const contract = getContract();
    const hash = hashWebhookData(webhookData);
    
    const tx = await contract.initializeSignal(signalId, hash);
    await tx.wait();
    
    console.log(`✅ Initialized signal ${signalId} in contract: ${tx.hash}`);
  } catch (error: any) {
    console.error(`❌ Failed to initialize signal ${signalId} in contract:`, error.message);
    // Don't throw - allow DB operation to succeed even if contract fails
  }
}

/**
 * Store EigenAI classification data hash
 * Called from telegram-alpha-worker after classification
 */
export async function storeEigenAIDataInContract(
  signalId: string,
  eigenAIData: Parameters<typeof hashEigenAIData>[0]
): Promise<void> {
  try {
    const contract = getContract();
    const hash = hashEigenAIData(eigenAIData);
    
    const tx = await contract.storeEigenAIData(signalId, hash);
    await tx.wait();
    
    console.log(`✅ Stored EigenAI data for signal ${signalId} in contract: ${tx.hash}`);
  } catch (error: any) {
    console.error(`❌ Failed to store EigenAI data for signal ${signalId} in contract:`, error.message);
    // Don't throw - allow DB operation to succeed even if contract fails
  }
}

/**
 * Update impact factor calculation results
 * Called from impact-factor-worker after calculations
 */
export async function updateImpactFactorInContract(
  signalId: string,
  pnl: number,
  maxFavorableExcursion: number,
  maxAdverseExcursion: number,
  impactFactor: number,
  impactFactorFlag: boolean
): Promise<void> {
  try {
    const contract = getContract();
    
    // Scale percentages by 1e4 (4 decimal places)
    const SCALE_PERCENTAGE = 10000;
    const pnlScaled = BigInt(Math.round(pnl * SCALE_PERCENTAGE));
    const mfeScaled = BigInt(Math.round(maxFavorableExcursion * SCALE_PERCENTAGE));
    const maeScaled = BigInt(Math.round(maxAdverseExcursion * SCALE_PERCENTAGE));
    const impactFactorScaled = BigInt(Math.round(impactFactor * SCALE_PERCENTAGE));
    
    const tx = await contract.updateImpactFactor(
      signalId,
      pnlScaled,
      mfeScaled,
      maeScaled,
      impactFactorScaled,
      impactFactorFlag
    );
    
    await tx.wait();
    
    console.log(`✅ Updated impact factor for signal ${signalId} in contract: ${tx.hash}`);
  } catch (error: any) {
    console.error(`❌ Failed to update impact factor for signal ${signalId} in contract:`, error.message);
    throw error; // Throw for impact factor worker - this is critical
  }
}

/**
 * Verify data integrity for a signal
 * Returns whether webhook and EigenAI data match stored hashes
 */
export async function verifySignalData(
  signalId: string,
  webhookData: Parameters<typeof hashWebhookData>[0],
  eigenAIData: Parameters<typeof hashEigenAIData>[0]
): Promise<{ webhookDataMatch: boolean; eigenAIDataMatch: boolean }> {
  try {
    const contract = getContract();
    const webhookHash = hashWebhookData(webhookData);
    const eigenAIHash = hashEigenAIData(eigenAIData);
    
    const result = await contract.verifyData(signalId, webhookHash, eigenAIHash);
    
    return {
      webhookDataMatch: result.webhookDataMatch,
      eigenAIDataMatch: result.eigenAIDataMatch,
    };
  } catch (error: any) {
    console.error(`❌ Failed to verify data for signal ${signalId}:`, error.message);
    throw error;
  }
}

/**
 * Get active signal IDs from contract (signals that need monitoring)
 */
export async function getActiveSignalIds(limit: number = 100, offset: number = 0): Promise<string[]> {
  try {
    const contract = getContract();
    const signalIds = await contract.getActiveSignalIds(limit, offset);
    return signalIds;
  } catch (error: any) {
    console.error(`❌ Failed to get active signal IDs:`, error.message);
    throw error;
  }
}

/**
 * Get signal data from contract (hashes and impact factor results)
 */
export async function getSignalFromContract(signalId: string): Promise<{
  webhookDataHash: string;
  eigenAIDataHash: string;
  pnl: bigint;
  maxFavorableExcursion: bigint;
  maxAdverseExcursion: bigint;
  impactFactor: bigint;
  impactFactorFlag: boolean;
  lastUpdated: bigint;
}> {
  try {
    const contract = getContract();
    const result = await contract.getSignal(signalId);
    
    return {
      webhookDataHash: result.webhookDataHash,
      eigenAIDataHash: result.eigenAIDataHash,
      pnl: BigInt(result.pnl),
      maxFavorableExcursion: BigInt(result.maxFavorableExcursion),
      maxAdverseExcursion: BigInt(result.maxAdverseExcursion),
      impactFactor: BigInt(result.impactFactor),
      impactFactorFlag: result.impactFactorFlag,
      lastUpdated: BigInt(result.lastUpdated),
    };
  } catch (error: any) {
    console.error(`❌ Failed to get signal ${signalId} from contract:`, error.message);
    throw error;
  }
}
