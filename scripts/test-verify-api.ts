/**
 * Test the EigenAI Signature Verification API
 * 
 * This script tests the API endpoint by:
 * 1. Creating a test record in the database
 * 2. Calling the API endpoint with the test data
 * 3. Verifying the response
 */

import dotenv from 'dotenv';
dotenv.config();

import { disconnectPrisma } from '@maxxit/database';
import { LLMTweetClassifier } from '../services/telegram-alpha-worker/src/lib/llm-classifier';

const TEST_TWEET = `$ETH breaking out above $2000! Strong volume and momentum.
I'm going long here with a target of $2500 `;

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';

async function main() {
  console.log("🧪 Testing EigenAI Signature Verification API");
  console.log("=".repeat(80));
  
  const apiKey = process.env.EIGENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ EIGENAI_API_KEY not set");
    process.exit(1);
  }

  try {
    // Step 1: Get EigenAI classification with signature
    console.log("\n⏳ Step 1: Getting EigenAI classification...");
    const classifier = new LLMTweetClassifier({
      provider: "eigenai",
      apiKey: apiKey,
      model: "gpt-oss-120b-f16",
    });

    const classification = await classifier.classifyTweet(TEST_TWEET);
    console.log("✅ Classification received");
    console.log(`   Has signature: ${!!classification.signature}`);
    console.log(`   Signature: ${classification.signature}`);
    console.log(`   Has raw output: ${!!classification.rawOutput}`);
    console.log(`   Model: ${classification.model}`);
    console.log(`   Chain ID: ${classification.chainId}`);

    if (!classification.signature || !classification.rawOutput) {
      throw new Error("Missing signature or raw output from EigenAI");
    }

    // Step 2: Call the verification API
    console.log("\n⏳ Step 2: Calling verification API...");
    console.log(`   URL: ${API_URL}/api/eigenai/verify-signature`);
    
    const response = await fetch(`${API_URL}/api/eigenai/verify-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tweetText: TEST_TWEET,
        llm_signature: classification.signature,
        llm_raw_output: classification.rawOutput,
        llm_model_used: classification.model,
        llm_chain_id: classification.chainId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API returned ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log("✅ API Response:");
    console.log(JSON.stringify(result, null, 2));

    // Step 3: Verify result
    console.log("\n⏳ Step 3: Verifying result...");
    if (result.success && result.isValid) {
      console.log("✅ TEST PASSED: Signature verified successfully!");
      console.log(`   Recovered Address: ${result.recoveredAddress}`);
      console.log(`   Expected Address: ${result.expectedAddress}`);
    } else {
      console.log("❌ TEST FAILED: Signature verification failed");
      console.log(`   Reason: ${result.message}`);
    }

    console.log("\n" + "=".repeat(80));

  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
    }
    process.exit(1);
  } finally {
    await disconnectPrisma();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

