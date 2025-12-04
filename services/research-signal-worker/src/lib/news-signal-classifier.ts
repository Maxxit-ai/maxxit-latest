/**
 * News Signal Classifier
 *
 * LLM-based classification for non-crypto market news
 * Analyzes news articles and market data to generate trading signals
 */

import { NormalizedAssetData, NewsArticle } from "./data-providers/types";

/**
 * Signal classification result
 */
export interface SignalClassification {
  isSignalCandidate: boolean;
  side: "LONG" | "SHORT" | null;
  confidence: number; // 0-1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string;
  keyFactors: string[];
  newsHeadlines: string[];
  sourceUrls: string[];
}

type LLMProvider = "openai" | "anthropic" | "perplexity" | "eigenai";

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

const DEFAULT_EIGENAI_BASE_URL = "https://eigenai.eigencloud.xyz/v1";

/**
 * News Signal Classifier using LLM
 */
export class NewsSignalClassifier {
  private provider: LLMProvider;
  private apiKey: string;
  private model: string;
  private eigenAIBaseUrl: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.eigenAIBaseUrl = (
      process.env.EIGENAI_BASE_URL || DEFAULT_EIGENAI_BASE_URL
    ).replace(/\/$/, "");

    // Default models
    if (config.model) {
      this.model = config.model;
    } else if (this.provider === "openai") {
      this.model = "gpt-4o-mini";
    } else if (this.provider === "perplexity") {
      this.model = "sonar";
    } else if (this.provider === "eigenai") {
      this.model = "gpt-oss-120b-f16";
    } else {
      this.model = "claude-3-haiku-20240307";
    }
  }

  /**
   * Classify asset data and generate trading signal
   */
  async classifyAssetData(
    assetData: NormalizedAssetData
  ): Promise<SignalClassification> {
    const prompt = this.buildPrompt(assetData);

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

      return this.parseResponse(response, assetData);
    } catch (error: any) {
      console.error(
        "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      );
      console.error("❌ LLM CLASSIFIER FAILED - ASSET WILL BE SKIPPED!");
      console.error(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      );
      console.error(`Provider: ${this.provider.toUpperCase()}`);
      console.error(`Error: ${error.message}`);
      console.error(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
      );

      return {
        isSignalCandidate: false,
        side: null,
        confidence: 0,
        sentiment: "neutral",
        reasoning: `LLM classification failed: ${error.message}`,
        keyFactors: [],
        newsHeadlines: [],
        sourceUrls: [],
      };
    }
  }

  /**
   * Build the classification prompt
   */
  private buildPrompt(assetData: NormalizedAssetData): string {
    const { symbol, assetType, quote, news } = assetData;

    // Determine what data we have
    const hasPrice = !!quote;
    const hasNews = !!(news && news.latestArticles.length > 0);

    // Build market data section
    let marketDataSection = "No market data available.";
    if (quote) {
      marketDataSection = `
- Current Price: ${quote.currentPrice}
- Previous Close: ${quote.previousClose}
- Change: ${quote.change} (${quote.changePercent?.toFixed(2)}%)
- Day High: ${quote.high}
- Day Low: ${quote.low}
- Open: ${quote.open}`;
    }

    // Build news section
    let newsSection = "No recent news available.";
    if (news && news.latestArticles.length > 0) {
      const articles = news.latestArticles.slice(0, 5);
      newsSection = articles
        .map(
          (a, i) =>
            `${i + 1}. [${a.source}] "${a.headline}" (${new Date(
              a.publishedAt
            ).toLocaleDateString()})`
        )
        .join("\n");

      if (news.averageSentiment !== undefined) {
        newsSection += `\n\nOverall News Sentiment Score: ${news.averageSentiment.toFixed(
          2
        )} (range: -1 bearish to +1 bullish)`;
        newsSection += `\nBullish articles: ${news.bullishCount}, Bearish: ${news.bearishCount}, Neutral: ${news.neutralCount}`;
      }
    }

    // Build dynamic rules based on available data
    let dataAvailabilityRule: string;
    if (hasPrice && hasNews) {
      dataAvailabilityRule = `1. You have BOTH price data AND news sentiment available.
   - Prefer signals where price action and news sentiment ALIGN (both bullish or both bearish)
   - If they contradict, lower confidence significantly
   - Strong alignment = higher confidence`;
    } else if (hasNews && !hasPrice) {
      dataAvailabilityRule = `1. You have ONLY news sentiment (no price data available).
   - Generate signal based on news sentiment strength alone
   - STRONG sentiment (score > 0.25 or < -0.25) with multiple articles = actionable signal
   - MODERATE sentiment (0.15-0.25) = moderate confidence signal
   - WEAK sentiment (< 0.15) = not actionable
   - More articles with consistent sentiment = higher confidence`;
    } else if (hasPrice && !hasNews) {
      dataAvailabilityRule = `1. You have ONLY price data (no news available).
   - Generate signal based on price momentum alone
   - Strong price movement (> 2%) = potentially actionable
   - Weak price movement (< 1%) = not actionable`;
    } else {
      dataAvailabilityRule = `1. No meaningful data available - return neutral with 0 confidence.`;
    }

    return `You are an expert financial analyst specializing in ${assetType} markets. Analyze the following market data and news for ${symbol} and determine if there is a trading signal.

ASSET: ${symbol}
TYPE: ${assetType}
DATA AVAILABLE: ${hasPrice ? "Price ✓" : "Price ✗"} | ${
      hasNews ? "News ✓" : "News ✗"
    }

MARKET DATA:
${marketDataSection}

RECENT NEWS:
${newsSection}

Analyze this data and respond with a JSON object containing:
{
  "isSignalCandidate": boolean,
  "side": "LONG" | "SHORT" | null,
  "confidence": number, // 0.0 to 1.0
  "sentiment": "bullish" | "bearish" | "neutral",
  "reasoning": string, // Brief explanation (max 200 chars)
  "keyFactors": string[] // Key factors influencing the signal (max 3)
}

RULES:
${dataAvailabilityRule}
2. For ${assetType}:
   - stocks: Consider earnings, company news, sector trends
   - indices: Consider macro events, economic data, market breadth
   - forex: Consider central bank policy, economic indicators, geopolitical events
   - commodities: Consider supply/demand, inventories, seasonal factors
3. Sentiment must align with recommended side:
   - "bullish" → side should be "LONG"
   - "bearish" → side should be "SHORT"
   - "neutral" → side should be null
4. Confidence thresholds:
   - 0.0-0.3: Weak signal, not actionable
   - 0.3-0.5: Moderate signal, worth monitoring
   - 0.5-0.7: Good signal, potentially actionable
   - 0.7-1.0: Strong signal, high conviction
5. Require confidence >= 0.5 to be a signal candidate
6. When both price and news are available: if they contradict, lower confidence significantly

Respond ONLY with the JSON object, no other text.`;
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
            content:
              "You are a financial market analyst. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
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
   * Call EigenAI API
   */
  private async callEigenAI(prompt: string): Promise<string> {
    const response = await fetch(`${this.eigenAIBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a financial market analyst. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EigenAI API error: ${response.status} ${error}`);
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
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a financial market analyst. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
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
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as any;
    return data.content[0].text;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    response: string,
    assetData: NormalizedAssetData
  ): SignalClassification {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Extract news headlines and URLs
      const newsHeadlines: string[] = [];
      const sourceUrls: string[] = [];

      if (assetData.news?.latestArticles) {
        assetData.news.latestArticles.slice(0, 5).forEach((article) => {
          newsHeadlines.push(article.headline);
          sourceUrls.push(article.url);
        });
      }

      // Validate and normalize
      const confidence = Math.max(
        0,
        Math.min(1, Number(parsed.confidence) || 0)
      );
      const isSignalCandidate =
        Boolean(parsed.isSignalCandidate) && confidence >= 0.5;

      return {
        isSignalCandidate,
        side: isSignalCandidate
          ? parsed.side === "LONG" || parsed.side === "SHORT"
            ? parsed.side
            : null
          : null,
        confidence,
        sentiment: parsed.sentiment || "neutral",
        reasoning: parsed.reasoning || "",
        keyFactors: Array.isArray(parsed.keyFactors)
          ? parsed.keyFactors.slice(0, 3)
          : [],
        newsHeadlines,
        sourceUrls,
      };
    } catch (error) {
      console.error(
        "[NewsSignalClassifier] Failed to parse LLM response:",
        error
      );
      console.error("[NewsSignalClassifier] Response was:", response);

      return {
        isSignalCandidate: false,
        side: null,
        confidence: 0,
        sentiment: "neutral",
        reasoning: "Failed to parse LLM response",
        keyFactors: [],
        newsHeadlines: [],
        sourceUrls: [],
      };
    }
  }
}

/**
 * Create a news signal classifier instance
 */
export function createNewsSignalClassifier(): NewsSignalClassifier | null {
  const providerPreference = (process.env.LLM_PROVIDER || "").toLowerCase() as
    | LLMProvider
    | "";

  const instantiate = (provider: LLMProvider): NewsSignalClassifier | null => {
    if (provider === "perplexity") {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) return null;
      console.log("[NewsSignalClassifier] Using Perplexity AI");
      return new NewsSignalClassifier({
        provider: "perplexity",
        apiKey,
        model: process.env.PERPLEXITY_MODEL || "sonar",
      });
    }

    if (provider === "eigenai") {
      const apiKey = process.env.EIGENAI_API_KEY;
      if (!apiKey) return null;
      console.log("[NewsSignalClassifier] Using EigenAI");
      return new NewsSignalClassifier({
        provider: "eigenai",
        apiKey,
        model: process.env.EIGENAI_MODEL || "gpt-oss-120b-f16",
      });
    }

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return null;
      console.log("[NewsSignalClassifier] Using OpenAI");
      return new NewsSignalClassifier({
        provider: "openai",
        apiKey,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      });
    }

    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      console.log("[NewsSignalClassifier] Using Anthropic Claude");
      return new NewsSignalClassifier({
        provider: "anthropic",
        apiKey,
        model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
      });
    }

    return null;
  };

  // Try preferred provider first
  if (providerPreference) {
    const preferred = instantiate(providerPreference as LLMProvider);
    if (preferred) {
      return preferred;
    }
    console.warn(
      `[NewsSignalClassifier] Preferred provider "${providerPreference}" not available. Falling back to default order.`
    );
  }

  // Fallback order
  const fallbackOrder: LLMProvider[] = [
    "perplexity",
    "eigenai",
    "openai",
    "anthropic",
  ];

  for (const provider of fallbackOrder) {
    const instance = instantiate(provider);
    if (instance) {
      return instance;
    }
  }

  console.warn(
    "[NewsSignalClassifier] No API key found. Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY environment variable."
  );
  return null;
}
