/**
 * LLM-based Tweet Classification Service
 * Supports OpenAI, Anthropic, Perplexity, and EigenAI APIs
 */

interface ClassificationResult {
  isSignalCandidate: boolean;
  extractedTokens: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number; // 0-1
  reasoning?: string;
}

type LLMProvider = "openai" | "anthropic" | "perplexity" | "eigenai";

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

const DEFAULT_EIGENAI_BASE_URL = "https://eigenai.eigencloud.xyz/v1";

/**
 * Tweet Classifier using LLM
 */
export class LLMTweetClassifier {
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
   * Classify a tweet and extract trading signals
   */
  async classifyTweet(tweetText: string): Promise<ClassificationResult> {
    const prompt = this.buildPrompt(tweetText);

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

      return this.parseResponse(response, tweetText);
    } catch (error: any) {
      console.error(
        "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      );
      console.error("❌ LLM CLASSIFIER FAILED - TWEET WILL BE SKIPPED!");
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
      console.error("⚠️  Tweet marked as NOT a signal candidate (no fallback)");
      console.error("⚠️  FIX YOUR API KEY TO RESUME SIGNAL DETECTION!");
      console.error(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
      );

      // Return NOT a signal candidate (no fallback)
      return {
        isSignalCandidate: false,
        extractedTokens: [],
        sentiment: "neutral",
        confidence: 0,
        reasoning: `LLM classification failed: ${error.message}`,
      };
    }
  }

  /**
   * Build the classification prompt
   */
  private buildPrompt(tweetText: string): string {
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
              "You are a crypto trading signal analyst. Always respond with valid JSON only.",
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
   * Call EigenAI API (OpenAI-compatible format)
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
              "You are a crypto trading signal analyst. Always respond with valid JSON only.",
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
   * Call Perplexity API (OpenAI-compatible format)
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
              "You are a crypto trading signal analyst. Always respond with valid JSON only.",
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
    originalTweet: string
  ): ClassificationResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        isSignalCandidate: Boolean(parsed.isSignalCandidate),
        extractedTokens: Array.isArray(parsed.extractedTokens)
          ? parsed.extractedTokens.map((t: string) => t.toUpperCase())
          : [],
        sentiment: parsed.sentiment || "neutral",
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reasoning: parsed.reasoning || "",
      };
    } catch (error) {
      console.error("[LLM Classifier] Failed to parse LLM response:", error);
      console.error("[LLM Classifier] Response was:", response);

      // Return NOT a signal candidate (parsing failed)
      return {
        isSignalCandidate: false,
        extractedTokens: [],
        sentiment: "neutral",
        confidence: 0,
        reasoning: "Failed to parse LLM response",
      };
    }
  }
}

/**
 * Create an LLM classifier instance based on environment variables
 */
export function createLLMClassifier(): LLMTweetClassifier | null {
  const providerPreference = (process.env.LLM_PROVIDER || "").toLowerCase() as
    | LLMProvider
    | "";

  const instantiate = (provider: LLMProvider): LLMTweetClassifier | null => {
    if (provider === "perplexity") {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) return null;
      console.log("[LLM Classifier] Using Perplexity AI");
      return new LLMTweetClassifier({
        provider: "perplexity",
        apiKey,
        model: process.env.PERPLEXITY_MODEL || "sonar",
      });
    }

    if (provider === "eigenai") {
      const apiKey = process.env.EIGENAI_API_KEY;
      if (!apiKey) return null;
      console.log("[LLM Classifier] Using EigenAI");
      return new LLMTweetClassifier({
        provider: "eigenai",
        apiKey,
        model: process.env.EIGENAI_MODEL || "gpt-oss-120b-f16",
      });
    }

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return null;
      console.log("[LLM Classifier] Using OpenAI");
      return new LLMTweetClassifier({
        provider: "openai",
        apiKey,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      });
    }

    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      console.log("[LLM Classifier] Using Anthropic Claude");
      return new LLMTweetClassifier({
        provider: "anthropic",
        apiKey,
        model: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
      });
    }

    return null;
  };

  if (providerPreference) {
    const preferred = instantiate(providerPreference as LLMProvider);
    if (preferred) {
      return preferred;
    }
    console.warn(
      `[LLM Classifier] Preferred provider "${providerPreference}" not available. Falling back to default order.`
    );
  }

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
    "[LLM Classifier] No API key found. Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY environment variable."
  );
  return null;
}

/**
 * Classify a single tweet (convenience function)
 */
export async function classifyTweet(
  tweetText: string
): Promise<ClassificationResult> {
  const classifier = createLLMClassifier();

  if (!classifier) {
    // No API key - return NOT a signal candidate
    console.error(
      "[LLM Classifier] ❌ NO LLM API KEY - Tweet cannot be classified!"
    );
    console.error(
      "   Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY"
    );
    return {
      isSignalCandidate: false,
      extractedTokens: [],
      sentiment: "neutral",
      confidence: 0,
      reasoning: "No LLM API key configured",
    };
  }

  return classifier.classifyTweet(tweetText);
}
