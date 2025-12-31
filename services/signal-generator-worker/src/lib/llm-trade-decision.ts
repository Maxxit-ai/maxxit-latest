/**
 * LLM-based Trade Decision Service
 * Uses Perplexity AI to make trade decisions based on multiple data sources
 */

interface TradeDecisionInput {
  message: string;
  confidenceScore: number; // From Agent How (0-1)
  lunarcrushData?: {
    data: Record<string, any>;
    descriptions: Record<string, string>;
  } | null;
  userTradingPreferences?: {
    risk_tolerance: number; // 0-100
    trade_frequency: number; // 0-100
    social_sentiment_weight: number; // 0-100
    price_momentum_focus: number; // 0-100
    market_rank_priority: number; // 0-100
  };
  userBalance: number; // Current balance in USDC
  venue: string; // HYPERLIQUID or OSTIUM
  token: string; // Token symbol
  side: string; // LONG or SHORT
  maxLeverage?: number; // Venue/token-specific max leverage (if known)
  isLazyTraderAgent?: boolean; // True for Lazy Trader agents (don't prioritize confidence score as much)
  influencerImpactFactor?: number; // Impact factor of the signal sender (0-100, 50=neutral)
}

interface TradeDecision {
  shouldTrade: boolean;
  fundAllocation: number; // Percentage of balance (0-100)
  leverage: number; // Leverage multiplier (1x-100x)
  reason: string; // Reason for the decision
}

type LLMProvider = "perplexity" | "openai";

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

/**
 * Trade Decision Maker using LLM
 */
export class LLMTradeDecisionMaker {
  private provider: LLMProvider;
  private apiKey: string;
  private model: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;

    // Default models
    if (config.model) {
      this.model = config.model;
    } else if (this.provider === "perplexity") {
      this.model = "sonar-reasoning-pro";
    } else {
      this.model = "gpt-4o-mini";
    }
  }

  /**
   * Make a trade decision based on all available data
   */
  async makeTradeDecision(input: TradeDecisionInput): Promise<TradeDecision> {
    const prompt = this.buildPrompt(input);

    try {
      let response: string;

      if (this.provider === "perplexity") {
        response = await this.callPerplexity(prompt);
      } else {
        response = await this.callOpenAI(prompt);
      }

      return this.parseResponse(response);
    } catch (error: any) {
      console.error("[LLM Trade Decision] Error making trade decision:", error.message);

      // Return a conservative decision as fallback
      return {
        shouldTrade: false,
        fundAllocation: 0,
        leverage: 1,
        reason: `Failed to get LLM decision: ${error.message}`
      };
    }
  }

  /**
   * Build the prompt for the LLM
   */
  private buildPrompt(input: TradeDecisionInput): string {
    // Format analytics data with descriptions
    let analyticsSection = "Not available";

    // Field name mapping to use user-friendly terminology in reasoning
    const fieldNameMapping: Record<string, string> = {
      galaxy_score: "Momentum Index",
      alt_rank: "Relative Market Position",
    };

    if (input.lunarcrushData && input.lunarcrushData.data && input.lunarcrushData.descriptions) {
      const formattedData: string[] = [];
      const { data, descriptions } = input.lunarcrushData;

      // Only include fields that have values (not null)
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          // Use mapped field name if available, otherwise use original key
          const displayName = fieldNameMapping[key] || key;
          const description = descriptions[key] || `${displayName} metric`;
          formattedData.push(`${displayName}: ${value} - ${description}`);
        }
      }

      if (formattedData.length > 0) {
        analyticsSection = formattedData.join("\n");
      }
    }

    // Determine confidence instruction based on whether this is a Lazy Trader agent
  const confidenceInstruction = input.isLazyTraderAgent
    ? `CONFIDENCE SCORE: ${input.confidenceScore}
This is a Lazy Trader agent - do NOT heavily weigh the confidence score. 
Even if confidence is lower, you can proceed with the trade if analytics and market conditions are favorable.
Focus primarily on market analytics, momentum, sentiment, and risk/reward rather than the confidence score.`
    : `CONFIDENCE SCORE: ${input.confidenceScore}
CRITICAL: Confidence score is a KEY factor in your decision. This represents the signal quality/strength.
• High confidence (>0.7): Strong signal - can take larger positions if analytics support it
• Medium confidence (0.4-0.7): Moderate signal - use conservative sizing, require supportive analytics
• Low confidence (<0.4): Weak signal - SKIP trade unless analytics are exceptionally strong AND all conditions align perfectly
Do NOT ignore low confidence scores. They indicate signal uncertainty and should heavily influence your decision to trade.`;

  return `You are AGENT HOW (Trading-Style Clone). Turn the signal + analytics into a trade decision that feels like the user would trade (cadence + conviction + what they prioritize), while using controlled-risk sizing and (when allowed) modest leverage.

Key constraints:
	•	Do not quote user preference numbers/scales in the explanation.
	•	Do show market/analytics/pricing numbers to reflect the research effort (e.g., price, % move, momentum/volatility/liquidity metrics, sentiment metrics, rank, funding/open interest—whatever exists in analytics).
	•	Do not mention any external providers/services by name.

SIGNAL:
"${input.message}"

${confidenceInstruction}

ANALYTICS:
${analyticsSection}

INFLUENCER IMPACT FACTOR: ${input.influencerImpactFactor ?? 50}/100
This represents the historical performance of the signal sender (0=worst, 50=neutral, 100=best).
• Excellent (>80): Strongly favor this signal, boost confidence significantly (exceptional historical success)
• High (60-80): Weight historical success, moderately boost confidence
• Neutral (40-60): No historical bias - proceed normally without favor/penalty
• Low (20-40): More skeptical, require stronger signal evidence for high confidence
• Very Poor (<20): Highly skeptical, require extremely strong signal evidence for any confidence

USER STYLE INPUTS (use internally; don't echo numeric values):
${JSON.stringify(input.userTradingPreferences || "Not available", null, 2)}

BALANCE: $${input.userBalance.toFixed(2)} USDC
MAX LEVERAGE: ${input.maxLeverage ?? "Unknown"}

TRADE:
	•	Venue: ${input.venue}
	•	Token: ${input.token}
	•	Side: ${input.side}

DECIDE + SIZE:
	•	Default to participation with low-risk exposure when evidence is mixed but not broken (a "probe").
	•	Skip trade only on clear red flags (bad liquidity/slippage, chaotic volatility, major metric conflicts, unclear invalidation).
	•	Keep capital in reserve if the user prefers multiple entries.
	•	Use leverage to express conviction only if it stays well within max leverage and liquidation risk is reasonable.

RESEARCH SAVED:
In the reason, explicitly say what analysis you compressed/synthesized for them (time/effort saved), in natural language.

VENUE RULES:
	•	HYPERLIQUID: set "leverage": 1 (exposure via fundAllocation).
	•	OSTIUM: leverage allowed up to max.

⸻

OUTPUT (JSON ONLY)

Return only this JSON object:

{
"shouldTrade": boolean,
"fundAllocation": number,   // 0-100 (% of balance)
"leverage": number,         // 1-50 (see venue rules)
"marketEvidence": {
"price": number | null,
"priceChangePct": number | null,
"keyNumbers": [
{ "label": string, "value": number, "unit": string }
]
},
"reason": string
}

Rules for marketEvidence:
	•	Include at least 3 numeric items in keyNumbers (use whatever is present in analytics/pricing).
	•	label must be human-readable (e.g., "24h volume", "volatility", "momentum score", "sentiment delta", "rank", "funding rate", "open interest change").
	•	If a number isn't available, set fields to null (don't invent).

Rules for reason:
	•	Must feel like it follows the user's style without quoting preference numbers.
	•	Must reference some of the numbers from marketEvidence to demonstrate research effort.
	•	Must explain why this fundAllocation and leverage fit the setup + user style.
	•	Do not mention external providers/services.

HARD RULE: If fundAllocation == 0 => shouldTrade must be false.
RESPOND ONLY WITH THE JSON OBJECT.`;
  }

  /**
   * Call Perplexity API
   */
  private async callPerplexity(prompt: string): Promise<string> {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a crypto trading advisor. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ]
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0].message.content;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are a crypto trading advisor. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0].message.content;
  }



  /**
   * Parse LLM response
   */
  private parseResponse(response: string): TradeDecision {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and sanitize the response
      return {
        shouldTrade: Boolean(parsed.shouldTrade),
        fundAllocation: Math.max(0, Math.min(100, Number(parsed.fundAllocation) || 0)),
        leverage: Math.max(1, Math.min(50, Number(parsed.leverage) || 1)),
        reason: parsed.reason || "No reason provided",
      };
    } catch (error) {
      console.error("[LLM Trade Decision] Failed to parse LLM response:", error);
      console.error("[LLM Trade Decision] Response was:", response);

      // Return a conservative decision as fallback
      return {
        shouldTrade: false,
        fundAllocation: 0,
        leverage: 1,
        reason: "Failed to parse LLM response",
      };
    }
  }
}

/**
 * Create a trade decision maker instance based on environment variables
 */
export function createLLMTradeDecisionMaker(): LLMTradeDecisionMaker | null {
  const providerPreference = (process.env.TRADE_DECISION_PROVIDER || "perplexity").toLowerCase() as
    | LLMProvider;

  if (providerPreference === "perplexity") {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) return null;
    console.log("[Trade Decision] Using Perplexity AI");
    return new LLMTradeDecisionMaker({
      provider: "perplexity",
      apiKey,
      model: process.env.PERPLEXITY_MODEL || "sonar",
    });
  }

  if (providerPreference === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    console.log("[Trade Decision] Using OpenAI");
    return new LLMTradeDecisionMaker({
      provider: "openai",
      apiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
  }

  console.warn(
    "[Trade Decision] No API key found. Set PERPLEXITY_API_KEY or OPENAI_API_KEY environment variable."
  );
  return null;
}

/**
 * Make a trade decision (convenience function)
 */
export async function makeTradeDecision(input: TradeDecisionInput): Promise<TradeDecision> {
  const decisionMaker = createLLMTradeDecisionMaker();

  if (!decisionMaker) {
    // No API key - return conservative decision
    const error = new Error("No LLM API key configured");
    console.error("[Trade Decision] ❌ NO LLM API KEY - Using conservative defaults!");
    console.error(
      "   Set PERPLEXITY_API_KEY or OPENAI_API_KEY"
    );

    // Return a conservative decision as fallback
    return {
      shouldTrade: false,
      fundAllocation: 0,
      leverage: 1,
      reason: "No LLM API key configured for trade decision making"
    };
  }

  return decisionMaker.makeTradeDecision(input);
}