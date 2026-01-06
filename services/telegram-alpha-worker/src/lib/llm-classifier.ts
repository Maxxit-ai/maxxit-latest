/**
 * LLM-based Tweet Classification Service
 * Supports EigenAI and OpenAI APIs
 */

import { prisma } from '@maxxit/database';

// Cache age limit: 24 hours (in milliseconds)
const CACHE_AGE_LIMIT_MS = 24 * 60 * 60 * 1000;

interface ClassificationResult {
  isSignalCandidate: boolean;
  extractedTokens: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number; // 0-1
  reasoning?: string;
  tokenPrice?: number | null; // Spot price from LunarCrush (USD)
  timelineWindow?: string | null; // Parsed time window / deadline for the signal
  takeProfit?: number | null; // Take profit target extracted from signal (as percentage, e.g., 20 for 20%)
  stopLoss?: number | null; // Stop loss target extracted from signal (as percentage, e.g., -10 for -10%)
  signature?: string; // EigenAI response signature for verification
  rawOutput?: string; // Full raw output from LLM API (for EigenAI signature verification)
  model?: string; // Model used (for EigenAI signature verification)
  chainId?: number; // Chain ID (for EigenAI signature verification)
  marketContext?: string; // Market context used in the prompt (for signature verification)
  fullPrompt?: string; // Full prompt (system + user) sent to LLM (for signature verification)
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
   * Classify a tweet for a specific token
   * Evaluates if the message is a trading signal FOR THIS SPECIFIC TOKEN
   */
  async classifyTweetForToken(
    tweetText: string,
    tokenSymbol: string,
    userImpactFactor: number = 50
  ): Promise<ClassificationResult> {
    console.log(`[LLMClassifier] Classifying for token: ${tokenSymbol}`);

    // Fetch market data for THIS specific token
    const marketData = await this.fetchLunarCrushData(tokenSymbol);

    console.log(
      `[LLMClassifier] Fetched market data for ${tokenSymbol}:`,
      marketData ? "YES" : "NO"
    );

    // Build token-specific prompt
    const { prompt, marketContext } = this.buildPromptForSpecificToken(
      tweetText,
      tokenSymbol,
      marketData,
      userImpactFactor
    );

    // Build full prompt for signature verification (system + user message)
    const SYSTEM_MESSAGE = "You are a crypto trading signal analyst. Output ONLY valid JSON. No explanations, no reasoning text outside JSON, ONLY the JSON object. Start with { and end with }.";
    const fullPrompt = SYSTEM_MESSAGE + prompt;

    // Try primary provider first
    try {
      const result = await this.attemptClassification(
        prompt,
        tweetText,
        this.provider
      );
      result.marketContext = marketContext;
      result.fullPrompt = fullPrompt;
      result.tokenPrice =
        typeof marketData?.price === "number" ? marketData.price : null;     
      // Override extracted tokens to ensure only this token
      result.extractedTokens = result.isSignalCandidate ? [tokenSymbol] : [];
      
      return result;
    } catch (primaryError: any) {
      // If EigenAI fails, automatically fallback to OpenAI
      if (this.provider === "eigenai") {
        const openAIKey = process.env.OPENAI_API_KEY;
        if (openAIKey) {
          console.warn(
            "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
          );
          console.warn(`⚠️  EigenAI failed for ${tokenSymbol}, falling back to OpenAI`);
          console.warn(
            `   EigenAI Error: ${primaryError.message}`
          );
          console.warn(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
          );

          try {
            const result = await this.attemptClassification(
              prompt,
              tweetText,
              "openai"
            );
            result.marketContext = marketContext;
            result.fullPrompt = fullPrompt;
            result.tokenPrice =
              typeof marketData?.price === "number" ? marketData.price : null;
            result.extractedTokens = result.isSignalCandidate ? [tokenSymbol] : [];
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
   * Classify a tweet and extract trading signals for ALL tokens mentioned
   * Returns array of classifications (one per token)
   */
  async classifyTweet(tweetText: string, userImpactFactor: number = 50): Promise<ClassificationResult[]> {
    // Step 1: Regex/keyword extraction (fast path)
    const seedTokens = this.extractAllTokenSymbols(tweetText);
    console.log(`[LLMClassifier] Extracted ${seedTokens.length} token(s) via regex:`, seedTokens);

    // Step 2: LLM fallback to catch missed tokens and filter out comparison-only mentions
    let llmTokens: string[] = [];
    try {
      llmTokens = await this.extractTokensWithLLM(tweetText, seedTokens);
      console.log(`[LLMClassifier] Extracted ${llmTokens.length} token(s) via LLM filter:`, llmTokens);
    } catch (error: any) {
      console.error("[LLMClassifier] LLM token extraction failed, using regex tokens only:", error.message);
    }
    // LLM has already excluded comparison-only tokens
    const tokens = llmTokens.length > 0 
      ? llmTokens.slice(0, 5)  // Use LLM-filtered tokens only
      : seedTokens.slice(0, 5); // Fallback to regex tokens if LLM fails

    console.log(`[LLMClassifier] Final tokens to classify:`, tokens);

    if (tokens.length === 0) {
      // Not a signal - no actionable tokens found
      console.log("[LLMClassifier] No actionable tokens found, not a signal");
      return [{
        isSignalCandidate: false,
        extractedTokens: [],
        sentiment: "neutral",
        confidence: 0,
      }];
    }

    // Classify each token separately with its own market data
    const results: ClassificationResult[] = [];

    for (const token of tokens) {
      try {
        const classification = await this.classifyTweetForToken(
          tweetText,
          token,
          userImpactFactor
        );
        results.push(classification);
        
        console.log(
          `[LLMClassifier] ${token}: ${classification.isSignalCandidate ? 'SIGNAL' : 'NOT SIGNAL'} ` +
          `(${classification.sentiment}, confidence: ${(classification.confidence * 100).toFixed(0)}%)`
        );
      } catch (error: any) {
        console.error(`[LLMClassifier] Failed to classify for token ${token}:`, error.message);
        // Continue with other tokens - don't let one failure stop all
      }
    }

    return results;
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
   * Extract ALL token symbols from tweet text (returns array of unique tokens)
   * 1) $TOKEN regex
   * 2) Extended known token list (if no $ hits)
   * 3) Shortword heuristic (fallback)
   */
  private extractAllTokenSymbols(tweetText: string): string[] {
    const tokens = new Set<string>();
    if (!tweetText) return [];
  
    const text = tweetText.toUpperCase();
  
    // Step 1: $TOKEN mentions (highest priority)
    const dollarMatches = text.matchAll(/\$([A-Z]{2,6})\b/g);
    for (const match of dollarMatches) {
      tokens.add(match[1]);
    }
  
    // Step 2: Known tokens (only if no $TOKEN found)
    if (tokens.size === 0) {
      const knownTokens =
        /\b(BTC|ETH|SOL|USDT|USDC|BNB|XRP|ADA|DOGE|AVAX|MATIC|DOT|LINK|UNI|ATOM|LTC|BCH|XLM|ALGO|VET|FIL|TRX|ETC|AAVE|MKR|THETA|XTZ|RUNE|NEAR|FTM|SAND|MANA|AXS|GALA|ENJ|CHZ|APE|LDO|ARB|OP|INJ|GMX|IMX|WLD|SEI|TIA|PEPE|SHIB|HBAR|EGLD|ICP|XMR|DASH|ZEC|SNX|CRV|COMP|YFI|SUSHI|1INCH|RPL|ENS|BLUR|KAVA|KSM|ROSE|HNT|FLOW|CFX|STX|ORDI|JTO|PYTH|AERO|JUP|WIF|DOGS)\b/g;
  
      for (const match of text.matchAll(knownTokens)) {
        tokens.add(match[1]);
      }
    }
  
    // Step 3: Fallback – uppercase short words (only if still empty)
    if (tokens.size === 0) {
      const stopWords =
        /\b(THE|AND|FOR|NOT|BUT|ARE|WAS|CAN|ALL|HAS|HAD|ITS|ONE|TWO|NEW|NOW|WAY|MAY|DAY|GET|GOT|SEE|SAY|USE|HER|HIS|HOW|MAN|OLD|TOO|ANY|SAME|BEEN|FROM|THEY|KNOW|WANT|MORE|SOME|TIME|VERY|WHEN|YOUR|MAKE|THAN|INTO|YEAR|GOOD|TAKE|COME|WORK|ALSO|BACK|CALL|GIVE|MOST|OVER|THINK|WELL|EVEN|FIND|TELL|FEEL|HELP|HIGH|KEEP|LAST|LIFE|LONG|MEAN|MOVE|MUCH|NAME|NEED|OPEN|PART|PLAY|READ|REAL|SEEM|SHOW|SIDE|SUCH|SURE|TALK|THAT|THIS|TURN|WAIT|WALK|WEEK|WHAT|WITH|WORD|WOULD|WRITE|ABOUT|AFTER|AGAIN|COULD|EVERY|FIRST|FOUND|GREAT|HOUSE|LARGE|LATER|LEARN|LEAVE|MIGHT|NEVER|OTHER|PLACE|POINT|RIGHT|SMALL|SOUND|STILL|STUDY|THEIR|THERE|THESE|THING|THREE|UNDER|UNTIL|WATCH|WHERE|WHICH|WHILE|WORLD|YOUNG|CRYPTO|COINS|TOKEN|MARKET|PRICE|CHART|TRADE|LOOKING|THINKING|BUYING|SELLING)\b/i;
  
      const shortWords = text.match(/\b[A-Z]{2,5}\b/g) || [];
      for (const word of shortWords) {
        if (!stopWords.test(word)) {
          tokens.add(word);
        }
      }
    }
  
    // Limit to max 5 tokens per signal
    return Array.from(tokens).slice(0, 5);
  }

  /**
   * LLM fallback to extract up to 5 actionable tokens
   * - Captures tokens missed by regex
   * - Filters out comparison-only mentions
   */
  private async extractTokensWithLLM(
    tweetText: string,
    seedTokens: string[]
  ): Promise<string[]> {
    const SYSTEM = "You are a precise crypto token extractor. Output ONLY valid JSON.";
    const prompt = `${SYSTEM}

Goal: Return up to 5 TOKEN SYMBOLS (uppercase, no $) that have CLEAR trading insights in the message.
Rules (must obey all):
- For EVERY seed token: keep it ONLY if the message gives explicit, actionable trading insight for that token (direction, bias, momentum, setup, TP/SL, or clear strength/weakness). If seed token is only comparison/background, EXCLUDE it.
- You MAY add new tokens not in seeds if the message provides clear trading insight for them.
- EXCLUDE tokens that are just comparisons/context (e.g., "$BTC drops but $ETH is strong" => keep ETH, drop BTC).
- Prefer precision over recall (better to miss than add noise).
- Output at most 5 symbols.

Message:
"${tweetText}"

Seed symbols seen: ${seedTokens.join(", ") || "NONE"}

Return JSON (example format only, use actual tokens from the message):
{ "tokens": ["ETH","SOL"] }`;

    // Helper to call provider and parse tokens
    const tryProvider = async (provider: LLMProvider): Promise<string[]> => {
      const response = provider === "openai"
        ? await this.callOpenAI(prompt)
        : await this.callEigenAI(prompt);

      const content = response.content.trim();
      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.tokens)) {
          return parsed.tokens
            .map((t: string) => (t || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, ""))
            .filter((t: string) => t.length >= 2 && t.length <= 6)
            .slice(0, 5);
        }
      } catch (err) {
        console.error("[LLMClassifier] Failed to parse token JSON:", content);
      }
      return [];
    };

    // Try primary provider
    try {
      const primaryTokens = await tryProvider(this.provider);
      if (primaryTokens.length > 0) return primaryTokens;
    } catch (err: any) {
      console.warn("[LLMClassifier] Primary provider token extraction failed:", err.message);
    }

    // Fallback to OpenAI if primary is EigenAI and OpenAI key is present
    if (this.provider === "eigenai" && process.env.OPENAI_API_KEY) {
      try {
        const fallbackTokens = await tryProvider("openai");
        if (fallbackTokens.length > 0) return fallbackTokens;
      } catch (err: any) {
        console.warn("[LLMClassifier] Fallback OpenAI token extraction failed:", err.message);
      }
    }

    return [];
  }

  /**
   * Fetch cached LunarCrush market data from database (ostium_available_pairs table)
   */
  private async getCachedLunarCrushData(symbolHint: string): Promise<any | null> {
    try {
      const upperHint = symbolHint.toUpperCase();
      // Find pair by symbol prefix (e.g., "BTC" matches "BTC/USD")
      const cachedData = await prisma.ostium_available_pairs.findFirst({
        where: {
          symbol: {
            startsWith: upperHint,
          },
        },
      });

      if (!cachedData) {
        console.log(`[LLMClassifier] No cached data for ${upperHint}`);
        return null;
      }

      // Check if cache is fresh (less than 24 hours old)
      const ageMs = Date.now() - cachedData.updated_at.getTime();
      if (ageMs > CACHE_AGE_LIMIT_MS) {
        console.log(
          `[LLMClassifier] Cache expired for ${upperHint} (${(ageMs / 1000 / 60 / 60).toFixed(1)}h old)`
        );
        return null;
      }

      console.log(`[LLMClassifier] ✅ Using cached data for ${upperHint} (${(ageMs / 1000 / 60).toFixed(0)}m old)`);

      return {
        symbol: cachedData.symbol,
        name: cachedData.symbol,
        price: cachedData.price ? Number(cachedData.price) : null,
        market_cap: cachedData.market_cap ? Number(cachedData.market_cap) : null,
        percent_change_24h: cachedData.percent_change_24h,
        percent_change_7d: null, // Not stored in ostium_available_pairs
        percent_change_30d: null, // Not stored in ostium_available_pairs
        volume_24h: cachedData.volume_24h ? Number(cachedData.volume_24h) : null,
        galaxy_score: cachedData.galaxy_score,
        alt_rank: cachedData.alt_rank,
        volatility: cachedData.volatility,
        market_cap_rank: cachedData.market_cap_rank,
      };
    } catch (error) {
      console.error(
        `[LLMClassifier] Error fetching cached LunarCrush data for ${symbolHint}:`,
        error
      );
      return null;
    }
  }

  /**
   * Fetch LunarCrush market data for a token symbol
   * FIRST checks cache, then falls back to API
   */
  private async fetchLunarCrushData(symbolHint: string): Promise<any | null> {
    // First, try to get cached data from database
    const cachedData = await this.getCachedLunarCrushData(symbolHint);
    if (cachedData) {
      return cachedData;
    }

    // If no cache or cache expired, call API
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
   * Build token-specific prompt with market data for EigenAI
   * CRITICAL: Asks if message is a trading signal FOR THIS SPECIFIC TOKEN
   */
  private buildPromptForSpecificToken(
    tweetText: string,
    tokenSymbol: string,
    marketData: any | null,
    userImpactFactor: number = 50
  ): { prompt: string; marketContext: string } {
    let marketContext = 'NO MARKET DATA';

    if (marketData) {
      console.log(`[LLMClassifier] Market data for ${tokenSymbol}:`, JSON.stringify(marketData, null, 2));

      const pct24h = marketData.percent_change_24h ?? 0;
      const pct7d = marketData.percent_change_7d ?? 0;
      const pct30d = marketData.percent_change_30d ?? 0;
      const vol = marketData.volume_24h ?? 0;
      const volM = (vol / 1e6).toFixed(1);

      marketContext = `${marketData.symbol}: $${marketData.price?.toFixed(2)}, MCap=$${(marketData.market_cap / 1e9).toFixed(1)}B
  24h=${pct24h.toFixed(2)}% | 7d=${pct7d.toFixed(2)}% | 30d=${pct30d.toFixed(2)}% | Vol=${volM}M
  Galaxy=${marketData.galaxy_score} | Rank=${marketData.alt_rank} | Vol=${marketData.volatility?.toFixed(4)}`;
    }
  
  const prompt = `Elite crypto risk analyst. ${tokenSymbol} was PRE-SELECTED as having trading insight.

  MESSAGE: "${tweetText}"
  TARGET TOKEN: ${tokenSymbol}
  ${tokenSymbol} MARKET DATA: ${marketContext}
  SENDER IMPACT FACTOR: ${userImpactFactor.toFixed(1)}/100 (Scale: 0=worst, 50=neutral, 100=best)

  TASK:
  Provide trading analysis for ${tokenSymbol}. Since ${tokenSymbol} was PRE-SELECTED, it HAS trading insight.
  **Always set isSignalCandidate=true** and derive direction/confidence from the message context.

  IMPACT FACTOR GUIDANCE:
  - Impact Factor: Historical performance of signal sender (0-100)
  - Neutral=50: NO info - proceed normally without favor/penalty
  - Excellent(>80): Strongly favor, boost confidence significantly (exceptional historical success)
  - High(60-80): Weight historical success, moderately boost confidence
  - Low(20-40): More skeptical, require stronger signal evidence for high confidence
  - Very Poor(<20): Highly skeptical, require extremely strong signal evidence for any confidence

  DATA MEANING:
  - Price/MCap: Size & liquidity (larger=safer exits)
  - 24h/7d/30d%: Momentum (consistent=stronger, mixed=uncertain)
  - Vol: Liquidity (>50M good, <10M risky, 0=red flag)
  - GalaxyScore: Strength 0-100 (>70 strong, 50-70 moderate, <50 weak)
  - AltRank: Performance (1-100 excellent, 100-500 avg, >500 weak)
  - Volatility: Stability (<0.02 stable, 0.02-0.05 normal, >0.05 risky)
  
  DIRECTION DERIVATION:
  - Explicit: "buy","long","enter","target X" → use stated direction
  - Implicit strength: "best performing","strongest","momentum building","accumulation" → BULLISH
  - Implicit weakness: "worst performing","weakest","losing momentum","distribution" → BEARISH
  - Neutral mention: no clear strength/weakness → NEUTRAL (low confidence)

  ANALYSIS FOR ${tokenSymbol}:
  1. Extract trading direction (bullish/bearish) - explicit OR implicit
  2. Check ${tokenSymbol} market alignment with signal direction
  3. Risk penalties: vol<10M, volatility>0.05, rank>1000

  TP/SL EXTRACTION (${tokenSymbol} only):
  ⚠️ CRITICAL: Only extract if SPECIFICALLY for ${tokenSymbol}
  - If msg says "BTC target $100k in 1mo, SOL is strong" → SOL gets NULL (target is for BTC not SOL)
  - Absolute prices (e.g. "target $100","stop at $80"): CONVERT TO % using current price from market data
  - Formula: % = ((target_price - current_price) / current_price) * 100
  - Examples: current=$100, target=$120 → "20%"; current=$100, stop=$85 → "-15%"
  - User provides % (e.g. "TP at 20%","SL at -5%"): use directly
  - TP: "target $X","TP at X%","take profit X" → extract ONLY if for ${tokenSymbol}
  - SL: "stop loss X","SL at X%","cut at X" → extract ONLY if for ${tokenSymbol}
  - Not mentioned FOR ${tokenSymbol}: set null
  
  TIMELINE EXTRACTION (for ${tokenSymbol} only):
  ⚠️  CRITICAL: Only extract if SPECIFICALLY mentioned for ${tokenSymbol}
  • If message says "BTC to $100k in 1 month, SOL is best" → SOL gets NULL (timeline is for BTC, not SOL)
  • If a deadline is implied FOR ${tokenSymbol} (e.g., "SOL by next week", "${tokenSymbol} this week"), return concrete date in DD-MM-YYYY (UTC)
  • If no clear deadline FOR ${tokenSymbol}, set timelineWindow to null
  
  CONFIDENCE BANDS FOR ${tokenSymbol}:
  0.8-1.0: Explicit ${tokenSymbol} signal + aligned market + low risk + clear TP/SL/timeline
  0.6-0.8: Good ${tokenSymbol} signal (explicit direction OR strong implicit) + supportive data
  0.4-0.6: Decent ${tokenSymbol} signal (implicit strength/weakness indicator like "best performing")
  0.2-0.4: Weak ${tokenSymbol} signal OR contradicts market OR very limited context
  0.1-0.2: Minimal ${tokenSymbol} mention but pre-selected (use lowest confidence)
  
  CRITICAL RULES:
  • **isSignalCandidate ALWAYS = true** (token was pre-selected by extraction phase)
  • **extractedTokens ALWAYS = ["${tokenSymbol}"]** (never empty array)
  • Derive direction from explicit OR implicit context
  • Use confidence score to reflect signal quality (explicit = high, implicit = moderate, weak = low)
  • Conservative confidence scores (better to be cautious)
  
  JSON OUTPUT:
  {
    "isSignalCandidate": boolean,
    "extractedTokens": ["${tokenSymbol}"] or [],
    "sentiment": "bullish"|"bearish"|"neutral",
    "confidence": 0.XX,
    "takeProfit": number|string|null,
    "stopLoss": number|string|null,
    "reasoning": "${tokenSymbol} analysis: [explicit or implicit?]. Direction: [LONG/SHORT/NONE]. Signal source: [clear statement/strength indicator/weakness indicator]. Momentum: [24h/7d/30d]. Alignment: [supports/contradicts]. Risks: [vol/volatility/rank]. Confidence X.XX: [why].",
    "timelineWindow": string|null
  }
  
  Output ONLY valid JSON. Start { end }. NO text outside JSON.`;
  
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
      const isSignalCandidate =
        extractedTokens.length > 0
          ? true
          : Boolean(parsed.isSignalCandidate);

      // Parse takeProfit and stopLoss (can be number, string percentage, or null)
      const parseTPSL = (val: any): number | null => {
        if (val === null || val === undefined) return null;
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          const cleaned = val.trim();
          // Check if it's already a percentage (e.g., "20%" or "-15%")
          if (/^-?\d+(\.\d+)?%$/.test(cleaned)) {
            const num = parseFloat(cleaned.replace(/[%\s]/g, ""));
            return isNaN(num) ? null : num;
          }
          // Try to parse as number (absolute price)
          const num = parseFloat(cleaned.replace(/[$,]/g, ""));
          return isNaN(num) ? null : num;
        }
        return null;
      };

      return {
        isSignalCandidate,
        extractedTokens,
        sentiment: parsed.sentiment || "neutral",
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reasoning: parsed.reasoning || "",
        // Trust LLM to return DD-MM-YYYY or null per prompt
        timelineWindow:
          typeof parsed.timelineWindow === "string"
            ? parsed.timelineWindow
            : null,
        takeProfit: parseTPSL(parsed.takeProfit),
        stopLoss: parseTPSL(parsed.stopLoss),
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
 * Returns array of classifications (one per token)
 */
export async function classifyTweet(
  tweetText: string,
  userImpactFactor: number = 50
): Promise<ClassificationResult[]> {
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

  return classifier.classifyTweet(tweetText, userImpactFactor);
}
