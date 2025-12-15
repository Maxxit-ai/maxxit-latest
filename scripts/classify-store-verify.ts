import "dotenv/config";
import fetch from "node-fetch";
import { randomUUID } from "crypto";
import { prisma } from "@maxxit/database";
import { LLMTweetClassifier } from "../services/telegram-alpha-worker/src/lib/llm-classifier";

const TWEET =
  "Massive accumulation on $BTC. Whales are loading up. Technical setup looks perfect for a rally. Entering long position now.";

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

  console.log("\n=== RAW EIGENAI RESPONSE DATA (WHAT WE GOT) ===");
  console.log("Signature:", classification.signature);
  console.log("Model:", classification.model);
  console.log("Chain ID:", classification.chainId);
  console.log("Raw Output length:", classification.rawOutput?.length || 0);
  console.log("Raw Output first 100 chars:", classification.rawOutput?.substring(0, 100));
  console.log("Full Prompt length:", classification.fullPrompt?.length || 0);
  console.log("Full Prompt first 100 chars:", classification.fullPrompt?.substring(0, 100));

  console.log("\n=== CLASSIFICATION FULL PROMPT ANALYSIS ===");
  console.log("fullPrompt length:", classification.fullPrompt?.length || 0);
  console.log("fullPrompt first 300 chars:", classification.fullPrompt?.substring(0, 300));
  console.log("fullPrompt last 200 chars:", classification.fullPrompt?.substring((classification.fullPrompt?.length || 0) - 200));
  
  // Extract and verify the system message
  const expectedSystemMsg = "You are a crypto trading signal analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.";
  const actualSystemMsg = classification.fullPrompt?.substring(0, expectedSystemMsg.length);
  console.log("\n=== SYSTEM MESSAGE VERIFICATION ===");
  console.log("Expected system msg length:", expectedSystemMsg.length);
  console.log("Actual system msg (extracted):", actualSystemMsg?.length);
  console.log("System messages match?:", expectedSystemMsg === actualSystemMsg);
  if (expectedSystemMsg !== actualSystemMsg) {
    console.log("MISMATCH DETECTED!");
    console.log("Expected:", expectedSystemMsg);
    console.log("Actual:", actualSystemMsg);
  }
  console.log("rawOutput length:", classification.rawOutput?.length || 0);
  console.log("rawOutput first 200 chars:", classification.rawOutput?.substring(0, 200));
  console.log("\n=== MESSAGE COMPONENTS FOR VERIFICATION ===");
  const expectedMessageLength = 
    String(classification.chainId).length + 
    (classification.model?.length || 0) + 
    (classification.fullPrompt?.length || 0) + 
    (classification.rawOutput?.length || 0);
  console.log("Chain ID:", classification.chainId);
  console.log("Model:", classification.model);
  console.log("Expected message length:", expectedMessageLength);
  console.log("Components:", {
    chainId: String(classification.chainId).length,
    model: classification.model?.length,
    prompt: classification.fullPrompt?.length,
    output: classification.rawOutput?.length
  });

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
      llm_full_prompt: classification.fullPrompt ?? null,
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
  console.log("✓ Full prompt match?:", classification.fullPrompt === stored.llm_full_prompt);
  
  if (classification.signature !== stored.llm_signature) {
    console.log("❌ SIGNATURE MISMATCH!");
    console.log("  Before:", classification.signature);
    console.log("  After:", stored.llm_signature);
  }
  
  if (classification.rawOutput !== stored.llm_raw_output) {
    console.log("❌ RAW OUTPUT MISMATCH!");
    console.log("  Before length:", classification.rawOutput?.length);
    console.log("  After length:", stored.llm_raw_output?.length);
  }
  
  if (classification.fullPrompt !== stored.llm_full_prompt) {
    console.log("❌ FULL PROMPT MISMATCH!");
    console.log("  Before length:", classification.fullPrompt?.length);
    console.log("  After length:", stored.llm_full_prompt?.length);
  }

  // 4) Call verify-signature API (assumes local Next dev server on 5000)
  const verifyBody = {
    tweetText: stored.message_text,
    marketContext: stored.llm_market_context,
    llm_full_prompt: stored.llm_full_prompt,
    llm_signature: stored.llm_signature,
    llm_raw_output: stored.llm_raw_output,
    llm_model_used: stored.llm_model_used,
    llm_chain_id: stored.llm_chain_id,
    operator_address: process.env.EIGENAI_OPERATOR_ADDRESS,
  };

  console.log("\n[DEBUG] Verification payload keys:", Object.keys(verifyBody));
  console.log("[DEBUG] Expected operator:", verifyBody.operator_address || "(default in API)");

  const resp = await fetch("http://localhost:5000/api/eigenai/verify-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verifyBody),
  });

  const verifyResult = await resp.json();

  console.log("\nClassification result:");
  console.log(JSON.stringify(classification, null, 2));

  console.log("\nVerification result:");
  console.log(JSON.stringify(verifyResult, null, 2));

  // Manual verification attempt (same as eigenai-basic-verify.ts)
  if (!verifyResult.isValid) {
    console.log("\n=== MANUAL VERIFICATION ATTEMPT ===");
    const { ethers } = await import("ethers");
    
    const manualMessage = String(stored.llm_chain_id) + stored.llm_model_used + stored.llm_full_prompt + stored.llm_raw_output;
    console.log("Manual message length:", manualMessage.length);
    console.log("Manual message first 200:", manualMessage.substring(0, 200));
    
    try {
      const sigHex = stored.llm_signature!.startsWith('0x') ? stored.llm_signature! : '0x' + stored.llm_signature!;
      const recoveredManual = ethers.utils.verifyMessage(manualMessage, sigHex);
      console.log("Manual recovered address:", recoveredManual);
      console.log("Expected address:", process.env.EIGENAI_OPERATOR_ADDRESS || "0x7053bfb0433a16a2405de785d547b1b32cee0cf3");
      console.log("Match?:", recoveredManual.toLowerCase() === (process.env.EIGENAI_OPERATOR_ADDRESS || "0x7053bfb0433a16a2405de785d547b1b32cee0cf3").toLowerCase());
    } catch (err: any) {
      console.log("Manual verification error:", err.message);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
