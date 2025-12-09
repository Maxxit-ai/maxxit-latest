/**
 * Verify EigenAI API Response Signatures
 * 
 * This script verifies the cryptographic signatures returned by EigenAI API responses
 * following the steps outlined in: https://docs.eigencloud.xyz/eigenai/howto/verify-signature
 * 
 * Steps:
 * 1. Extract the prompt
 * 2. Extract the output
 * 3. Construct the message
 * 4. Verify the signature (using ethers.js)
 * 5. Compare addresses
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';

// Hardcoded tweets and their signatures from test runs
// NOTE: The 'output' field should contain the FULL output from the API response,
// including <|channel|>analysis<|message|>... tags, NOT just the extracted JSON.
// We'll need to fetch fresh responses to get the correct full output.
const testCases = [
  {
    tweet: `$LINK is newly tapped for $12.959 and momentum is still building 3.
Holding above key support with strong market conviction, this could be the start of the next leg up.
I'm going long here. Let's ride the wave.`,
    signature: "a1a6759b959f3b2a568659ddbb39ef1972a4033a2b91031143442b703a9960984f7470e54295163ea91bfe766eaf5f73a370d08eb9af5e9680b46cc6588bc1dc1b",
    // This is the FULL output from API, not just JSON
    output: `<|channel|>analysis<|message|>We need to output JSON with fields. Analyze tweet:\n\n"$LINK is newly tapped for $12.959 and momentum is still building 3.\nHolding above key support with strong market conviction, this could be the start of the next leg up.\nI'm going long here. Let's ride the wave."\n\nIt explicitly suggests a trading action: "I'm going long here" and expects price increase. So isSignalCandidate true. Extract token: LINK. Sentiment bullish. Confidence: fairly clear, gives price level and action, so maybe 0.85. Reasoning: mention long, bullish outlook, price support.\n\nReturn JSON.<|end|>{\n  "isSignalCandidate": true,\n  "extractedTokens": ["LINK"],\n  "sentiment": "bullish",\n  "confidence": 0.85,\n  "reasoning": "The tweet explicitly states a trading action ('I'm going long here') and predicts upward movement ('next leg up'), indicating a bullish stance with a clear price level and support reference, making it a clear actionable signal."\n}`
  }
];

// Hardcoded prompt template (same as in llm-classifier.ts)
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

// Step 1: Extract the prompt
// According to EigenAI docs (line 30): "Concatenate all request.messages[].content fields, in order, with no separators."
// This means: system message content + user message content (with NO separator!)
function extractPrompt(tweetText: string): string {
  const systemMessage = "You are a crypto trading signal analyst. Always respond with valid JSON only.";
  const userMessage = buildPrompt(tweetText);
  // Concatenate ALL message contents with no separator
  return systemMessage + userMessage;
}

// Step 2: Extract the output (already provided in testCases)
function extractOutput(output: string): string {
  return output;
}

// Step 3: Construct the message
// According to EigenAI docs, message format is: chain_id + model_id + prompt + output
// We need to get chain_id and model_id from the API response or use defaults
function constructMessage(
  chainId: string | number,
  modelId: string,
  prompt: string,
  output: string
): string {
  // Convert chainId to string and concatenate: chain_id + model_id + prompt + output
  const chainIdStr = typeof chainId === 'number' ? String(chainId) : chainId;
  return chainIdStr + modelId + prompt + output;
}

// Step 4: Verify the signature using ethers.utils.verifyMessage (as per EigenAI docs)
// Note: verifyMessage ALREADY handles the Ethereum prefix internally, so we pass the raw message
function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): { isValid: boolean; recoveredAddress: string; matches: boolean; messageHash: string } {
  try {
    console.log(`   Message length: ${message.length} characters`);
    console.log(`   Message preview: ${message.substring(0, 100)}...`);
    
    // Normalize signature format (add 0x prefix if not present)
    const sigHex = signature.startsWith('0x') ? signature : '0x' + signature;
    console.log(`   Signature: ${sigHex.substring(0, 20)}...${sigHex.substring(sigHex.length - 10)}`);
    console.log(`   Signature length: ${sigHex.length - 2} hex characters (${(sigHex.length - 2) / 2} bytes)`);
    
    // Use ethers.utils.verifyMessage directly
    // This function internally:
    // 1. Adds Ethereum Signed Message prefix: "\x19Ethereum Signed Message:\n" + length + message
    // 2. Hashes with Keccak256
    // 3. Performs ECDSA recovery on secp256k1 curve
    // 4. Derives Ethereum address from recovered public key
    const recoveredAddress = ethers.utils.verifyMessage(message, sigHex);
    
    console.log(`   ✅ Recovered address: ${recoveredAddress}`);
    
    // Calculate message hash for display purposes
    const messageHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message));
    
    // Compare addresses (Step 5 - verification)
    const matches = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    
    return {
      isValid: matches,
      recoveredAddress: recoveredAddress,
      matches: matches,
      messageHash: messageHash
    };
  } catch (error) {
    console.error("   ❌ Error verifying signature:", error);
    if (error instanceof Error) {
      console.error(`   Error details: ${error.message}`);
    }
    return {
      isValid: false,
      recoveredAddress: "",
      matches: false,
      messageHash: ""
    };
  }
}

// Step 5: Compare addresses (done in verifySignature)

/**
 * Main verification function
 */
async function verifyEigenAISignature(
  tweet: string,
  signature: string,
  output: string,
  chainId: number | string, // Can be number or string
  modelId: string,
  eigenAIOperatorAddress: string
) {
  console.log("\n" + "=".repeat(80));
  console.log("🔐 Verifying EigenAI Signature");
  console.log("=".repeat(80));
  
  // Step 1: Extract the prompt
  console.log("\n📝 Step 1: Extracting prompt...");
  const prompt = extractPrompt(tweet);
  console.log(`✅ Prompt extracted (length: ${prompt.length} characters)`);
  
  // Step 2: Extract the output
  console.log("\n📤 Step 2: Extracting output...");
  const extractedOutput = extractOutput(output);
  console.log(`✅ Output extracted (length: ${extractedOutput.length} characters)`);
  console.log(`   Output preview: ${extractedOutput.substring(0, 100)}...`);
  
  // Step 3: Construct the message
  console.log("\n🔨 Step 3: Constructing message...");
  console.log(`   Format: ${chainId} + ${modelId} + (system+user) + output`);
  console.log(`   Prompt (all messages): ${prompt.length} chars`);
  console.log(`   Output (full): ${extractedOutput.length} chars`);
  
  const message = constructMessage(chainId, modelId, prompt, extractedOutput);
  console.log(`✅ Message constructed: ${message.length} total characters`);
  
  // Step 4 & 5: Verify the signature and compare addresses
  console.log("\n🔍 Step 4: Verifying signature with ethers.js...");
  console.log(`   Signature: ${signature.substring(0, 20)}...${signature.substring(signature.length - 20)}`);
  console.log(`   Expected address: ${eigenAIOperatorAddress}`);
  
  const verificationResult = verifySignature(String(message), signature, eigenAIOperatorAddress);
  
  console.log("\n" + "─".repeat(80));
  console.log("📊 Verification Results:");
  console.log("─".repeat(80));
  console.log(`Message Hash:      ${verificationResult.messageHash}`);
  console.log(`Recovered Address: ${verificationResult.recoveredAddress || "N/A"}`);
  console.log(`Expected Address:  ${eigenAIOperatorAddress}`);
  console.log(`Match:             ${verificationResult.matches ? "✅ YES" : "❌ NO"}`);
  console.log(`Signature Valid:   ${verificationResult.isValid ? "✅ YES" : "❌ NO"}`);
  
  if (!verificationResult.isValid && verificationResult.recoveredAddress) {
    console.log(`\n⚠️  NOTE: Recovered address doesn't match expected address.`);
    console.log(`   This could mean:`);
    console.log(`   1. The operator address is incorrect`);
    console.log(`   2. The chain_id or model_id don't match`);
    console.log(`   3. The signature verification format is different`);
    console.log(`   4. The signature is invalid or corrupted`);
  }
  
  console.log("─".repeat(80));
  
  return verificationResult;
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 EigenAI Signature Verification Tool");
  console.log("=".repeat(80));
  
  // Get EigenAI operator address (this should be publicly known)
  // According to EigenAI docs, this is the address of the EigenLabs operator
  // This is the official EigenAI operator signer address
  const EIGENAI_OPERATOR_ADDRESS = process.env.EIGENAI_OPERATOR_ADDRESS || 
    "0x7053bfb0433a16a2405de785d547b1b32cee0cf3"; // Official EigenAI operator address
  
  
  if (EIGENAI_OPERATOR_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.warn("\n⚠️  WARNING: EIGENAI_OPERATOR_ADDRESS not set!");
    console.warn("   Please set EIGENAI_OPERATOR_ADDRESS environment variable or update the script.");
    console.warn("   The verification will still run but address comparison will fail.");
    console.warn("   Check EigenAI documentation for the correct operator address.\n");
  }
  
  // Chain ID and Model ID (from EigenAI API response)
  const CHAIN_ID = 1; // Numeric value as returned by API
  const MODEL_ID = "gpt-oss-120b-f16";
  
  console.log(`Configuration:`);
  console.log(`  Chain ID: ${CHAIN_ID}`);
  console.log(`  Model ID: ${MODEL_ID}`);
  console.log(`  Operator Address: ${EIGENAI_OPERATOR_ADDRESS}`);
  console.log(`\n✅ Using correct format: chainId + model + (system+user messages) + fullOutput`);
  
  // Verify each test case
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n\n🧪 Test Case ${i + 1}/${testCases.length}`);
    console.log(`Tweet: ${testCase.tweet.substring(0, 80)}...`);
    
    try {
      let signature = testCase.signature;
      let output = testCase.output;
      let chainId = CHAIN_ID;
      let modelId = MODEL_ID;
      
      const result = await verifyEigenAISignature(
        testCase.tweet,
        signature,
        output,
        chainId,
        modelId,
        EIGENAI_OPERATOR_ADDRESS
      );
      
      if (result.isValid) {
        console.log(`\n✅ Test Case ${i + 1} PASSED - Signature is valid!`);
      } else {
        console.log(`\n❌ Test Case ${i + 1} FAILED - Signature verification failed`);
        if (result.recoveredAddress) {
          console.log(`\n🔍 Debugging Information:`);
          console.log(`   Recovered Address: ${result.recoveredAddress}`);
          console.log(`   Expected Address:  ${EIGENAI_OPERATOR_ADDRESS}`);
          console.log(`\n💡 Possible Issues:`);
          console.log(`   1. Chain ID might be wrong (currently using: "${chainId}")`);
          console.log(`   2. Model ID might be wrong (currently using: "${modelId}")`);
          console.log(`   3. Check the actual API response for chain_id and model_id fields`);
          console.log(`   4. The prompt format might need to match exactly what was sent`);
          console.log(`\n   To fix: Update EIGENAI_CHAIN_ID and EIGENAI_MODEL_ID environment variables`);
          console.log(`   with the actual values from the API response.`);
        }
      }
    } catch (error) {
      console.error(`\n❌ Test Case ${i + 1} ERROR:`, error);
      if (error instanceof Error) {
        console.error(`   Error message: ${error.message}`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log("✅ Verification process completed");
  console.log("=".repeat(80));
}

// Run the verification
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });

