import "dotenv/config";
import fetch from "node-fetch";
import { randomUUID } from "crypto";
import { prisma } from "@maxxit/database";
import { LLMTweetClassifier } from "../services/telegram-alpha-worker/src/lib/llm-classifier";

const TWEET =
  "Massive accumulation on $BTC. Whales are loading up. Technical setup looks perfect for a rally. Entering long position now. target should be $100,000 by next week and stop loss should be $50,000";

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
  
  
  // Extract and verify the system message
  console.log("\n=== SYSTEM MESSAGE VERIFICATION ===");
  console.log("Actual system msg (extracted):", classification.rawOutput?.length);
  console.log("rawOutput length:", classification.rawOutput?.length || 0);
  console.log("rawOutput first 200 chars:", classification.rawOutput?.substring(0, 200));
  console.log("\n=== MESSAGE COMPONENTS FOR VERIFICATION ===");
  const expectedMessageLength = 
    String(classification.chainId).length + 
    (classification.model?.length || 0) + 
    (classification.rawOutput?.length || 0);
  console.log("Chain ID:", classification.chainId);
  console.log("Model:", classification.model);
  console.log("Expected message length:", expectedMessageLength);
  console.log("Components:", {
    chainId: String(classification.chainId).length,
    model: classification.model?.length,
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
      token_price: classification.tokenPrice ?? null,
      timeline_window: classification.timelineWindow ?? null,
      impact_factor_flag: false,
      take_profit: classification.takeProfit ?? 0,
      stop_loss: classification.stopLoss ?? 0,
    },
  });

  console.log("Stored telegram_post id:", created.id);

  // 3) Fetch back the stored record
  const stored = await prisma.telegram_posts.findUnique({
    where: { id: created.id },
    select: {
      id: true,
      message_text: true,
      llm_signature: true,
      llm_model_used: true,
      llm_chain_id: true,
      llm_raw_output: true,
      llm_reasoning: true,
      llm_market_context: true,
      llm_full_prompt: true,
      token_price: true,
      timeline_window: true,
      take_profit: true,
      stop_loss: true,
    },
  });

  if (!stored) {
    throw new Error("Failed to fetch stored telegram_post");
  }

  console.log("\n=== DATA INTEGRITY CHECK (BEFORE DB vs AFTER DB) ===");
  console.log("✓ Signature match?:", classification.signature === stored.llm_signature);
  console.log("✓ Model match?:", classification.model === stored.llm_model_used);
  console.log("✓ Chain ID match?:", classification.chainId === stored.llm_chain_id);
  console.log("✓ Raw output match?:", classification.rawOutput === stored.llm_raw_output);
  console.log("✓ Market context match?:", classification.marketContext === stored.llm_market_context);
  console.log("✓ Reasoning match?:", classification.reasoning === stored.llm_reasoning);
  console.log("✓ Token price match?:", classification.tokenPrice === stored.token_price);
  console.log("✓ Timeline window match?:", classification.timelineWindow === stored.timeline_window);
  console.log("✓ Take profit match?:", classification.takeProfit === stored.take_profit);
  console.log("✓ Stop loss match?:", classification.stopLoss === stored.stop_loss);
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

  if (classification.marketContext !== stored.llm_market_context) {
    console.log("❌ MARKET CONTEXT MISMATCH!");
    console.log("  Before:", classification.marketContext);
    console.log("  After:", stored.llm_market_context);
  }
  
  if (classification.tokenPrice !== stored.token_price) {
    console.log("❌ TOKEN PRICE MISMATCH!");
    console.log("  Before:", classification.tokenPrice);
    console.log("  After:", stored.token_price);
  }

  if (classification.timelineWindow !== stored.timeline_window) {
    console.log("❌ TIMELINE WINDOW MISMATCH!");
    console.log("  Before:", classification.timelineWindow);
    console.log("  After:", stored.timeline_window);
  }

  if (classification.takeProfit !== stored.take_profit) {
    console.log("❌ TAKE PROFIT MISMATCH!");
    console.log("  Before:", classification.takeProfit);
    console.log("  After:", stored.take_profit);
  }

  if (classification.stopLoss !== stored.stop_loss) {
    console.log("❌ STOP LOSS MISMATCH!");
    console.log("  Before:", classification.stopLoss);
    console.log("  After:", stored.stop_loss);
  }

  // 4) Call verify-signature API (assumes local Next dev server on 5000)
  const verifyBody = {
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });