/**
 * LLM-based Tweet Classification Service
 * Supports EigenAI and OpenAI APIs
 */

interface ClassificationResult {
  isSignalCandidate: boolean;
  extractedTokens: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number; // 0-1
  reasoning?: string;
  signature?: string; // EigenAI response signature for verification
  rawOutput?: string; // Full raw output from LLM API (for EigenAI signature verification)
  model?: string; // Model used (for EigenAI signature verification)
  chainId?: number; // Chain ID (for EigenAI signature verification)
  marketContext?: string; // Market data context used in the prompt
  fullPrompt?: string; // EXACT full prompt sent to EigenAI (for signature verification)
}

type LLMProvider = "eigenai" | "openai";

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

const DEFAULT_EIGENAI_BASE_URL = "https://eigenai.eigencloud.xyz/v1";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * Tweet Classifier using LLM
 */
// CRITICAL: System message used for EigenAI signature verification
// This MUST match exactly what's sent to EigenAI API for signature to verify
const EIGENAI_SYSTEM_MESSAGE = "Output ONLY valid JSON. No text, no explanations, no <think> tags. Start response with { and end with }. ONLY JSON.";

export class LLMTweetClassifier {
  private provider: LLMProvider;
  private apiKey: string;
  private model: string;
  private eigenAIBaseUrl: string;
  private openAIBaseUrl: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.eigenAIBaseUrl = (
      process.env.EIGENAI_BASE_URL || DEFAULT_EIGENAI_BASE_URL
    ).replace(/\/$/, "");
    this.openAIBaseUrl = (
      process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL
    ).replace(/\/$/, "");

    // Default models based on provider
    if (config.model) {
      this.model = config.model;
    } else {
      this.model = "qwen3-32b-128k-bf16";
    }
  }

  /**
   * Classify a tweet and extract trading signals
   */
  async classifyTweet(tweetText: string): Promise<ClassificationResult> {
    // Extract token and fetch market data once (used for both providers)
    const tokenSymbol = this.extractTokenSymbol(tweetText);
    console.log("[LLMClassifier] Extracted token:", tokenSymbol);

    const marketData = tokenSymbol
      ? await this.fetchLunarCrushData(tokenSymbol)
      : null;

    console.log("marketData", marketData);
    console.log(
      "[LLMClassifier] Fetched market data:",
      marketData ? "YES" : "NO"
    );

      const { prompt, marketContext } = this.buildPromptWithMarketData(
        tweetText,
        marketData
      );

      // Construct the EXACT full prompt sent to EigenAI (system + user)
      // According to EigenAI docs: "All content fields from messages array, concatenated"
      const fullPrompt = EIGENAI_SYSTEM_MESSAGE + prompt;

    // Try primary provider first
    try {
      return await this.attemptClassification(prompt, tweetText, this.provider);
    } catch (primaryError: any) {
      // If EigenAI fails, automatically fallback to OpenAI
      if (this.provider === "eigenai") {
        const openAIKey = process.env.OPENAI_API_KEY;
        if (openAIKey) {
          console.warn(
            "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
          );
          console.warn("⚠️  EigenAI failed, falling back to OpenAI");
          console.warn(
            `   EigenAI Error: ${primaryError.message}`
          );
          console.warn(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
          );

          try {
            return await this.attemptClassification(prompt, tweetText, "openai");
          } catch (fallbackError: any) {
            this.logError("openai", fallbackError);
            throw fallbackError;
          }
        } else {
          this.logError("eigenai", primaryError);
          throw primaryError;
        }
      } else {
        this.logError(this.provider, primaryError);
        throw primaryError;
      }
    }
  }

  /**
   * Attempt classification with a specific provider
   */
  private async attemptClassification(
    prompt: string,
    tweetText: string,
    provider: LLMProvider
  ): Promise<ClassificationResult> {
    let response: string;
    let signature: string | undefined;
    let rawOutput: string | undefined;
    let model: string | undefined;
    let chainId: number | undefined;

    let apiResponse: {
      content: string;
      signature?: string;
      rawOutput?: string;
      model?: string;
      chainId?: number;
    };

    if (provider === "openai") {
      const openAIKey = process.env.OPENAI_API_KEY;
      if (!openAIKey) {
        throw new Error("OpenAI API key not configured");
      }
      apiResponse = await this.callOpenAI(prompt);
    } else {
      apiResponse = await this.callEigenAI(prompt);
    }

    console.log(`${provider}Response`, apiResponse);
    response = apiResponse.content;
    signature = apiResponse.signature;
    rawOutput = apiResponse.rawOutput;
    model = apiResponse.model;
    chainId = apiResponse.chainId;

      const result = this.parseResponse(response, tweetText);
      if (marketContext) {
        result.marketContext = marketContext;
      }
      if (fullPrompt) {
        result.fullPrompt = fullPrompt;
      }

    // Include signature and verification data if available (for EigenAI responses)
    if (signature) {
      result.signature = signature;
    }
    if (rawOutput) {
      result.rawOutput = rawOutput;
    }
    if (model) {
      result.model = model;
    }
    if (chainId !== undefined) {
      result.chainId = chainId;
    }

    return result;
  }

  private logError(provider: string, error: any): void {
    console.error(
      "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.error("❌ LLM CLASSIFIER FAILED - MESSAGE WILL STAY NULL!");
    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
    console.error(`Provider: ${provider.toUpperCase()}`);
    console.error(`Error: ${error.message}`);
    if (error.message.includes("401")) {
      console.error("❌ LIKELY CAUSE: API KEY INVALID OR CREDITS EXHAUSTED");
      console.error(
        "   → Check your API key in Railway environment variables"
      );
      console.error("   → Verify your API credits at the provider dashboard");
    }
    console.error("⚠️  Message will remain NULL (not classified)");
    console.error("⚠️  FIX YOUR API KEY TO RESUME SIGNAL DETECTION!");
    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    );
  }

  /**
   * Extract the primary token symbol from tweet text (fast & simple)
   */
  private extractTokenSymbol(tweetText: string): string | null {
    // Step 1: Check for $TOKEN (most common: $BTC, $ETH)
    const dollarMatch = tweetText.match(/\$([A-Z]{2,6})\b/i);
    if (dollarMatch) {
      return dollarMatch[1].toUpperCase();
    }

    // Step 2: Check for known tokens (BTC, ETH, SOL, etc.)
    const knownTokens =
      /\b(BTC|ETH|SOL|USDT|USDC|BNB|XRP|ADA|DOGE|AVAX|MATIC|DOT|LINK|UNI|ATOM|LTC|BCH|XLM|ALGO|VET|FIL|TRX|ETC|AAVE|MKR|THETA|XTZ|RUNE|NEAR|FTM|SAND|MANA|AXS|GALA|ENJ|CHZ|APE|LDO|ARB|OP)\b/i;
    const knownMatch = tweetText.match(knownTokens);
    if (knownMatch) {
      return knownMatch[1].toUpperCase();
    }

    // Step 3: Fallback - short uppercase words (2-5 chars), skip common words
    const stopWords =
      /\b(THE|AND|FOR|NOT|BUT|ARE|WAS|CAN|ALL|HAS|HAD|ITS|ONE|TWO|NEW|NOW|WAY|MAY|DAY|GET|GOT|SEE|SAY|USE|HER|HIS|HOW|MAN|OLD|TOO|ANY|SAME|BEEN|FROM|THEY|KNOW|WANT|BEEN|MORE|SOME|TIME|VERY|WHEN|YOUR|MAKE|THAN|INTO|YEAR|GOOD|TAKE|COME|WORK|ALSO|BACK|CALL|GIVE|MOST|OVER|THINK|WELL|EVEN|FIND|TELL|FEEL|HELP|HIGH|KEEP|LAST|LIFE|LONG|MEAN|MOVE|MUCH|NAME|NEED|OPEN|PART|PLAY|READ|REAL|SAME|SEEM|SHOW|SIDE|SUCH|SURE|TALK|TELL|THAT|THIS|TURN|WAIT|WALK|WANT|WEEK|WHAT|WHEN|WITH|WORD|WORK|WOULD|WRITE|YEAR|ABOUT|AFTER|AGAIN|COULD|EVERY|FIRST|FOUND|GREAT|HOUSE|LARGE|LATER|LEARN|LEAVE|MIGHT|NEVER|OTHER|PLACE|POINT|RIGHT|SMALL|SOUND|STILL|STUDY|THEIR|THERE|THESE|THING|THINK|THREE|UNDER|UNTIL|WATCH|WHERE|WHICH|WHILE|WORLD|WOULD|WRITE|YOUNG|CRYPTO|COINS|TOKEN|MARKET|PRICE|CHART|TRADE|LOOKING|THINKING|BUYING|SELLING)\b/i;

    const shortWords = tweetText.match(/\b[A-Z]{2,5}\b/g);
    if (shortWords) {
      for (const word of shortWords) {
        if (!stopWords.test(word)) {
          return word;
        }
      }
    }

    return null;
  }

  /**
   * Fetch LunarCrush market data for a token symbol
   */
  private async fetchLunarCrushData(symbolHint: string): Promise<any | null> {
    const apiKey = process.env.LUNARCRUSH_API_KEY;
    if (!apiKey) {
      console.warn(
        "[LLMClassifier] LUNARCRUSH_API_KEY not set, skipping market data"
      );
      return null;
    }

    try {
      // Use the /coins/list/v1 endpoint (same as in lunarcrush-score.ts)
      const response = await fetch(
        "https://lunarcrush.com/api4/public/coins/list/v1",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        console.warn(
          `[LLMClassifier] LunarCrush API error: ${response.status}`
        );
        return null;
      }

      const data = (await response.json()) as { data?: any[] };
      if (!Array.isArray(data?.data)) return null;

      const upperHint = symbolHint.toUpperCase();
      const singularHint =
        upperHint.endsWith("S") && upperHint.length > 3
          ? upperHint.slice(0, -1)
          : upperHint;

      // Find the specific coin by symbol (case-insensitive)
      let asset = data.data.find(
        (coin: any) => coin.symbol && coin.symbol.toUpperCase() === upperHint
      );

      // Fallback: try singular form
      if (!asset) {
        asset = data.data.find(
          (coin: any) =>
            coin.symbol && coin.symbol.toUpperCase() === singularHint
        );
      }

      // Fallback: try name/topic contains hint (for words like "bitcoin" -> BTC)
      if (!asset) {
        asset = data.data.find((coin: any) => {
          const name = (coin.name || "").toString().toUpperCase();
          const topic = (coin.topic || "").toString().toUpperCase();
          return name.includes(singularHint) || topic.includes(singularHint);
        });
      }

      if (!asset) {
        console.warn(
          `[LLMClassifier] Token ${symbolHint} not found in LunarCrush data`
        );
        return null;
      }

      // Return only the relevant fields for LLM context
      return {
        symbol: asset.symbol,
        name: asset.name,
        price: asset.price,
        market_cap: asset.market_cap,
        percent_change_24h: asset.percent_change_24h,
        percent_change_7d: asset.percent_change_7d,
        percent_change_30d: asset.percent_change_30d,
        volume_24h: asset.volume_24h,
        galaxy_score: asset.galaxy_score,
        alt_rank: asset.alt_rank,
        volatility: asset.volatility,
        market_cap_rank: asset.market_cap_rank,
      };
    } catch (error) {
      console.error("[LLMClassifier] Error fetching LunarCrush data:", error);
      return null;
    }
  }

  /**
   * Build enhanced prompt with market data for EigenAI
   */
  private buildPromptWithMarketData(
    tweetText: string,
    marketData: any | null
  ): { prompt: string; marketContext: string } {
    let marketContext = "NO MARKET DATA AVAILABLE";

    if (marketData) {
      console.log(
        "[LLMClassifier] Market data for prompt:",
        JSON.stringify(marketData, null, 2)
      );

      const pct24h = marketData.percent_change_24h ?? 0;
      const pct7d = marketData.percent_change_7d ?? 0;
      const pct30d = marketData.percent_change_30d ?? 0;
      const vol = marketData.volume_24h ?? 0;
      const volM = (vol / 1e6).toFixed(1);


      marketContext = `
${marketData.symbol}: Price=$${marketData.price?.toFixed(2)}, MCap=$${(
        marketData.market_cap / 1e9
      ).toFixed(1)}B
24h=${pct24h.toFixed(2)}% | 7d=${pct7d.toFixed(2)}% | 30d=${pct30d.toFixed(
        2
      )}% | Vol=${volM}M
GalaxyScore=${marketData.galaxy_score} | AltRank=${
        marketData.alt_rank
      } | Volatility=${marketData.volatility?.toFixed(4)}`;
    }

    const prompt = `Tweet: "${tweetText}"
Market: ${marketContext}

Score tweet 0.0-1.0 for trade confidence. Lower if: negative momentum, high vol, vague tweet, poor altrank, low liquidity.

JSON only:
{"isSignalCandidate":true/false,"extractedTokens":["TOKEN"],"sentiment":"bullish"/"bearish"/"neutral","confidence":0.XX,"reasoning":"Brief analysis"}`;

    return { prompt, marketContext };
  }

  /**
   * Call EigenAI API (OpenAI-compatible format)
   * Returns content, signature, and verification metadata
   */
  /**
   * Call EigenAI API (OpenAI-compatible format)
   * Returns content, signature, and verification metadata
   */
  private async callEigenAI(prompt: string): Promise<{
    content: string;
    signature?: string;
    rawOutput?: string;
    model?: string;
    chainId?: number;
  }> {
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
            content: EIGENAI_SYSTEM_MESSAGE,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    console.log("[EigenAI] Response:", response);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EigenAI API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as any;
    console.log(
      "[EigenAI] Full API response:",
      JSON.stringify(data, null, 2)
    );

    if (!data.signature) {
      console.warn("[EigenAI] ⚠️  Signature field missing from API response");
      console.warn("[EigenAI] Response keys:", Object.keys(data));
    }

    const rawOutput = data?.choices?.[0]?.message?.content || "";
    if (!rawOutput) {
      throw new Error("EigenAI response missing message content");
    }

    // Extract content from <|channel|>final<|message|> tag safely
    const finalChannelMatch =
      rawOutput &&
      rawOutput.match(
        /<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/
      );
    const extractedContent = finalChannelMatch
      ? finalChannelMatch[1].trim()
      : rawOutput;

    return {
      content: extractedContent,
      signature: data.signature,
      rawOutput: rawOutput,
      model: data.model,
      chainId: data.chain_id || 1, // Use chain_id from response, fallback to 1
    };
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    response: string,
    originalTweet: string
  ): ClassificationResult {
    try {
      // Strip <think> tags if present
      let cleanResponse = response.replace(/<\/?think>/g, "").trim();
      
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn("[LLM Classifier] No JSON found in response, treating as low confidence signal");
        
        // Fallback: Default to low confidence since response was incomplete
        const tokenMatch = originalTweet.match(/\$([A-Z]{2,6})\b/i);
        const token = tokenMatch ? tokenMatch[1].toUpperCase() : null;
        
        return {
          isSignalCandidate: false,
          extractedTokens: token ? [token] : [],
          sentiment: "neutral",
          confidence: 0.1, // Very low confidence for unparseable responses
          reasoning: "LLM response incomplete or invalid (likely hit token limit). Defaulting to low confidence for safety.",
        };
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
    if (provider === "eigenai") {
      const apiKey = process.env.EIGENAI_API_KEY;
      if (!apiKey) return null;
      console.log("[LLM Classifier] Using EigenAI");
      return new LLMTweetClassifier({
        provider: "eigenai",
        apiKey,
        model: process.env.EIGENAI_MODEL || "qwen3-32b-128k-bf16",
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

  const fallbackOrder: LLMProvider[] = ["eigenai", "openai"];
  for (const provider of fallbackOrder) {
    const instance = instantiate(provider);
    if (instance) {
      return instance;
    }
  }

  console.warn(
    "[LLM Classifier] No API key found. Set EIGENAI_API_KEY or OPENAI_API_KEY environment variable."
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
    // No API key - throw error so message stays NULL
    const error = new Error("No LLM API key configured");
    console.error(
      "[LLM Classifier] ❌ NO LLM API KEY - Message will stay NULL!"
    );
    console.error("   Set EIGENAI_API_KEY or OPENAI_API_KEY");
    throw error;
  }

  return classifier.classifyTweet(tweetText);
}
