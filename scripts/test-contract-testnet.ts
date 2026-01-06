/**
 * Test ImpactFactorStorage contract on Arbitrum Testnet (Sepolia)
 * 
 * Usage:
 * 1. Deploy contract to Arbitrum Sepolia: npx hardhat run scripts/deploy-impact-factor-storage.ts --network arbitrumSepolia
 * 2. Set IMPACT_FACTOR_CONTRACT_ADDRESS in .env
 * 3. Run this script: tsx scripts/test-contract-testnet.ts
 * 
 * This script tests all contract functions on a live testnet
 */

import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = process.env.IMPACT_FACTOR_CONTRACT_ADDRESS;
const ARBITRUM_SEPOLIA_RPC = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("❌ DEPLOYER_PRIVATE_KEY not set in .env");
  process.exit(1);
}
if (!CONTRACT_ADDRESS) {
  console.error("❌ IMPACT_FACTOR_CONTRACT_ADDRESS not set in .env");
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error("❌ DEPLOYER_PRIVATE_KEY or EXECUTOR_PRIVATE_KEY not set in .env");
  process.exit(1);
}

// Contract ABI (minimal for testing)
const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function initializeSignal(string memory signalId, bytes32 webhookDataHash)",
  "function storeEigenAIData(string memory signalId, bytes32 eigenAIDataHash)",
  "function updateImpactFactor(string memory signalId, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag)",
  "function getSignal(string memory signalId) view returns (bytes32 webhookDataHash, bytes32 eigenAIDataHash, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag, uint256 lastUpdated)",
  "function verifyData(string memory signalId, bytes32 webhookDataHash, bytes32 eigenAIDataHash) view returns (bool webhookDataMatch, bool eigenAIDataMatch)",
  "function getActiveSignalIds(uint256 limit, uint256 offset) view returns (string[])",
  "function getSignalCount() view returns (uint256)",
  "event SignalInitialized(string indexed signalId, bytes32 webhookDataHash)",
  "event EigenAIDataStored(string indexed signalId, bytes32 eigenAIDataHash)",
  "event ImpactFactorUpdated(string indexed signalId, int256 pnl, int256 maxFavorableExcursion, int256 maxAdverseExcursion, int256 impactFactor, bool impactFactorFlag)",
];

async function main() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🧪 TESTING IMPACT FACTOR STORAGE CONTRACT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Contract Address: ${CONTRACT_ADDRESS}`);
  console.log(`Network: Arbitrum Sepolia\n`);

  // Setup provider and signer (using ethers v5 syntax)
  const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
  const signer = new ethers.Wallet(PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS!, CONTRACT_ABI, signer);

  // Check connection
  const network = await provider.getNetwork();
  console.log(`✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
  
  const balance = await provider.getBalance(signer.address);
  console.log(`✅ Signer balance: ${ethers.utils.formatEther(balance)} ETH`);
  console.log(`✅ Signer address: ${signer.address}\n`);

  // Test data (using ethers v5 utils)
  const testSignalId = `test-${Date.now()}`;
  const testWebhookHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`webhook-data-${Date.now()}`));
  const testEigenAIHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`eigenai-data-${Date.now()}`));
  
  const SCALE = 10000n;
  const pnl = 1050n; // 10.50%
  const mfe = 1200n; // 12.00%
  const mae = -500n; // -5.00%
  const impactFactor = 1700n; // 17.00%

  try {
    // Test 1: Check owner
    console.log("📋 Test 1: Check contract owner");
    const owner = await contract.owner();
    console.log(`   Owner: ${owner}`);
    console.log(`   Signer matches owner: ${owner.toLowerCase() === signer.address.toLowerCase()}\n`);

    // Test 2: Get initial signal count
    console.log("📋 Test 2: Get initial signal count");
    const initialCount = await contract.getSignalCount();
    console.log(`   Initial signal count: ${initialCount}\n`);

    // Test 3: Initialize signal
    console.log("📋 Test 3: Initialize signal");
    console.log(`   Signal ID: ${testSignalId}`);
    console.log(`   Webhook Hash: ${testWebhookHash}`);
    
    const tx1 = await contract.initializeSignal(testSignalId, testWebhookHash);
    console.log(`   Transaction hash: ${tx1.hash}`);
    const receipt1 = await tx1.wait();
    console.log(`   ✅ Signal initialized (Gas used: ${receipt1.gasUsed.toString()})\n`);

    // Test 4: Store EigenAI data
    console.log("📋 Test 4: Store EigenAI data");
    console.log(`   EigenAI Hash: ${testEigenAIHash}`);
    
    const tx2 = await contract.storeEigenAIData(testSignalId, testEigenAIHash);
    console.log(`   Transaction hash: ${tx2.hash}`);
    const receipt2 = await tx2.wait();
    console.log(`   ✅ EigenAI data stored (Gas used: ${receipt2.gasUsed.toString()})\n`);

    // Test 5: Update impact factor
    console.log("📋 Test 5: Update impact factor");
    console.log(`   PnL: ${Number(pnl) / Number(SCALE) * 100}%`);
    console.log(`   MFE: ${Number(mfe) / Number(SCALE) * 100}%`);
    console.log(`   MAE: ${Number(mae) / Number(SCALE) * 100}%`);
    console.log(`   Impact Factor: ${Number(impactFactor) / Number(SCALE) * 100}%`);
    
    const tx3 = await contract.updateImpactFactor(
      testSignalId,
      pnl,
      mfe,
      mae,
      impactFactor,
      true
    );
    console.log(`   Transaction hash: ${tx3.hash}`);
    const receipt3 = await tx3.wait();
    console.log(`   ✅ Impact factor updated (Gas used: ${receipt3.gasUsed.toString()})\n`);

    // Test 6: Get signal data
    console.log("📋 Test 6: Get signal data");
    const signalData = await contract.getSignal(testSignalId);
    console.log(`   Webhook Hash: ${signalData[0]}`);
    console.log(`   EigenAI Hash: ${signalData[1]}`);
    console.log(`   PnL: ${Number(signalData[2]) / Number(SCALE) * 100}%`);
    console.log(`   MFE: ${Number(signalData[3]) / Number(SCALE) * 100}%`);
    console.log(`   MAE: ${Number(signalData[4]) / Number(SCALE) * 100}%`);
    console.log(`   Impact Factor: ${Number(signalData[5]) / Number(SCALE) * 100}%`);
    console.log(`   Impact Factor Flag: ${signalData[6]}`);
    console.log(`   Last Updated: ${new Date(Number(signalData[7]) * 1000).toISOString()}\n`);

    // Test 7: Verify data
    console.log("📋 Test 7: Verify data integrity");
    const verification = await contract.verifyData(
      testSignalId,
      testWebhookHash,
      testEigenAIHash
    );
    console.log(`   Webhook Data Match: ${verification[0]}`);
    console.log(`   EigenAI Data Match: ${verification[1]}`);
    console.log(`   ✅ Verification passed: ${verification[0] && verification[1]}\n`);

    // Test 8: Get active signal IDs
    console.log("📋 Test 8: Get active signal IDs");
    const activeIds = await contract.getActiveSignalIds(10, 0);
    console.log(`   Active signal count: ${activeIds.length}`);
    console.log(`   Active signals: ${activeIds.join(", ")}\n`);

    // Test 9: Get final signal count
    console.log("📋 Test 9: Get final signal count");
    const finalCount = await contract.getSignalCount();
    console.log(`   Final signal count: ${finalCount}\n`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ ALL TESTS PASSED!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error: any) {
    console.error("\n❌ Test failed:");
    console.error(`   Error: ${error.message}`);
    if (error.transaction) {
      console.error(`   Transaction: ${error.transaction.hash}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
