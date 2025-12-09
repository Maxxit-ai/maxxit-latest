/**
 * Hybrid Non-Crypto Institute
 *
 * Handles signal generation for non-crypto assets (stocks, indices, forex, commodities)
 * using Finnhub for quotes and MarketAux for news sentiment.
 */

import { PrismaClient } from "@prisma/client";
import { NormalizedAssetData, AssetType } from "../../providers/types";
import {
  createNewsSignalClassifier,
  SignalClassification,
} from "../../providers/llm-classifier";
import {
  AgentWithVenue,
  InstituteHandler,
  InstituteRunContext,
  InstituteRunResult,
} from "../types";

// Local imports from this institute
import { createHybridProvider } from "./hybrid-provider";
import { getAssetType, isSymbolSupported } from "./symbol-mapper";

const FINNHUB_INSTITUTE_ID = "39949239-a292-4c81-998e-d622405196a3";
const FINNHUB_INSTITUTE_NAME = "Finnhub Insights";

export class HybridNonCryptoInstitute implements InstituteHandler {
  instituteId = FINNHUB_INSTITUTE_ID;
  instituteName = FINNHUB_INSTITUTE_NAME;

  isConfigured(): boolean {
    const provider = createHybridProvider();
    const classifier = createNewsSignalClassifier();
    return provider.isAvailable() && Boolean(classifier);
  }

  async ensureInstitute(prisma: PrismaClient) {
    let institute = await prisma.research_institutes.findUnique({
      where: { id: FINNHUB_INSTITUTE_ID },
    });

    if (institute) return institute;

    institute = await prisma.research_institutes.findUnique({
      where: { name: FINNHUB_INSTITUTE_NAME },
    });
    if (institute) return institute;

    return prisma.research_institutes.create({
      data: {
        id: FINNHUB_INSTITUTE_ID,
        name: FINNHUB_INSTITUTE_NAME,
        description:
          "Analytics and market intelligence for non-crypto assets using Finnhub + MarketAux.",
        website_url: "https://finnhub.io/",
        x_handle: "Finnhub_io",
        is_active: true,
      },
    });
  }

  async run(input: {
    agents: AgentWithVenue[];
    institute: Awaited<ReturnType<HybridNonCryptoInstitute["ensureInstitute"]>>;
    context: InstituteRunContext;
  }): Promise<InstituteRunResult> {
    const { agents, institute, context } = input;
    const { prisma } = context;

    if (!institute || !institute.is_active) {
      return {
        instituteId: this.instituteId,
        instituteName: this.instituteName,
        signalsCreated: 0,
        details: "Institute inactive or missing",
      };
    }

    if (agents.length === 0) {
      return {
        instituteId: this.instituteId,
        instituteName: this.instituteName,
        signalsCreated: 0,
        details: "No agents subscribed to this institute",
      };
    }

    const provider = createHybridProvider();
    if (!provider.isAvailable()) {
      return {
        instituteId: this.instituteId,
        instituteName: this.instituteName,
        signalsCreated: 0,
        details: "Hybrid provider not configured (Finnhub/MarketAux missing)",
      };
    }

    const classifier = createNewsSignalClassifier();
    if (!classifier) {
      return {
        instituteId: this.instituteId,
        instituteName: this.instituteName,
        signalsCreated: 0,
        details: "LLM classifier not configured",
      };
    }

    const assets = await fetchNonCryptoAssets(prisma);
    if (assets.length === 0) {
      return {
        instituteId: this.instituteId,
        instituteName: this.instituteName,
        signalsCreated: 0,
        processedAssets: 0,
        details: "No supported non-crypto assets found",
      };
    }

    let processed = 0;
    let skipped = 0;
    let signals = 0;
    let errors = 0;

    for (const asset of assets) {
      try {
        const recentlyProcessed = await wasRecentlyProcessed(
          prisma,
          asset.symbol,
          institute.id
        );
        if (recentlyProcessed) {
          skipped++;
          continue;
        }

        const assetData = await provider.getAssetData(
          asset.symbol,
          asset.assetType
        );

        if (!assetData.quote && !assetData.news) {
          skipped++;
          continue;
        }

        const classification = await classifier.classifyAssetData(assetData);

        await storeResearchSignal(prisma, institute.id, asset.symbol, {
          classification,
          assetData,
        });

        if (classification.isSignalCandidate && classification.side) {
          signals++;
        }

        processed++;
      } catch (err: any) {
        errors++;
        console.error(
          `[HybridNonCrypto] Error processing ${asset.symbol}:`,
          err.message
        );
      }
    }

    return {
      instituteId: this.instituteId,
      instituteName: this.instituteName,
      signalsCreated: signals,
      processedAssets: processed,
      skipped,
      errors,
      details: `Processed ${processed} assets, skipped ${skipped}`,
    };
  }
}

async function fetchNonCryptoAssets(prisma: PrismaClient): Promise<
  Array<{
    symbol: string;
    marketName: string;
    group: string;
    assetType: AssetType;
  }>
> {
  const markets = await prisma.venue_markets.findMany({
    where: {
      venue: "OSTIUM",
      group: {
        in: ["indices", "forex", "commodities", "stocks"],
      },
    },
    select: {
      token_symbol: true,
      market_name: true,
      group: true,
      is_active: true,
    },
  });

  return markets
    .filter((m: any) => {
      const symbol = m.token_symbol as string;
      return isSymbolSupported(symbol);
    })
    .map((m: any) => ({
      symbol: m.token_symbol as string,
      marketName: m.market_name as string,
      group: m.group as string,
      assetType:
        getAssetType(m.token_symbol as string) || ("stocks" as AssetType),
    }));
}

async function wasRecentlyProcessed(
  prisma: PrismaClient,
  symbol: string,
  instituteId: string
): Promise<boolean> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const recentSignal = await prisma.research_signals.findFirst({
    where: {
      institute_id: instituteId,
      extracted_tokens: {
        has: symbol,
      },
      created_at: {
        gte: sixHoursAgo,
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });
  return recentSignal !== null;
}

async function storeResearchSignal(
  prisma: PrismaClient,
  instituteId: string,
  symbol: string,
  options: {
    classification: SignalClassification;
    assetData: NormalizedAssetData;
  }
): Promise<void> {
  const { classification, assetData } = options;
  const signalText = buildSignalText(symbol, classification, assetData);
  const sourceUrl = classification.sourceUrls[0] || null;

  await prisma.research_signals.create({
    data: {
      institute_id: instituteId,
      signal_text: signalText,
      source_url: sourceUrl,
      extracted_tokens: [symbol],
      signal_type: classification.side,
      is_signal_candidate: classification.isSignalCandidate,
      confidence_score: classification.confidence,
      processed_for_signals: false,
    } as any, // Cast because generated Prisma types may be stale locally
  });
}

function buildSignalText(
  symbol: string,
  classification: SignalClassification,
  assetData: NormalizedAssetData
): string {
  const parts: string[] = [];

  const actionableHeader =
    classification.isSignalCandidate && classification.side
      ? `[${symbol}] ${classification.side} SIGNAL`
      : `[${symbol}] NEUTRAL Signal (non-actionable)`;

  parts.push(actionableHeader);
  parts.push(`Sentiment: ${classification.sentiment.toUpperCase()}`);
  parts.push(`Data Source: ${assetData.provider}`);

  if (assetData.quote) {
    const changeStr =
      assetData.quote.changePercent >= 0
        ? `+${assetData.quote.changePercent.toFixed(2)}%`
        : `${assetData.quote.changePercent.toFixed(2)}%`;
    parts.push(`Price: ${assetData.quote.currentPrice} (${changeStr})`);
  }

  if (assetData.news) {
    parts.push(
      `News Sentiment: ${assetData.news.averageSentiment.toFixed(2)} (${
        assetData.news.articleCount
      } articles)`
    );
  }

  parts.push(`Analysis: ${classification.reasoning}`);

  if (classification.keyFactors.length > 0) {
    parts.push(`Key Factors: ${classification.keyFactors.join(", ")}`);
  }

  if (classification.newsHeadlines.length > 0) {
    parts.push(`Recent News:`);
    classification.newsHeadlines.slice(0, 3).forEach((headline, i) => {
      parts.push(`  ${i + 1}. ${headline}`);
    });
  }

  return parts.join("\n");
}

// Export additional utilities from this institute for external use if needed
export { createHybridProvider } from "./hybrid-provider";
export { getAssetType, isSymbolSupported } from "./symbol-mapper";
