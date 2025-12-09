/**
 * Test EigenAI Signature Verification with Database
 * 
 * Flow:
 * 1. Calls EigenAI API with hardcoded tweet
 * 2. Stores all signature verification data in NeonDB
 * 3. Retrieves data from database
 * 4. Verifies signature using stored data
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma, disconnectPrisma } from '@maxxit/database';
import { ethers } from 'ethers';
import { LLMTweetClassifier } from '../services/telegram-alpha-worker/src/lib/llm-classifier';

// Hardcoded test tweet
const TEST_TWEET = `$XRP is newly tapped for $2.0459 and momentum is still building 3.
Holding above key support with strong market conviction, this could be the start of the next leg up. Let’s ride the wave.`;

// EigenAI operator address for signature verification
const EIGENAI_OPERATOR_ADDRESS = "0x7053bfb0433a16a2405de785d547b1b32cee0cf3";

// Build prompt (same as in llm-classifier.ts)
function buildPrompt(tweetText: string): string {
  return `You are an expert crypto trading signal analyst. Analyze the following tweet and determine if it contains a trading signal.

Tweet: "${tweetText}"

Analyze this tweet and respond with a JSON object containing:
{
  "isSignalCandidate": boolean,
  "extractedTokens": string[], // Array of token symbols (e.g., ["BTC", "ETH"])
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": number, // 0.0 to 1.0
  "reasoning": string // Brief explanation
}

Rules:
1. Only mark as signal candidate if the tweet explicitly suggests a trading action or price prediction
2. Extract ALL mentioned crypto token symbols (without $ prefix)
3. Sentiment should be:
   - "bullish" if suggesting price increase, buying, or positive outlook
   - "bearish" if suggesting price decrease, selling, or negative outlook
   - "neutral" if just sharing information without directional bias
4. Confidence should reflect how clear and actionable the signal is
5. Common tokens to recognize: BTC, ETH, SOL, AVAX, ARB, OP, MATIC, LINK, UNI, AAVE, etc.

Examples:
- "$BTC breaking out! Target $50k" → isSignalCandidate=true, tokens=["BTC"], sentiment=bullish, confidence=0.8
- "Just bought some $ETH at $2000" → isSignalCandidate=true, tokens=["ETH"], sentiment=bullish, confidence=0.7
- "$SOL looking weak, might dump" → isSignalCandidate=true, tokens=["SOL"], sentiment=bearish, confidence=0.6
- "GM everyone! Great day in crypto" → isSignalCandidate=false, tokens=[], sentiment=neutral, confidence=0.0

Respond ONLY with the JSON object, no other text.`;
}

// Reconstruct prompt for signature verification
function extractPrompt(tweetText: string): string {
  const systemMessage = "You are a crypto trading signal analyst. Always respond with valid JSON only.";
  const userMessage = buildPrompt(tweetText);
  return systemMessage + userMessage;
}

// Construct message for signature verification
function constructMessage(chainId: string | number, modelId: string, prompt: string, output: string): string {
  const chainIdStr = typeof chainId === 'number' ? String(chainId) : chainId;
  return chainIdStr + modelId + prompt + output;
}

// Verify signature
function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const sigHex = signature.startsWith('0x') ? signature : '0x' + signature;
    const recoveredAddress = ethers.utils.verifyMessage(message, sigHex);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error("❌ Signature verification error:", error);
    return false;
  }
}

async function main() {
  console.log("🚀 EigenAI Signature Verification with Database Test");
  console.log("=".repeat(80));
  console.log("\n📝 Test Tweet:");
  console.log(TEST_TWEET);
  console.log("\n");

  // Check API key
  const apiKey = process.env.EIGENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ EIGENAI_API_KEY not set");
    process.exit(1);
  }

  try {
    // Step 1: Create classifier and call EigenAI
    console.log("⏳ Step 1: Calling EigenAI API...");
    const classifier = new LLMTweetClassifier({
      provider: "eigenai",
      apiKey: apiKey,
      model: process.env.EIGENAI_MODEL || "gpt-oss-120b-f16",
    });

    const classification = await classifier.classifyTweet(TEST_TWEET);
    console.log("✅ Classification received");
    console.log(`   Signal: ${classification.isSignalCandidate}`);
    console.log(`   Tokens: ${classification.extractedTokens.join(", ")}`);
    console.log(`   Sentiment: ${classification.sentiment}`);
    console.log(`   Signature: ${classification.signature ? "Present" : "Missing"}`);
    console.log(`   Signature: ${classification.signature}`);
    console.log(`   Raw Output: ${classification.rawOutput ? "Present" : "Missing"}`);
    console.log(`   Raw Output: ${classification.rawOutput}`);
    console.log(`   Model: ${classification.model}`);
    console.log(`   Chain ID: ${classification.chainId}`);

    console.log("\n");

    // Step 2: Store in database
    console.log("⏳ Step 2: Storing data in NeonDB...");
    const testMessageId = `test-${Date.now()}`;
    
    const storedPost = await prisma.telegram_posts.create({
      data: {
        message_id: testMessageId,
        message_text: TEST_TWEET,
        message_created_at: new Date(),
        is_signal_candidate: classification.isSignalCandidate,
        extracted_tokens: classification.extractedTokens,
        confidence_score: classification.confidence,
        signal_type: classification.sentiment === "bullish" ? "LONG" : 
                     classification.sentiment === "bearish" ? "SHORT" : null,
        llm_signature: classification.signature,
        llm_raw_output: classification.rawOutput,
        llm_model_used: classification.model,
        llm_chain_id: classification.chainId,
        llm_reasoning: classification.reasoning,
      },
    });

    console.log(`✅ Data stored (ID: ${storedPost.id})`);
    console.log(`   Signature: ${storedPost.llm_signature ? "Stored" : "Missing"}`);
    console.log(`   Raw Output: ${storedPost.llm_raw_output ? "Stored" : "Missing"}`);
    console.log(`   Model: ${storedPost.llm_model_used}`);
    console.log(`   Chain ID: ${storedPost.llm_chain_id}`);
    console.log("\n");

    // Step 3: Retrieve from database
    console.log("⏳ Step 3: Retrieving data from NeonDB...");
    const retrievedPost = await prisma.telegram_posts.findUnique({
      where: { id: storedPost.id },
    });

    if (!retrievedPost) {
      throw new Error("Failed to retrieve post from database");
    }

    console.log("✅ Data retrieved");
    console.log(`   Message: ${retrievedPost.message_text.substring(0, 50)}...`);
    console.log("\n");

    // Step 4: Verify signature
    console.log("⏳ Step 4: Verifying signature...");
    
    if (!retrievedPost.llm_signature || !retrievedPost.llm_raw_output || 
        !retrievedPost.llm_model_used || !retrievedPost.llm_chain_id) {
      throw new Error("Missing signature verification data in database");
    }

    const prompt = extractPrompt(retrievedPost.message_text);
    const message = constructMessage(
      retrievedPost.llm_chain_id,
      retrievedPost.llm_model_used,
      prompt,
      retrievedPost.llm_raw_output
    );

    const isValid = verifySignature(
      message,
      retrievedPost.llm_signature,
      EIGENAI_OPERATOR_ADDRESS
    );

    console.log("✅ Signature verification complete");
    console.log(`   Chain ID: ${retrievedPost.llm_chain_id}`);
    console.log(`   Model: ${retrievedPost.llm_model_used}`);
    console.log(`   Message length: ${message.length} characters`);
    console.log(`   Signature valid: ${isValid ? "✅ YES" : "❌ NO"}`);
    console.log(`   Expected address: ${EIGENAI_OPERATOR_ADDRESS}`);
    console.log("\n");

    // Step 5: Cleanup (optional - comment out to keep test data)
    // console.log("⏳ Step 5: Cleaning up test data...");
    // await prisma.telegram_posts.delete({
    //   where: { id: storedPost.id },
    // });
    // console.log("✅ Test data deleted");
    console.log("\n");

    console.log("=".repeat(80));
    console.log(isValid ? "✅ TEST PASSED: Signature verified successfully!" : "❌ TEST FAILED: Signature verification failed");
    console.log("=".repeat(80));

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

