/**
 * Research Signal Parser
 * Uses LLM to extract structured trading signals from research institute text
 */

export interface ResearchSignalInput {
  instituteId: string;
  instituteName: string;
  signalText: string;
  sourceUrl?: string;
}

export interface ParsedSignal {
  token: string | null;
  side: "LONG" | "SHORT" | null;
  leverage: number;
  isValid: boolean;
  reasoning: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

const SIGNAL_PARSER_PROMPT = `You are a professional trading signal parser. Your job is to extract structured data from research institute trading signals.

Extract the following from the signal text:
1. **Token**: The cryptocurrency symbol (e.g., BTC, ETH, SOL)
2. **Side**: Whether it's a LONG (buy) or SHORT (sell) signal
3. **Leverage**: Suggested leverage (1-10x). Default to 3x if not specified.
4. **Confidence**: Your confidence in this being a valid signal (HIGH/MEDIUM/LOW)

Rules:
- Only extract if the signal is CLEAR and ACTIONABLE
- Reject vague signals like "might go up" or "watch this"
- Token must be a valid crypto symbol
- Side must be explicitly LONG or SHORT
- Leverage between 1-10x
- If any critical field is missing/unclear, mark as INVALID

Return JSON format:
{
  "token": "BTC",
  "side": "LONG",
  "leverage": 3,
  "isValid": true,
  "reasoning": "Clear long signal with specific target",
  "confidence": "HIGH"
}`;

export async function parseResearchSignal(
  input: ResearchSignalInput
): Promise<ParsedSignal> {
  try {
    console.log(`[ResearchParser] Parsing signal from ${input.instituteName}`);
    console.log(
      `[ResearchParser] Text: "${input.signalText.substring(0, 100)}..."`
    );

    const providerPreference = (
      process.env.RESEARCH_LLM_PROVIDER ||
      process.env.LLM_PROVIDER ||
      ""
    ).toLowerCase();
    const eigenAIBaseUrl = (
      process.env.EIGENAI_BASE_URL || "https://eigenai.eigencloud.xyz/v1"
    ).replace(/\/$/, "");

    type ProviderConfig = {
      provider: "perplexity" | "eigenai";
      apiKey: string;
      model: string;
      url: string;
      headers: Record<string, string>;
    };

    const buildProviderConfig = (
      provider: "perplexity" | "eigenai"
    ): ProviderConfig | null => {
      if (provider === "perplexity") {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) return null;
        return {
          provider: "perplexity",
          apiKey,
          model: process.env.PERPLEXITY_MODEL || "sonar",
          url: "https://api.perplexity.ai/chat/completions",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        };
      }

      const eigenKey = process.env.EIGENAI_API_KEY;
      if (!eigenKey) return null;
      return {
        provider: "eigenai",
        apiKey: eigenKey,
        model: process.env.EIGENAI_MODEL || "gpt-oss-120b-f16",
        url: `${eigenAIBaseUrl}/chat/completions`,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": eigenKey,
        },
      };
    };

    const preferenceOrder = providerPreference ? [providerPreference] : [];
    const fallbackOrder: Array<"perplexity" | "eigenai"> = [
      "perplexity",
      "eigenai",
    ];
    let providerConfig: ProviderConfig | null = null;

    for (const providerName of [...preferenceOrder, ...fallbackOrder]) {
      if (providerConfig) break;
      if (providerName === "perplexity" || providerName === "eigenai") {
        providerConfig = buildProviderConfig(providerName);
      }
    }

    if (!providerConfig) {
      throw new Error(
        "No LLM API key found. Set PERPLEXITY_API_KEY or EIGENAI_API_KEY in the environment"
      );
    }

    console.log(
      `[ResearchParser] Using ${
        providerConfig.provider === "perplexity" ? "Perplexity AI" : "EigenAI"
      }`
    );

    const response = await fetch(providerConfig.url, {
      method: "POST",
      headers: providerConfig.headers,
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          {
            role: "system",
            content: SIGNAL_PARSER_PROMPT,
          },
          {
            role: "user",
            content: `Signal from ${input.instituteName}:

"${input.signalText}"

Extract trading signal data as JSON.`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `${
          providerConfig.provider === "perplexity" ? "Perplexity" : "EigenAI"
        } API error: ${response.status} ${errorText}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in Perplexity response");
    }

    // Parse LLM response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log("[ResearchParser] ❌ No JSON found in response");
      return {
        token: null,
        side: null,
        leverage: 3,
        isValid: false,
        reasoning: "Failed to parse LLM response",
        confidence: "LOW",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate parsed data
    const result: ParsedSignal = {
      token: parsed.token?.toUpperCase() || null,
      side: parsed.side?.toUpperCase() as "LONG" | "SHORT" | null,
      leverage: Math.min(10, Math.max(1, parsed.leverage || 3)),
      isValid: parsed.isValid === true,
      reasoning: parsed.reasoning || "",
      confidence: parsed.confidence || "MEDIUM",
    };

    // Additional validation
    if (result.isValid) {
      if (!result.token || result.token.length > 10) {
        result.isValid = false;
        result.reasoning = "Invalid token symbol";
      }
      if (!result.side || !["LONG", "SHORT"].includes(result.side)) {
        result.isValid = false;
        result.reasoning = "Invalid or missing side (LONG/SHORT)";
      }
    }

    console.log(`[ResearchParser] ✅ Result:`, {
      token: result.token,
      side: result.side,
      leverage: result.leverage,
      isValid: result.isValid,
      confidence: result.confidence,
    });

    return result;
  } catch (error: any) {
    console.error("[ResearchParser] ❌ Error:", error.message);
    return {
      token: null,
      side: null,
      leverage: 3,
      isValid: false,
      reasoning: `Parser error: ${error.message}`,
      confidence: "LOW",
    };
  }
}

/**
 * Batch parse multiple signals
 */
export async function parseResearchSignalsBatch(
  inputs: ResearchSignalInput[]
): Promise<ParsedSignal[]> {
  const results: ParsedSignal[] = [];

  for (const input of inputs) {
    const result = await parseResearchSignal(input);
    results.push(result);

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Test the parser with sample signals
 */
export async function testSignalParser() {
  const testSignals: ResearchSignalInput[] = [
    {
      instituteId: "test-1",
      instituteName: "Test Institute",
      signalText:
        "BTC LONG signal activated. Entry: $95,000. Target: $100,000. Stop: $93,000. Leverage: 3x",
    },
    {
      instituteId: "test-2",
      instituteName: "Test Institute",
      signalText:
        "Short ETH at current levels. High risk. Use 2x leverage max.",
    },
    {
      instituteId: "test-3",
      instituteName: "Test Institute",
      signalText:
        "SOL looking bullish but waiting for confirmation. Watch closely.",
    },
    {
      instituteId: "test-4",
      instituteName: "Test Institute",
      signalText: "DOGE might pump soon, just vibes",
    },
  ];

  console.log("\n🧪 Testing Research Signal Parser\n");
  console.log("=".repeat(60));

  for (const signal of testSignals) {
    console.log(`\nSignal: "${signal.signalText}"`);
    const result = await parseResearchSignal(signal);
    console.log("Result:", result);
    console.log("-".repeat(60));

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
