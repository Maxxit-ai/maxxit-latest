import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../lib/lazy-trading-api";

const prismaClient = prisma as any;

// ── EigenAI Config ──────────────────────────────────────────────────────────
const DEFAULT_EIGENAI_BASE_URL = "https://eigenai.eigencloud.xyz/v1";
const EIGENAI_MODEL = process.env.EIGENAI_MODEL || "gpt-oss-120b-f16";
const CACHE_AGE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

// Build full prompt for signature verification (system + user message)
// Must match exactly what is sent to EigenAI so the stored prompt is verifiable
const EIGENAI_SYSTEM_MESSAGE =
  "You are a crypto trade alignment analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.";

interface LunarCrushMarketData {
  galaxy_score: number | null;
  alt_rank: number | null;
  social_volume_24h: number | null;
  sentiment: number | null;
  percent_change_24h: number | null;
  volatility: number | null;
  price: number | null;
  volume_24h: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  social_dominance: number | null;
  market_dominance: number | null;
  interactions_24h: number | null;
  galaxy_score_previous: number | null;
  alt_rank_previous: number | null;
}

interface EigenAIAnalysis {
  reasoning: string;
  llmSignature: string;
  rawOutput?: string;
  model?: string;
  chainId?: number;
}

interface OpenPositionResponse {
  success: boolean;
  orderId?: string;
  tradeId?: string;
  transactionHash?: string;
  txHash?: string;
  status?: string;
  message?: string;
  actualTradeIndex?: number;
  entryPrice?: number;
  slSet?: boolean;
  slError?: string | null;
  result?: any;
  error?: string;
  // EigenAI analysis
  reasoning?: string | null;
  llmSignature?: string | null;
  lunarCrushData?: LunarCrushMarketData | null;
}

// ── EigenAI Caller ──────────────────────────────────────────────────────────

/**
 * Call EigenAI API (OpenAI-compatible chat completions)
 * Modeled after callEigenAI in llm-classifier.ts
 */
async function callEigenAI(prompt: string): Promise<{
  content: string;
  signature?: string;
  rawOutput?: string;
  model?: string;
  chainId?: number;
}> {
  const apiKey = process.env.EIGENAI_API_KEY;
  if (!apiKey) {
    throw new Error("EIGENAI_API_KEY not configured");
  }

  const baseUrl = (
    process.env.EIGENAI_BASE_URL || DEFAULT_EIGENAI_BASE_URL
  ).replace(/\/$/, "");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: EIGENAI_MODEL,
      messages: [
        {
          role: "system",
          content: EIGENAI_SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 3500,
      seed: 42,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`EigenAI API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as any;

  console.log("[OpenPosition callEigenAI] EigenAI API raw response keys:", Object.keys(data));
  console.log("[OpenPosition callEigenAI] data.signature:", data.signature ? `${data.signature.slice(0, 30)}...` : "MISSING");
  console.log("[OpenPosition callEigenAI] data.model:", data.model);

  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error("EigenAI API response missing 'choices' array");
  }

  if (!data.choices[0] || !data.choices[0].message) {
    throw new Error("EigenAI API response missing 'message' in choices[0]");
  }

  const message = data.choices[0].message;

  if (message.tool_calls && message.tool_calls.length > 0) {
    throw new Error(
      `EigenAI returned tool_calls instead of content. Function: ${message.tool_calls[0]?.function?.name || "unknown"}`
    );
  }

  const rawOutput = message.content;

  if (!rawOutput || typeof rawOutput !== "string") {
    throw new Error(
      `EigenAI response missing 'content'. Got: ${typeof rawOutput}. Finish reason: ${data.choices[0].finish_reason}`
    );
  }

  // Extract content – try <|end|> tag first, then <|channel|>final, fallback to raw
  let extractedContent = rawOutput;

  const endTagMatch = rawOutput.match(/<\|end\|>\s*(\{[\s\S]*\})\s*$/);
  if (endTagMatch) {
    extractedContent = endTagMatch[1].trim();
  } else {
    const finalChannelMatch = rawOutput.match(
      /<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/
    );
    if (finalChannelMatch) {
      extractedContent = finalChannelMatch[1].trim();
    }
  }

  return {
    content: extractedContent,
    signature: data.signature,
    rawOutput: rawOutput,
    model: data.model,
    chainId: 1,
  };
}

// ── LunarCrush Data Fetcher ─────────────────────────────────────────────────

/**
 * Fetch cached LunarCrush data from database (ostium_available_pairs table)
 * Same pattern as lunarcrush-wrapper.ts and llm-classifier.ts
 */
async function fetchLunarCrushDataForMarket(
  market: string
): Promise<LunarCrushMarketData | null> {
  try {
    const upperMarket = market.toUpperCase();
    // Find pair by symbol prefix (e.g., "BTC" matches "BTC/USD")
    const cachedData = await prismaClient.ostium_available_pairs.findFirst({
      where: {
        symbol: {
          startsWith: upperMarket,
        },
      },
    });

    console.log("[OpenPosition] Cached LunarCrush data:", cachedData);

    if (!cachedData) {
      console.log(`[OpenPosition] No cached LunarCrush data for ${upperMarket}`);
      return null;
    }

    // Check if cache is fresh (less than 24 hours old)
    const ageMs = Date.now() - cachedData.updated_at.getTime();
    if (ageMs > CACHE_AGE_LIMIT_MS) {
      console.log(
        `[OpenPosition] Cache expired for ${upperMarket} (${(ageMs / 1000 / 60 / 60).toFixed(1)}h old)`
      );
      return null;
    }

    console.log(
      `[OpenPosition] ✅ Using cached LunarCrush data for ${upperMarket} (${(ageMs / 1000 / 60).toFixed(0)}m old)`
    );

    return {
      galaxy_score: cachedData.galaxy_score,
      alt_rank: cachedData.alt_rank,
      social_volume_24h: cachedData.social_volume_24h,
      sentiment: cachedData.sentiment,
      percent_change_24h: cachedData.percent_change_24h,
      volatility: cachedData.volatility,
      price: cachedData.price ? Number(cachedData.price) : null,
      volume_24h: cachedData.volume_24h ? Number(cachedData.volume_24h) : null,
      market_cap: cachedData.market_cap ? Number(cachedData.market_cap) : null,
      market_cap_rank: cachedData.market_cap_rank,
      social_dominance: cachedData.social_dominance,
      market_dominance: cachedData.market_dominance,
      interactions_24h: cachedData.interactions_24h,
      galaxy_score_previous: cachedData.galaxy_score_previous,
      alt_rank_previous: cachedData.alt_rank_previous,
    };
  } catch (error: any) {
    console.error(
      `[OpenPosition] Error fetching LunarCrush data for ${market}:`,
      error.message
    );
    return null;
  }
}

// ── Prompt Builder ──────────────────────────────────────────────────────────

/**
 * Build the EigenAI prompt for trade alignment analysis
 */
function buildTradeAnalysisPrompt(
  requestBody: Record<string, any>,
  lunarCrushData: LunarCrushMarketData | null
): string {
  let marketContext = "NO MARKET DATA AVAILABLE";

  if (lunarCrushData) {
    const pct24h = lunarCrushData.percent_change_24h ?? 0;
    const vol = lunarCrushData.volume_24h ?? 0;
    const volM = (vol / 1e6).toFixed(1);
    const mCapB = lunarCrushData.market_cap
      ? (lunarCrushData.market_cap / 1e9).toFixed(2)
      : "N/A";

    marketContext = `
Price: $${lunarCrushData.price?.toFixed(2) ?? "N/A"}
Market Cap: $${mCapB}B
24h Change: ${pct24h.toFixed(2)}%
24h Volume: $${volM}M
Galaxy Score: ${lunarCrushData.galaxy_score ?? "N/A"}/100
Alt Rank: ${lunarCrushData.alt_rank ?? "N/A"}
Volatility: ${lunarCrushData.volatility?.toFixed(4) ?? "N/A"}
Sentiment: ${lunarCrushData.sentiment ?? "N/A"}/100
Social Volume 24h: ${lunarCrushData.social_volume_24h ?? "N/A"}
Social Dominance: ${lunarCrushData.social_dominance ?? "N/A"}
Market Dominance: ${lunarCrushData.market_dominance ?? "N/A"}
Interactions 24h: ${lunarCrushData.interactions_24h ?? "N/A"}
Galaxy Score Previous: ${lunarCrushData.galaxy_score_previous ?? "N/A"}
Alt Rank Previous: ${lunarCrushData.alt_rank_previous ?? "N/A"}
Market Cap Rank: ${lunarCrushData.market_cap_rank ?? "N/A"}`.trim();
  }

  // Pass the entire request body as JSON so EigenAI can see all fields
  const requestBodyJson = JSON.stringify(requestBody, null, 2);

  return `You are an expert crypto trade risk analyst. You will receive a user's trade request body and LunarCrush market data. Your job is to:
1. Pass through ALL the trade fields from the request body exactly as provided
2. Analyze whether the trade parameters align with market conditions
3. Add your reasoning and signature to the response

USER REQUEST BODY:
${requestBodyJson}

LUNARCRUSH MARKET DATA:
${marketContext}

ANALYSIS GUIDELINES:
1. Evaluate if the trade SIDE (long/short) aligns with the market momentum (24h change, sentiment, galaxy score trend)
2. Assess if the LEVERAGE is appropriate given the volatility and market conditions
3. Check if the STOP LOSS percentage is reasonable for the asset's volatility
4. Consider the COLLATERAL size relative to market liquidity (volume)
5. Factor in social sentiment and galaxy score trends

REASONING RULES:
- Be specific about WHY the trade is or isn't aligned with market conditions
- Reference actual market data values in your reasoning
- If no market data is available, state that clearly and provide general risk assessment based on the parameters alone
- Keep reasoning concise but informative (2-4 sentences)

RESPONSE FORMAT (JSON only):
You MUST return ALL the original fields from the request body, plus "reasoning" and "llmSignature".
{
  "agentAddress": "<pass through from request>",
  "userAddress": "<pass through from request>",
  "market": "<pass through from request>",
  "side": "<pass through from request>",
  "collateral": <pass through from request>,
  "leverage": <pass through from request, default 10 if not provided>,
  "stopLossPercent": <pass through from request, default 0.10 if not provided>,
  "deploymentId": "<pass through from request or null>",
  "signalId": "<pass through from request or null>",
  "isTestnet": <pass through from request or false>,
  "reasoning": "Your analysis of whether the trade parameters align with market conditions...",
  "llmSignature": "EIGENAI_TRADE_ANALYSIS_V1"
}

CRITICAL: Pass through ALL original field values EXACTLY as provided. Do NOT modify them. Only ADD reasoning and llmSignature.

Output ONLY valid JSON. Start with { and end with }. No text outside JSON.`;
}

// ── API Handler ─────────────────────────────────────────────────────────────

/**
 * Open Position
 * Open a new trading position on Ostium with EigenAI trade analysis
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OpenPositionResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    const requestBody = req.body || {};

    // ── Step 1: Fetch LunarCrush market data ──────────────────────────────
    // Use client-provided data if available, otherwise fetch from DB cache
    let lunarCrushData: LunarCrushMarketData | null = null;
    const marketHint = requestBody.market;

    if (requestBody.lunarCrushData && typeof requestBody.lunarCrushData === "object") {
      console.log("[OpenPosition] Using client-provided LunarCrush data");
      lunarCrushData = requestBody.lunarCrushData as LunarCrushMarketData;
    } else if (marketHint) {
      console.log(`[OpenPosition] Fetching LunarCrush data for market: ${marketHint}`);
      lunarCrushData = await fetchLunarCrushDataForMarket(marketHint);
    }

    // ── Step 2: Call EigenAI ──────────────────────────────────────────────
    // EigenAI receives the raw request body + LunarCrush data and returns
    // ALL trade fields + reasoning + llmSignature
    let eigenAIAnalysis: EigenAIAnalysis | null = null;
    let eigenParsed: Record<string, any> | null = null;

    // Build and store the full prompt so it can be persisted for audit
    let eigenFullPrompt: string | null = null;
    let eigenRawOutput: string | null = null;
    let modelForStorage: string = EIGENAI_MODEL;
    let chainIdForStorage: number = 1;

    try {
      const userPrompt = buildTradeAnalysisPrompt(requestBody, lunarCrushData);

      // Concatenate system + user message — same pattern as llm-classifier.ts L96-98
      // This ensures what we store in DB is the *exact* payload that EigenAI signs
      eigenFullPrompt = EIGENAI_SYSTEM_MESSAGE + userPrompt;

      console.log("[OpenPosition] ========== EIGENAI FLOW START ==========");
      console.log("[OpenPosition] EIGENAI_SYSTEM_MESSAGE length:", EIGENAI_SYSTEM_MESSAGE.length);
      console.log("[OpenPosition] EIGENAI_SYSTEM_MESSAGE first 80 chars:", JSON.stringify(EIGENAI_SYSTEM_MESSAGE.slice(0, 80)));
      console.log("[OpenPosition] userPrompt length:", userPrompt.length);
      console.log("[OpenPosition] eigenFullPrompt length:", eigenFullPrompt.length);
      console.log("[OpenPosition] eigenFullPrompt first 120 chars:", JSON.stringify(eigenFullPrompt.slice(0, 120)));
      console.log("[OpenPosition] eigenFullPrompt last 120 chars:", JSON.stringify(eigenFullPrompt.slice(-120)));
      console.log("[OpenPosition] Calling EigenAI for trade analysis...");
      const eigenResponse = await callEigenAI(userPrompt);
      eigenRawOutput = eigenResponse.rawOutput ?? null;

      console.log("[OpenPosition] EigenAI response:", {
        contentLength: eigenResponse.content?.length,
        rawOutputLength: eigenResponse.rawOutput?.length,
        hasSignature: !!eigenResponse.signature,
        signaturePrefix: eigenResponse.signature?.slice(0, 20),
        model: eigenResponse.model,
        chainId: eigenResponse.chainId,
      });
      console.log("[OpenPosition] rawOutput first 120 chars:", JSON.stringify(eigenResponse.rawOutput?.slice(0, 120)));
      console.log("[OpenPosition] rawOutput last 120 chars:", JSON.stringify(eigenResponse.rawOutput?.slice(-120)));

      // Use request model when API omits it (EigenAI signs with the model used)
      modelForStorage = eigenResponse.model || EIGENAI_MODEL;
      chainIdForStorage = eigenResponse.chainId ?? 1;
      if (!eigenResponse.model) {
        console.warn("[OpenPosition] EigenAI response missing model, using request model:", EIGENAI_MODEL);
      }

      // Parse the EigenAI JSON response
      const jsonMatch = eigenResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        eigenParsed = JSON.parse(jsonMatch[0]);
        eigenAIAnalysis = {
          reasoning: eigenParsed!.reasoning || "No reasoning provided by LLM",
          llmSignature: eigenResponse.signature || eigenParsed!.llmSignature || "EIGENAI_UNSIGNED",
          rawOutput: eigenResponse.rawOutput,
          model: modelForStorage,
          chainId: chainIdForStorage,
        };
        console.log("[OpenPosition] eigenAIAnalysis for DB:", {
          llmSignature: eigenAIAnalysis.llmSignature?.slice(0, 30),
          model: eigenAIAnalysis.model,
          chainId: eigenAIAnalysis.chainId,
        });
        console.log("[OpenPosition] ✅ EigenAI analysis complete");
      } else {
        console.warn("[OpenPosition] ⚠️ Could not parse EigenAI response as JSON");
      }
    } catch (eigenError: any) {
      // Non-blocking: trade proceeds even if EigenAI fails
      console.warn(
        `[OpenPosition] ⚠️ EigenAI analysis failed (trade will proceed): ${eigenError.message}`
      );
    }

    // ── Fire-and-forget: persist EigenAI verification record ─────────────
    const verificationData = {
      agent_address: (eigenParsed ?? requestBody).agentAddress ?? null,
      user_address: (eigenParsed ?? requestBody).userAddress ?? null,
      market: (eigenParsed ?? requestBody).market ?? null,
      side: (eigenParsed ?? requestBody).side ?? null,
      deployment_id: (eigenParsed ?? requestBody).deploymentId ?? null,
      signal_id: (eigenParsed ?? requestBody).signalId ?? null,
      llm_full_prompt: eigenFullPrompt,
      llm_raw_output: eigenRawOutput,
      llm_reasoning: eigenAIAnalysis?.reasoning ?? null,
      llm_signature: eigenAIAnalysis?.llmSignature ?? null,
      llm_model_used: eigenAIAnalysis?.model ?? modelForStorage,
      llm_chain_id: eigenAIAnalysis?.chainId ?? chainIdForStorage,
    };
    console.log("[OpenPosition] Persisting verification record with lengths:", {
      llm_full_prompt_length: verificationData.llm_full_prompt?.length,
      llm_raw_output_length: verificationData.llm_raw_output?.length,
      llm_signature_length: verificationData.llm_signature?.length,
      llm_model_used: verificationData.llm_model_used,
      llm_chain_id: verificationData.llm_chain_id,
    });
    console.log("[OpenPosition] Stored llm_full_prompt first 120:", JSON.stringify(verificationData.llm_full_prompt?.slice(0, 120)));
    console.log("[OpenPosition] Stored llm_raw_output first 120:", JSON.stringify(verificationData.llm_raw_output?.slice(0, 120)));
    prismaClient.openclaw_eigen_verification
      .create({
        data: verificationData,
      })
      .then(() => {
        console.log("[OpenPosition] ✅ EigenAI verification record saved");
        console.log("[OpenPosition] ========== EIGENAI FLOW END ==========");
      })
      .catch((err: any) =>
        console.warn("[OpenPosition] ⚠️ Failed to save EigenAI verification record:", err.message)
      );

    // ── Step 3: Extract trade fields from EigenAI response ───────────────
    // EigenAI returns all trade fields; fall back to raw request body if EigenAI failed
    const tradeFields = eigenParsed || requestBody;

    const {
      agentAddress,
      userAddress,
      market,
      side,
      collateral,
      leverage,
      stopLossPercent,
      deploymentId,
      signalId,
      isTestnet,
    } = tradeFields;

    // Validate required fields (AFTER EigenAI processing)
    if (!agentAddress || !userAddress || !market || !side || collateral === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields after EigenAI processing: agentAddress, userAddress, market, side, collateral"
      });
    }

    // ── Step 4: Call Ostium service to open position ─────────────────────
    const ostiumServiceUrl = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

    const openPositionResponse = await fetch(`${ostiumServiceUrl}/open-position`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentAddress,
        userAddress,
        market,
        side,
        collateral,
        leverage: leverage || 10,
        stopLossPercent: stopLossPercent || 0.10,
        deploymentId,
        signalId,
        isTestnet
      }),
    });

    if (!openPositionResponse.ok) {
      const errorText = await openPositionResponse.text();
      console.error("[Ostium] Open position error:", errorText);
      return res.status(500).json({
        success: false,
        error: "Failed to open position from Ostium service",
      });
    }

    const positionData = await openPositionResponse.json();

    // Update last used timestamp for API key
    await prismaClient.user_api_keys.update({
      where: { id: apiKeyRecord.id },
      data: { last_used_at: new Date() },
    });

    return res.status(200).json({
      success: true,
      orderId: positionData.orderId,
      tradeId: positionData.tradeId,
      transactionHash: positionData.transactionHash,
      txHash: positionData.txHash,
      status: positionData.status,
      message: positionData.message,
      actualTradeIndex: positionData.actualTradeIndex,
      entryPrice: positionData.entryPrice,
      slSet: positionData.slSet,
      slError: positionData.slError,
      result: positionData.result,
      // EigenAI analysis fields
      reasoning: eigenAIAnalysis?.reasoning ?? null,
      llmSignature: eigenAIAnalysis?.llmSignature ?? null,
    });
  } catch (error: any) {
    console.error("[API] Lazy trading open position error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to open position",
    });
  }
}
