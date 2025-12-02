/**
 * LLM-based Trading Signal Generator
 * Combines CT tweets + market indicators to generate actionable trading signals
 */

interface TradingSignal {
  side: "LONG" | "SHORT";
  confidence: number; // 0.0 to 1.0
  entryPrice: number | null; // null = market order
  stopLoss: {
    type: "percentage" | "price";
    value: number;
  };
  takeProfit: {
    type: "percentage" | "price";
    value: number;
  };
  leverage?: number; // For perps only, 1-10x
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
}

interface SignalGeneratorInput {
  tweetText: string;
  tweetSentiment: "bullish" | "bearish" | "neutral";
  tweetConfidence: number;
  tokenSymbol: string;
  venue: "SPOT" | "GMX" | "HYPERLIQUID" | "OSTIUM";
  marketIndicators?: {
    rsi?: number;
    macd?: { value: number; signal: number; histogram: number };
    movingAverages?: { ma20?: number; ma50?: number; ma200?: number };
    volume24h?: number;
    priceChange24h?: number;
    currentPrice?: number;
  };
  ctAccountImpactFactor?: number;
}

type SignalProvider = "openai" | "anthropic" | "perplexity" | "eigenai";

const DEFAULT_EIGENAI_BASE_URL = "https://eigenai.eigencloud.xyz/v1";

export class SignalGenerator {
  private apiKey!: string;
  private provider!: SignalProvider;
  private model!: string;
  private eigenAIBaseUrl: string;

  constructor() {
    this.eigenAIBaseUrl = (
      process.env.EIGENAI_BASE_URL || DEFAULT_EIGENAI_BASE_URL
    ).replace(/\/$/, "");

    const preferred = (process.env.LLM_PROVIDER || "").toLowerCase() as
      | SignalProvider
      | "";

    const tryConfigure = (provider: SignalProvider): boolean => {
      if (provider === "perplexity") {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) return false;
        this.provider = "perplexity";
        this.apiKey = apiKey;
        this.model =
          process.env.PERPLEXITY_MODEL || "llama-3.1-sonar-large-128k-online";
        return true;
      }

      if (provider === "eigenai") {
        const apiKey = process.env.EIGENAI_API_KEY;
        if (!apiKey) return false;
        this.provider = "eigenai";
        this.apiKey = apiKey;
        this.model = process.env.EIGENAI_MODEL || "gpt-oss-120b-f16";
        return true;
      }

      if (provider === "openai") {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return false;
        this.provider = "openai";
        this.apiKey = apiKey;
        this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
        return true;
      }

      if (provider === "anthropic") {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return false;
        this.provider = "anthropic";
        this.apiKey = apiKey;
        this.model = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
        return true;
      }

      return false;
    };

    const fallbackOrder: SignalProvider[] = [
      "perplexity",
      "eigenai",
      "openai",
      "anthropic",
    ];
    let configured = false;

    if (preferred) {
      configured = tryConfigure(preferred as SignalProvider);
    }

    if (!configured) {
      for (const provider of fallbackOrder) {
        if (tryConfigure(provider)) {
          configured = true;
          break;
        }
      }
    }

    if (!configured) {
      throw new Error(
        "No LLM API key found. Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY"
      );
    }
  }

  /**
   * Generate a trading signal from tweet + market data
   */
  async generateSignal(input: SignalGeneratorInput): Promise<TradingSignal> {
    console.log(
      `[SignalGen] Generating signal for ${input.tokenSymbol} on ${input.venue}`
    );

    const prompt = this.buildPrompt(input);

    try {
      let response: string;

      if (this.provider === "openai") {
        response = await this.callOpenAI(prompt);
      } else if (this.provider === "eigenai") {
        response = await this.callEigenAI(prompt);
      } else if (this.provider === "perplexity") {
        response = await this.callPerplexity(prompt);
      } else {
        response = await this.callAnthropic(prompt);
      }

      return this.parseResponse(response, input);
    } catch (error: any) {
      console.error(
        "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      );
      console.error("⚠️  SIGNAL GENERATOR LLM ERROR - USING FALLBACK!");
      console.error(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      );
      console.error(`Provider: ${this.provider.toUpperCase()}`);
      console.error(`Error: ${error.message}`);
      if (error.message.includes("401")) {
        console.error("❌ LIKELY CAUSE: API KEY INVALID OR CREDITS EXHAUSTED");
        console.error(
          "   → Check your API key in Railway environment variables"
        );
        console.error("   → Verify your API credits at the provider dashboard");
      }
      console.error("⚠️  Using fallback rule-based signal generation");
      console.error(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
      );

      // Fallback to rule-based signal
      return this.fallbackSignal(input);
    }
  }

  /**
   * Build the LLM prompt with all context
   */
  private buildPrompt(input: SignalGeneratorInput): string {
    const isPerpetual =
      input.venue === "GMX" ||
      input.venue === "HYPERLIQUID" ||
      input.venue === "OSTIUM";
    const leverageInfo = isPerpetual
      ? "You MUST specify leverage between 1-10x."
      : "No leverage (spot trading).";

    const indicatorsText = input.marketIndicators
      ? `
Market Indicators for ${input.tokenSymbol}:
${
  input.marketIndicators.currentPrice
    ? `- Current Price: $${input.marketIndicators.currentPrice}`
    : ""
}
${
  input.marketIndicators.rsi
    ? `- RSI (14): ${input.marketIndicators.rsi.toFixed(2)} ${this.interpretRSI(
        input.marketIndicators.rsi
      )}`
    : ""
}
${
  input.marketIndicators.macd
    ? `- MACD: ${input.marketIndicators.macd.histogram.toFixed(
        2
      )} ${this.interpretMACD(input.marketIndicators.macd)}`
    : ""
}
${
  input.marketIndicators.priceChange24h
    ? `- 24h Change: ${input.marketIndicators.priceChange24h.toFixed(2)}%`
    : ""
}
${
  input.marketIndicators.volume24h
    ? `- 24h Volume: $${(input.marketIndicators.volume24h / 1e6).toFixed(2)}M`
    : ""
}
`
      : "No market indicators available.";

    return `You are an expert crypto trading signal analyst. Generate a trading signal based on this information:

TWEET ANALYSIS:
Tweet: "${input.tweetText}"
Sentiment: ${input.tweetSentiment}
Tweet Confidence: ${(input.tweetConfidence * 100).toFixed(0)}%
CT Impact Factor: ${input.ctAccountImpactFactor?.toFixed(2) || "Unknown"}

${indicatorsText}

TRADING VENUE: ${input.venue}
${leverageInfo}

TASK: Generate a complete trading signal by analyzing:
1. Tweet sentiment and conviction
2. Market indicators (RSI, MACD, price action)
3. CT account credibility (impact factor)
4. Current market conditions

Respond with a JSON object:
{
  "side": "LONG" | "SHORT",
  "confidence": number, // 0.0 to 1.0 - how confident you are in this trade
  "entryPrice": number | null, // null for market order, or specific price for limit order
  "stopLoss": {
    "type": "percentage" | "price",
    "value": number // if percentage: 0.05 = 5%, if price: actual price
  },
  "takeProfit": {
    "type": "percentage" | "price", 
    "value": number
  },
  ${isPerpetual ? '"leverage": number, // 1-10x for perpetuals' : ""}
  "reasoning": string, // 2-3 sentences explaining your decision
  "riskLevel": "low" | "medium" | "high"
}

RULES:
1. SIDE: Consider both tweet sentiment AND market indicators. If they conflict, reduce confidence.
2. CONFIDENCE: 
   - High (0.8-1.0): Strong alignment of tweet + indicators + momentum
   - Medium (0.5-0.8): Moderate alignment, some conflicts
   - Low (0.3-0.5): Weak signal or conflicting data
3. STOP LOSS: 
   - Conservative for spot (3-7%)
   - Tighter for high leverage perps (2-5%)
   - Wider for low leverage perps (5-10%)
4. TAKE PROFIT: 
   - Minimum 2:1 risk/reward ratio
   - Consider volatility and market conditions
5. LEVERAGE (perps only):
   - Low risk + high confidence → 5-10x
   - Medium risk → 3-5x
   - High risk or low confidence → 1-2x
6. RISK LEVEL:
   - Low: Strong indicators, high confidence, favorable conditions
   - Medium: Mixed signals, moderate confidence
   - High: Weak indicators, conflicting signals, volatile conditions

EXAMPLES:

Tweet: "$BTC breaking $50k! Moon mission engaged 🚀"
Sentiment: bullish, Confidence: 0.8
RSI: 45 (neutral), MACD: positive histogram
Venue: GMX (perps)
→ {
  "side": "LONG",
  "confidence": 0.75,
  "entryPrice": null,
  "stopLoss": {"type": "percentage", "value": 0.04},
  "takeProfit": {"type": "percentage", "value": 0.12},
  "leverage": 5,
  "reasoning": "Bullish tweet with strong conviction aligns with positive MACD momentum. RSI at 45 shows room to run. Using moderate 5x leverage with 4% stop and 12% target for 3:1 R/R.",
  "riskLevel": "medium"
}

Tweet: "$ETH looking weak here. Expecting pullback to $1800"
Sentiment: bearish, Confidence: 0.6
RSI: 72 (overbought), MACD: negative divergence
Venue: SPOT
→ {
  "side": "SHORT",
  "confidence": 0.7,
  "entryPrice": null,
  "stopLoss": {"type": "percentage", "value": 0.05},
  "takeProfit": {"type": "percentage", "value": 0.15},
  "reasoning": "Bearish call confirmed by overbought RSI and MACD divergence. Spot short with 5% stop above resistance and 15% target at $1800 support.",
  "riskLevel": "low"
}

Respond ONLY with the JSON object, no other text.`;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0].message.content;
  }

  /**
   * Call EigenAI API
   */
  private async callEigenAI(prompt: string): Promise<string> {
    const response = await fetch(`${this.eigenAIBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`EigenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0].message.content;
  }

  /**
   * Call Perplexity API
   */
  private async callPerplexity(prompt: string): Promise<string> {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0].message.content;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    return data.content[0].text;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    response: string,
    input: SignalGeneratorInput
  ): TradingSignal {
    try {
      // Extract JSON from markdown code blocks if present
      let jsonText = response.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonText);

      return {
        side: parsed.side || "LONG",
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        entryPrice: parsed.entryPrice,
        stopLoss: parsed.stopLoss || { type: "percentage", value: 0.05 },
        takeProfit: parsed.takeProfit || { type: "percentage", value: 0.15 },
        leverage: parsed.leverage || undefined,
        reasoning: parsed.reasoning || "LLM analysis",
        riskLevel: parsed.riskLevel || "medium",
      };
    } catch (error) {
      console.error("[SignalGen] Failed to parse LLM response:", error);
      return this.fallbackSignal(input);
    }
  }

  /**
   * Fallback signal generation using rules
   */
  private fallbackSignal(input: SignalGeneratorInput): TradingSignal {
    console.log("[SignalGen] Using rule-based fallback");

    const isPerpetual =
      input.venue === "GMX" ||
      input.venue === "HYPERLIQUID" ||
      input.venue === "OSTIUM";

    // Determine side from sentiment
    const side = input.tweetSentiment === "bearish" ? "SHORT" : "LONG";

    // Base confidence on tweet confidence and impact factor
    let confidence = input.tweetConfidence * 0.8; // Start conservative
    if (input.ctAccountImpactFactor && input.ctAccountImpactFactor > 0.7) {
      confidence = Math.min(0.95, confidence * 1.2);
    }

    // Adjust with indicators
    if (input.marketIndicators?.rsi) {
      if (side === "LONG" && input.marketIndicators.rsi < 40) confidence *= 1.1;
      if (side === "SHORT" && input.marketIndicators.rsi > 60)
        confidence *= 1.1;
      if (side === "LONG" && input.marketIndicators.rsi > 70) confidence *= 0.8;
      if (side === "SHORT" && input.marketIndicators.rsi < 30)
        confidence *= 0.8;
    }

    confidence = Math.max(0.3, Math.min(0.95, confidence));

    // Calculate risk parameters
    const baseStopLoss = isPerpetual ? 0.04 : 0.06;
    const baseTakeProfit = isPerpetual ? 0.12 : 0.18;

    // Leverage for perps (conservative)
    let leverage: number | undefined;
    if (isPerpetual) {
      if (confidence > 0.8) leverage = 5;
      else if (confidence > 0.6) leverage = 3;
      else leverage = 2;
    }

    const riskLevel =
      confidence > 0.75 ? "low" : confidence > 0.55 ? "medium" : "high";

    return {
      side,
      confidence,
      entryPrice: null, // Market order
      stopLoss: { type: "percentage", value: baseStopLoss },
      takeProfit: { type: "percentage", value: baseTakeProfit },
      leverage,
      reasoning: `Rule-based signal: ${input.tweetSentiment} sentiment with ${(
        confidence * 100
      ).toFixed(0)}% confidence based on tweet analysis${
        input.marketIndicators ? " and market indicators" : ""
      }.`,
      riskLevel,
    };
  }

  /**
   * Helper: Interpret RSI
   */
  private interpretRSI(rsi: number): string {
    if (rsi > 70) return "(Overbought)";
    if (rsi < 30) return "(Oversold)";
    return "(Neutral)";
  }

  /**
   * Helper: Interpret MACD
   */
  private interpretMACD(macd: { histogram: number }): string {
    if (macd.histogram > 0) return "(Bullish momentum)";
    if (macd.histogram < 0) return "(Bearish momentum)";
    return "(Neutral)";
  }
}

/**
 * Create a signal generator instance
 */
export function createSignalGenerator(): SignalGenerator {
  return new SignalGenerator();
}
