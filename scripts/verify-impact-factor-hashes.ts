/**
 * Verification script to compare hashes stored in smart contract
 * with hashes computed from NeonDB data
 * 
 * Usage:
 *   tsx scripts/verify-impact-factor-hashes.ts [signalId]
 * 
 * If signalId is provided, verifies that specific signal.
 * Otherwise, verifies all signals in the contract.
 */

import dotenv from "dotenv";
import { prisma } from "@maxxit/database";
import { hashWebhookData, hashEigenAIData } from "../lib/data-hash";
import { ethers } from "ethers";

dotenv.config();

const CONTRACT_ADDRESS = process.env.IMPACT_FACTOR_CONTRACT_ADDRESS || "";
const ARBITRUM_RPC_URL = process.env.ARBITRUM_RPC_URL || process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc";

// ABI for ImpactFactorStorage contract
const CONTRACT_ABI = [
  "function getSignal(string memory signalId) view returns (bytes32 webhookDataHash, bytes32 eigenAIDataHash, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag, uint256 lastUpdated)",
  "function getSignalCount() view returns (uint256)",
  "function signalIds(uint256) view returns (string)",
];

interface VerificationResult {
  signalId: string;
  webhookDataMatch: boolean;
  eigenAIDataMatch: boolean;
  webhookHashFromDB: string;
  webhookHashFromContract: string;
  eigenAIHashFromDB: string;
  eigenAIHashFromContract: string;
  error?: string;
}

/**
 * Get signal data from contract
 */
async function getSignalFromContract(signalId: string): Promise<{
  webhookDataHash: string;
  eigenAIDataHash: string;
}> {
  if (!CONTRACT_ADDRESS) {
    throw new Error("IMPACT_FACTOR_CONTRACT_ADDRESS environment variable is required");
  }

  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  const result = await contract.getSignal(signalId);
  
  return {
    webhookDataHash: result.webhookDataHash,
    eigenAIDataHash: result.eigenAIDataHash,
  };
}

/**
 * Verify a single signal
 */
async function verifySignal(signalId: string): Promise<VerificationResult> {
  try {
    // Fetch signal from DB
    const dbSignal = await prisma.telegram_posts.findUnique({
      where: { id: signalId },
    });

    if (!dbSignal) {
      return {
        signalId,
        webhookDataMatch: false,
        eigenAIDataMatch: false,
        webhookHashFromDB: "",
        webhookHashFromContract: "",
        eigenAIHashFromDB: "",
        eigenAIHashFromContract: "",
        error: "Signal not found in database",
      };
    }

    // Compute webhook data hash from DB
    const webhookHashFromDB = hashWebhookData({
      alpha_user_id: dbSignal.alpha_user_id,
      source_id: dbSignal.source_id,
      message_id: dbSignal.message_id,
      message_text: dbSignal.message_text,
      message_created_at: dbSignal.message_created_at,
      sender_id: dbSignal.sender_id,
      sender_username: dbSignal.sender_username,
    });

    // Compute EigenAI data hash from DB
    const eigenAIHashFromDB = hashEigenAIData({
      is_signal_candidate: dbSignal.is_signal_candidate,
      extracted_tokens: dbSignal.extracted_tokens || [],
      confidence_score: dbSignal.confidence_score,
      signal_type: dbSignal.signal_type,
      token_price: dbSignal.token_price,
      timeline_window: dbSignal.timeline_window,
      take_profit: dbSignal.take_profit || 0,
      stop_loss: dbSignal.stop_loss || 0,
      llm_signature: dbSignal.llm_signature,
      llm_raw_output: dbSignal.llm_raw_output,
      llm_model_used: dbSignal.llm_model_used,
      llm_chain_id: dbSignal.llm_chain_id,
      llm_reasoning: dbSignal.llm_reasoning,
      llm_market_context: dbSignal.llm_market_context,
      llm_full_prompt: dbSignal.llm_full_prompt,
    });

    // Get hashes from contract
    const contractData = await getSignalFromContract(signalId);
    const webhookHashFromContract = contractData.webhookDataHash;
    const eigenAIHashFromContract = contractData.eigenAIDataHash;

    // Compare hashes
    const webhookDataMatch = webhookHashFromDB.toLowerCase() === webhookHashFromContract.toLowerCase();
    const eigenAIDataMatch = eigenAIHashFromDB.toLowerCase() === eigenAIHashFromContract.toLowerCase();

    return {
      signalId,
      webhookDataMatch,
      eigenAIDataMatch,
      webhookHashFromDB,
      webhookHashFromContract,
      eigenAIHashFromDB,
      eigenAIHashFromContract,
    };
  } catch (error: any) {
    return {
      signalId,
      webhookDataMatch: false,
      eigenAIDataMatch: false,
      webhookHashFromDB: "",
      webhookHashFromContract: "",
      eigenAIHashFromDB: "",
      eigenAIHashFromContract: "",
      error: error.message || String(error),
    };
  }
}

/**
 * Get all signal IDs from contract
 */
async function getAllSignalIdsFromContract(): Promise<string[]> {
  if (!CONTRACT_ADDRESS) {
    throw new Error("IMPACT_FACTOR_CONTRACT_ADDRESS environment variable is required");
  }

  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  const count = await contract.getSignalCount();
  const signalIds: string[] = [];

  // Fetch all signal IDs
  for (let i = 0; i < count.toNumber(); i++) {
    try {
      const signalId = await contract.signalIds(i);
      signalIds.push(signalId);
    } catch (error) {
      console.error(`Error fetching signal ID at index ${i}:`, error);
    }
  }

  return signalIds;
}

/**
 * Main verification function
 */
async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🔍 IMPACT FACTOR HASH VERIFICATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Contract: ${CONTRACT_ADDRESS || "NOT SET"}`);
  console.log(`Network: ${ARBITRUM_RPC_URL}`);
  console.log(`Started at: ${new Date().toISOString()}\n`);

  if (!CONTRACT_ADDRESS) {
    console.error("❌ IMPACT_FACTOR_CONTRACT_ADDRESS environment variable is required");
    process.exit(1);
  }

  try {
    const signalIdArg = process.argv[2];
    let signalIdsToVerify: string[] = [];

    if (signalIdArg) {
      // Verify specific signal
      signalIdsToVerify = [signalIdArg];
      console.log(`📋 Verifying signal: ${signalIdArg}\n`);
    } else {
      // Verify all signals
      console.log("📋 Fetching all signal IDs from contract...");
      signalIdsToVerify = await getAllSignalIdsFromContract();
      console.log(`Found ${signalIdsToVerify.length} signal(s) in contract\n`);
    }

    if (signalIdsToVerify.length === 0) {
      console.log("✅ No signals found in contract\n");
      return;
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  VERIFICATION RESULTS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const results: VerificationResult[] = [];
    let totalVerified = 0;
    let webhookMatches = 0;
    let eigenAIMatches = 0;
    let errors = 0;

    for (const signalId of signalIdsToVerify) {
      console.log(`[${signalId.substring(0, 8)}...] Verifying...`);
      const result = await verifySignal(signalId);
      results.push(result);

      if (result.error) {
        console.error(`  ❌ Error: ${result.error}\n`);
        errors++;
      } else {
        totalVerified++;
        
        const webhookStatus = result.webhookDataMatch ? "✅" : "❌";
        const eigenAIStatus = result.eigenAIDataMatch ? "✅" : "❌";
        
        console.log(`  Webhook Data: ${webhookStatus} ${result.webhookDataMatch ? "MATCH" : "MISMATCH"}`);
        console.log(`  EigenAI Data: ${eigenAIStatus} ${result.eigenAIDataMatch ? "MATCH" : "MISMATCH"}`);
        
        if (!result.webhookDataMatch) {
          console.log(`    DB Hash:    ${result.webhookHashFromDB}`);
          console.log(`    Contract:   ${result.webhookHashFromContract}`);
        }
        
        if (!result.eigenAIDataMatch) {
          console.log(`    DB Hash:    ${result.eigenAIHashFromDB}`);
          console.log(`    Contract:   ${result.eigenAIHashFromContract}`);
        }
        
        console.log();

        if (result.webhookDataMatch) webhookMatches++;
        if (result.eigenAIDataMatch) eigenAIMatches++;
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Total Signals:        ${signalIdsToVerify.length}`);
    console.log(`  Successfully Verified: ${totalVerified}`);
    console.log(`  Webhook Hash Matches:  ${webhookMatches}/${totalVerified}`);
    console.log(`  EigenAI Hash Matches:  ${eigenAIMatches}/${totalVerified}`);
    console.log(`  Errors:               ${errors}`);
    
    if (webhookMatches === totalVerified && eigenAIMatches === totalVerified && errors === 0) {
      console.log("\n✅ ALL HASHES MATCH - Data integrity verified!");
    } else {
      console.log("\n⚠️  SOME HASHES DO NOT MATCH - Data integrity issue detected!");
      process.exit(1);
    }
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error: any) {
    console.error("❌ Fatal error:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { verifySignal, getAllSignalIdsFromContract };
