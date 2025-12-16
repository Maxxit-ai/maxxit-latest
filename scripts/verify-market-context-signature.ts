import "dotenv/config";
import fetch from "node-fetch";
import { randomUUID } from "crypto";
import { prisma } from "@maxxit/database";
import { LLMTweetClassifier } from "../services/telegram-alpha-worker/src/lib/llm-classifier";

const TWEET =
  "Massive accumulation on $XMR. Whales are loading up. Technical setup looks perfect for a rally. Entering long position now.";

async function main() {
  if (!process.env.EIGENAI_API_KEY) {
    throw new Error("Missing EIGENAI_API_KEY");
  }

  const classifier = new LLMTweetClassifier({
    provider: "eigenai",
    apiKey: process.env.EIGENAI_API_KEY,
  });

  // 1) Classify
  const classification = await classifier.classifyTweet(TWEET);

  console.log("\n=== RAW EIGENAI RESPONSE DATA (WHAT WE GOT FROM API) ===");
  console.log("Signature:", classification.signature);
  console.log("Model:", classification.model);
  console.log("Chain ID:", classification.chainId);
  console.log("Raw Output length:", classification.rawOutput?.length || 0);
  console.log("Raw Output first 200 chars:", classification.rawOutput?.substring(0, 200));
  console.log("Raw Output last 200 chars:", classification.rawOutput?.substring((classification.rawOutput?.length || 0) - 200));
  console.log("Market Context length:", classification.marketContext?.length || 0);
  console.log("Market Context:", classification.marketContext);
  
  console.log("\n=== PARSED CLASSIFICATION RESULT ===");
  console.log("Is Signal Candidate:", classification.isSignalCandidate);
  console.log("Extracted Tokens:", classification.extractedTokens);
  console.log("Sentiment:", classification.sentiment);
  console.log("Confidence:", classification.confidence);
  console.log("Reasoning:", classification.reasoning);

  // 2) Store to telegram_posts (mimicking worker)
  const messageId = randomUUID();
  const now = new Date();

  const created = await prisma.telegram_posts.create({
    data: {
      message_id: messageId,
      message_text: TWEET,
      message_created_at: now,
      is_signal_candidate: classification.isSignalCandidate,
      extracted_tokens: classification.extractedTokens,
      confidence_score: classification.confidence,
      signal_type:
        classification.sentiment === "bullish"
          ? "LONG"
          : classification.sentiment === "bearish"
          ? "SHORT"
          : null,
      llm_signature: classification.signature,
      llm_raw_output: classification.rawOutput,
      llm_model_used: classification.model,
      llm_chain_id: classification.chainId,
      llm_reasoning: classification.reasoning,
      llm_market_context: classification.marketContext ?? null,
    },
  });

  console.log("Stored telegram_post id:", created.id);

  // 3) Fetch back the stored record
  const stored = await prisma.telegram_posts.findUnique({
    where: { id: created.id },
  });

  if (!stored) {
    throw new Error("Failed to fetch stored telegram_post");
  }

  console.log("\n=== DATA INTEGRITY CHECK (BEFORE DB vs AFTER DB) ===");
  console.log("✓ Signature match?:", classification.signature === stored.llm_signature);
  console.log("✓ Model match?:", classification.model === stored.llm_model_used);
  console.log("✓ Chain ID match?:", classification.chainId === stored.llm_chain_id);
  console.log("✓ Raw output match?:", classification.rawOutput === stored.llm_raw_output);
  console.log("✓ Market context match?:", classification.marketContext === (stored as any).llm_market_context);
  console.log("✓ Reasoning match?:", classification.reasoning === stored.llm_reasoning);

  if (classification.signature !== stored.llm_signature) {
    console.log("\n❌ SIGNATURE MISMATCH!");
    console.log("  Before:", classification.signature);
    console.log("  After:", stored.llm_signature);
  }

  if (classification.rawOutput !== stored.llm_raw_output) {
    console.log("\n❌ RAW OUTPUT MISMATCH!");
    console.log("  Before length:", classification.rawOutput?.length);
    console.log("  After length:", stored.llm_raw_output?.length);
    console.log("  Before first 200:", classification.rawOutput?.substring(0, 200));
    console.log("  After first 200:", stored.llm_raw_output?.substring(0, 200));
  }

  if (classification.marketContext !== (stored as any).llm_market_context) {
    console.log("\n❌ MARKET CONTEXT MISMATCH!");
    console.log("  Before:", classification.marketContext);
    console.log("  After:", (stored as any).llm_market_context);
  }
  
  if (classification.reasoning !== stored.llm_reasoning) {
    console.log("\n❌ REASONING MISMATCH!");
    console.log("  Before:", classification.reasoning);
    console.log("  After:", stored.llm_reasoning);
  }
  
  console.log("\n=== DATA RETRIEVED FROM NEONDB (WHAT WE'LL SEND TO VERIFY API) ===");
  console.log("Tweet Text:", stored.message_text);
  console.log("Signature:", stored.llm_signature);
  console.log("Model:", stored.llm_model_used);
  console.log("Chain ID:", stored.llm_chain_id);
  console.log("Market Context:", (stored as any).llm_market_context);
  console.log("Raw Output length:", stored.llm_raw_output?.length || 0);
  console.log("Raw Output first 200 chars:", stored.llm_raw_output?.substring(0, 200));
  console.log("Raw Output last 200 chars:", stored.llm_raw_output?.substring((stored.llm_raw_output?.length || 0) - 200));

  // 4) Call verify-signature API (assumes local Next dev server on 5000)
  const verifyBody = {
    tweetText: stored.message_text,
    llm_signature: stored.llm_signature,
    llm_raw_output: stored.llm_raw_output,
    llm_model_used: stored.llm_model_used,
    llm_chain_id: stored.llm_chain_id,
    llm_market_context: (stored as any).llm_market_context || "NO MARKET DATA AVAILABLE",
    operator_address: process.env.EIGENAI_OPERATOR_ADDRESS,
  };

  console.log("\n[DEBUG] Verification payload keys:", Object.keys(verifyBody));
  console.log("[DEBUG] Expected operator:", verifyBody.operator_address || "(default in API)");
  console.log("[DEBUG] Market context being sent:", verifyBody.llm_market_context);
  console.log("[DEBUG] Raw output length being sent:", verifyBody.llm_raw_output?.length);
  
  console.log("\n=== CRITICAL COMPARISON: EIGENAI INPUT vs VERIFICATION INPUT ===");
  console.log("This verifies the data stored in NeonDB matches what EigenAI originally signed:");
  console.log("Tweet Text matches?:", TWEET === verifyBody.tweetText);
  console.log("Signature matches?:", classification.signature === verifyBody.llm_signature);
  console.log("Model matches?:", classification.model === verifyBody.llm_model_used);
  console.log("Chain ID matches?:", classification.chainId === verifyBody.llm_chain_id);
  console.log("Market Context matches?:", classification.marketContext === verifyBody.llm_market_context);
  console.log("Raw Output matches?:", classification.rawOutput === verifyBody.llm_raw_output);
  
  if (classification.rawOutput !== verifyBody.llm_raw_output) {
    console.log("\n⚠️  WARNING: Raw output mismatch detected!");
    console.log("Original length:", classification.rawOutput?.length);
    console.log("DB stored length:", verifyBody.llm_raw_output?.length);
  }

  const resp = await fetch("http://localhost:5000/api/eigenai/verify-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verifyBody),
  });

  const verifyResult = await resp.json();

  console.log("\n=== CLASSIFICATION RESULT (PARSED) ===");
  console.log(JSON.stringify({
    isSignalCandidate: classification.isSignalCandidate,
    extractedTokens: classification.extractedTokens,
    sentiment: classification.sentiment,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
  }, null, 2));

  console.log("\n=== VERIFICATION RESULT (FROM API) ===");
  console.log(JSON.stringify(verifyResult, null, 2));
  
  console.log("\n=== FINAL SUMMARY ===");
  if (verifyResult.isValid) {
    console.log("✅ SUCCESS: Signature verification passed!");
    console.log("✅ Market context approach is working correctly");
    console.log("✅ Data integrity maintained (DB storage → API → Verification)");
  } else {
    console.log("❌ FAILED: Signature verification failed");
    console.log("   Recovered:", verifyResult.recoveredAddress);
    console.log("   Expected:", verifyResult.expectedAddress);
  }
  
  // Additional checks
  if (classification.reasoning === "Failed to parse LLM response") {
    console.log("\n⚠️  WARNING: LLM response parsing failed");
    console.log("   This means the JSON extraction needs improvement");
    console.log("   Check the raw output format and extraction logic");
  }
}

main()
  .catch((err) => {
    console.error("❌ Script failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
