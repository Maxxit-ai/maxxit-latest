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
    // Format LunarCrush data with descriptions
    let lunarcrushSection = "Not available";
    if (input.lunarcrushData && input.lunarcrushData.data && input.lunarcrushData.descriptions) {
      const formattedData: string[] = [];
      const { data, descriptions } = input.lunarcrushData;

      // Only include fields that have values (not null)
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          const description = descriptions[key] || `Raw ${key} value from LunarCrush API`;
          formattedData.push(`${key}: ${value} - ${description}`);
        }
      }

      if (formattedData.length > 0) {
        lunarcrushSection = formattedData.join("\n");
      }
    }

    return `You are an expert crypto trading advisor with a deep understanding of risk management, market analysis, and quantitative decision-making. Your primary goal is to make highly accurate, data-driven trade decisions that prioritize capital preservation while optimizing for potential returns. Based on the following data, rigorously evaluate the trade opportunity and make a precise decision:

MESSAGE/SIGNAL:
"${input.message}"

CONFIDENCE SCORE (from Agent What): ${input.confidenceScore} (0.0 to 1.0)

LUNARCRUSH DATA:
${lunarcrushSection}

USER TRADING PREFERENCES:
${JSON.stringify(input.userTradingPreferences || "Not available", null, 2)}

Note about Trading Preferences:
- risk_tolerance (0-100): Higher values indicate greater comfort with risk
- trade_frequency (0-100): Higher values indicate preference for multiple smaller positions, lower values indicate preference for fewer larger positions
- social_sentiment_weight (0-100): Higher values indicate more focus on social sentiment in decisions
- price_momentum_focus (0-100): Higher values indicate more focus on price momentum
- market_rank_priority (0-100): Higher values indicate more focus on market rankings

USER BALANCE: $${input.userBalance.toFixed(2)} USDC
MAX ALLOWED LEVERAGE FOR THIS MARKET: ${input.maxLeverage ?? "Unknown"}

TRADING DETAILS:
- Venue: ${input.venue}
- Token: ${input.token}
- Side: ${input.side}

Based on all this information, decide whether to act on this signal and determine the optimal fund allocation and leverage.

Respond with a JSON object containing:
{
  "shouldTrade": boolean, // Whether to execute this trade or not
  "fundAllocation": number, // Percentage of balance to allocate (0-100%)
  "leverage": number, // Leverage multiplier (1-50x)
  "reason": string // Detailed explanation for your decision
}

GUIDELINES:
1. Consider the user's trading preferences when making decisions
2. Account for the confidence score and LunarCrush metrics
3. Be conservative with high-risk trades
4. Fund allocation and leverage should be proportional to confidence, user's trading preferences and market conditions
6. Always provide a clear reason for your decision
7. A reason should explicitly mention why it chose the fund allocation and leverage given user's balance and trading preferences. (eg. I've $4300 in balance and given my risk tolerance of 80, I'm allocating 25% of my balance to this trade using 3x leverage.)
8. Do not mention or suggest that any external service or source (such as LunarCrush or other analytics providers) was used to obtain scores or data in your explanation.
9. Pay special attention to the trade_frequency parameter in user preferences - higher values indicate the user wants to open multiple positions, so fund allocation should reflect this by allowing capital for multiple trades, while lower values indicate preference for fewer, larger positions.
10. If the fundsAllocation is 0 then shouldTrade should be false.

VENUE-SPECIFIC NOTES:
- For HYPERLIQUID: No explicit leverage (it's built into position sizing)
- For OSTIUM: Explicit leverage is available (up to max allowed for token pair)

RESPOND ONLY WITH THE JSON OBJECT, NO OTHER TEXT.`;
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