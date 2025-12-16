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
  marketContext?: string; // Market context used in the prompt (for signature verification)
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
      this.model =
        config.provider === "openai" ? "gpt-4o-mini" : "gpt-oss-120b-f16";
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

    const { prompt, marketContext } = this.buildPromptWithMarketData(tweetText, marketData);

    // Try primary provider first
    try {
      const result = await this.attemptClassification(prompt, tweetText, this.provider);
      result.marketContext = marketContext;
      return result;
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
            const result = await this.attemptClassification(prompt, tweetText, "openai");
            result.marketContext = marketContext;
            return result;
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
    let marketContext = 'NO MARKET DATA AVAILABLE';

    if (marketData) {
      console.log('[LLMClassifier] Market data for prompt:', JSON.stringify(marketData, null, 2));

      const pct24h = marketData.percent_change_24h ?? 0;
      const pct7d = marketData.percent_change_7d ?? 0;
      const pct30d = marketData.percent_change_30d ?? 0;
      const vol = marketData.volume_24h ?? 0;
      const volM = (vol / 1e6).toFixed(1);

      marketContext = `
${marketData.symbol}: Price=$${marketData.price?.toFixed(2)}, MCap=$${(marketData.market_cap / 1e9).toFixed(1)}B
24h=${pct24h.toFixed(2)}% | 7d=${pct7d.toFixed(2)}% | 30d=${pct30d.toFixed(2)}% | Vol=${volM}M
GalaxyScore=${marketData.galaxy_score} | AltRank=${marketData.alt_rank} | Volatility=${marketData.volatility?.toFixed(4)}`;
    }

    const prompt = `Expert elite crypto risk analyst. PRIMARY GOAL: Protect users from losses while identifying real elite opportunities.

SIGNAL: "${tweetText}"
MARKET: ${marketContext}

DATA MEANING:
• Price/MCap: Size & liquidity (larger = safer exits)
• 24h/7d/30d %: Momentum (consistent = stronger, mixed = uncertain)
• Vol: Liquidity (>50M good, <10M risky, 0 = red flag)
• GalaxyScore: Strength 0-100 (>70 strong, 50-70 moderate, <50 weak)
• AltRank: Performance (1-100 excellent, 100-500 average, >500 weak)
• Volatility: Stability (<0.02 stable, 0.02-0.05 normal, >0.05 risky)

ANALYZE HOLISTICALLY:
1. Signal clarity (specific targets vs vague sentiment)
2. Market momentum alignment with signal direction
3. Risk factors (volatility, volume, contradictions)
4. Opportunity strength (galaxy score, alt rank, liquidity)

KEY SCENARIOS:
• BULLISH signal + positive momentum + vol>50M = STRONG (0.7-1.0)
• BULLISH signal + negative momentum = CONTRADICTION - reduce heavily (0.1-0.3)
• BEARISH signal + negative momentum + vol>50M = STRONG (0.7-1.0)
• BEARISH signal + positive momentum = CONTRADICTION - reduce heavily (0.1-0.3)
• Mixed momentum or low volume = MODERATE risk (0.3-0.6)
• High volatility >0.05 or AltRank >1000 = PENALIZE (reduce 15-30%)
• Zero/null data = CONSERVATIVE (max 0.4)

CONFIDENCE BANDS:
0.8-1.0: Exceptional (clear + aligned + low risk)
0.6-0.8: Strong (good signal + supportive market)
0.4-0.6: Moderate (decent OR mixed signals)
0.2-0.4: Weak (poor signal OR contradicts market)
0.0-0.2: Very High Risk (reject - will lose money)

LOSS PREVENTION RULES:
1. Market data > hype (momentum contradicts = low confidence)
2. Volume critical (low volume = trapped = danger)
3. Volatility kills (high = unpredictable = lower score)
4. Contradictions fatal (bullish tweet + bearish market = 0.1-0.3)
5. Conservative better (miss opportunity > cause loss)

JSON OUTPUT:
{
  "isSignalCandidate": boolean,
  "extractedTokens": ["SYMBOL"],
  "sentiment": "bullish"|"bearish"|"neutral",
  "confidence": 0.XX,
  "reasoning": "Direction: [LONG/SHORT] on TOKEN. Signal clarity: [clear/vague]. Market momentum: [24h/7d/30d analysis]. Alignment: [supports/contradicts signal]. Key risks: [volume/volatility/rank issues]. Strength factors: [galaxy/liquidity/stability]. Confidence X.XX: [why this protects user from losses]."
}

CRITICAL RULES:
• isSignalCandidate MUST be true if extractedTokens contains at least one token (regardless of market contradictions)
• isSignalCandidate is ONLY false if NO token can be extracted from the signal
• confidence score reflects risk/quality (contradictions = lower confidence, but isSignalCandidate still true if token found)
• If token extracted but market contradicts: isSignalCandidate=true, confidence=low (0.1-0.3)
• If token extracted and market aligns: isSignalCandidate=true, confidence=high (0.7-1.0)

CRITICAL: Output ONLY valid JSON. Start with { end with }. NO explanations outside JSON.`;

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
            content:
              "You are a crypto trading signal analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 3500,
        seed: 42,
        // response_format: { type: "json_object" },
      }),
    });


    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EigenAI API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as any;

    if (!data.signature) {
      console.warn("[EigenAI] ⚠️  Signature field missing from API response");
    }

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error("EigenAI API response missing 'choices' array");
    }

    if (!data.choices[0] || !data.choices[0].message) {
      throw new Error("EigenAI API response missing 'message' in choices[0]");
    }

    const message = data.choices[0].message;

    // Check if response contains tool_calls instead of content
    if (message.tool_calls && message.tool_calls.length > 0) {
      throw new Error(
        `EigenAI API returned tool_calls instead of content. The model tried to call function: ${message.tool_calls[0]?.function?.name || "unknown"}. This will trigger OpenAI fallback.`
      );
    }

    // Get content from message
    const rawOutput = message.content;

    if (!rawOutput || typeof rawOutput !== "string") {
      throw new Error(
        `EigenAI API response missing or invalid 'content' field. Got: ${typeof rawOutput}. Finish reason: ${data.choices[0].finish_reason}`
      );
    }

    console.log("[EigenAI] Raw message:", rawOutput);

    // Extract content - try multiple patterns:
    // 1. Content after <|end|> tag (for responses with thinking)
    // 2. Content from <|channel|>final<|message|> tag
    // 3. Fall back to raw output
    let extractedContent = rawOutput;
    
    // Try extracting JSON after <|end|> tag first (handles thinking/analysis output)
    const endTagMatch = rawOutput.match(/<\|end\|>\s*(\{[\s\S]*\})\s*$/);
    if (endTagMatch) {
      extractedContent = endTagMatch[1].trim();
    } else {
      // Try extracting from <|channel|>final<|message|> tag
      const finalChannelMatch = rawOutput.match(
        /<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/
      );
      if (finalChannelMatch) {
        extractedContent = finalChannelMatch[1].trim();
      } else {
        console.log("[EigenAI] Using raw output (no extraction patterns matched)");
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

  /**
   * Call OpenAI API
   * Returns content and metadata
   */
  private async callOpenAI(prompt: string): Promise<{
    content: string;
    signature?: string;
    rawOutput?: string;
    model?: string;
    chainId?: number;
  }> {
    const openAIKey = this.provider === "openai" ? this.apiKey : (process.env.OPENAI_API_KEY || this.apiKey);
    const openAIModel = this.provider === "openai" ? this.model : (process.env.OPENAI_MODEL || "gpt-4o-mini");

    const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIKey}`,
      },
      body: JSON.stringify({
        model: openAIModel,
        messages: [
          {
            role: "system",
            content:
              "You are a crypto trading signal analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as any;

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error("OpenAI API response missing 'choices' array");
    }

    if (!data.choices[0] || !data.choices[0].message) {
      throw new Error("OpenAI API response missing 'message' in choices[0]");
    }

    const rawOutput = data.choices[0].message.content;

    if (!rawOutput || typeof rawOutput !== "string") {
      throw new Error(
        `OpenAI API response missing or invalid 'content' field. Got: ${typeof rawOutput}`
      );
    }

    return {
      content: rawOutput,
      rawOutput: rawOutput,
      model: data.model,
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
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const extractedTokens = Array.isArray(parsed.extractedTokens)
        ? parsed.extractedTokens.map((t: string) => t.toUpperCase())
        : [];

      // CRITICAL: If tokens were extracted, isSignalCandidate MUST be true
      // (regardless of market contradictions - those affect confidence, not candidate status)
      const isSignalCandidate = extractedTokens.length > 0 
        ? true 
        : Boolean(parsed.isSignalCandidate);

      return {
        isSignalCandidate,
        extractedTokens,
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
