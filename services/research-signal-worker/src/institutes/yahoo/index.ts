/**
 * Yahoo Finance Institute
 *
 * Handles signal generation using Yahoo Finance market data
 * Focuses on technical indicators (price movements, volume, trends)
 */

import { PrismaClient } from "@prisma/client";
import {
  AgentWithVenue,
  InstituteHandler,
  InstituteRunContext,
  InstituteRunResult,
} from "../types";

// Local imports from this institute
import {
  analyzeTokenSignal,
  canUseYahooFinance,
} from "./yahoo-finance-wrapper";

const INSTITUTE_NAME = "Yahoo Finance";

export class YahooFinanceInstitute implements InstituteHandler {
  instituteId = "yahoo-finance";
  instituteName = INSTITUTE_NAME;

  isConfigured(): boolean {
    return canUseYahooFinance();
  }

  async ensureInstitute(prisma: PrismaClient) {
    let institute = await prisma.research_institutes.findFirst({
      where: { name: INSTITUTE_NAME },
    });

    if (!institute) {
      institute = await prisma.research_institutes.create({
        data: {
          name: INSTITUTE_NAME,
          description:
            "Automated signals generated from Yahoo Finance market data analysis",
          website_url: "https://finance.yahoo.com",
          is_active: true,
        },
      });
    }

    this.instituteId = institute.id;
    return institute;
  }

  async run(input: {
    agents: AgentWithVenue[];
    institute: Awaited<ReturnType<YahooFinanceInstitute["ensureInstitute"]>>;
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

    const allMarkets = await prisma.venue_markets.findMany({
      where: { is_active: true },
      select: { token_symbol: true, venue: true },
    });

    const uniqueTokens = Array.from(
      new Set(allMarkets.map((m: any) => m.token_symbol as string))
    ) as string[];

    const venueMarkets = uniqueTokens.map((token) => ({
      token_symbol: token,
      venue:
        allMarkets.find((m: any) => m.token_symbol === token)?.venue ||
        "HYPERLIQUID",
    }));

    if (venueMarkets.length === 0) {
      return {
        instituteId: this.instituteId,
        instituteName: this.instituteName,
        signalsCreated: 0,
        details: "No active tokens found in venue_markets",
      };
    }

    let signalsGenerated = 0;
    let researchSignalsCreated = 0;
    let errors = 0;

    for (const market of venueMarkets) {
      try {
        const token = market.token_symbol as string;
        const analysis = await analyzeTokenSignal(token);

        if (!analysis || !analysis.side) {
          continue;
        }

        const researchSignal = await prisma.research_signals.create({
          data: {
            institute_id: institute.id,
            signal_text: analysis.reasoning,
            extracted_tokens: [token],
            signal_type: analysis.side,
            is_signal_candidate: true,
            confidence_score: analysis.confidence ?? null,
            processed_for_signals: false,
          } as any,
        });
        researchSignalsCreated++;

        for (const agent of agents) {
          try {
            const tokenAvailable = await prisma.venue_markets.findFirst({
              where: {
                token_symbol: token,
                venue: agent.venue,
                is_active: true,
              },
            });

            if (!tokenAvailable) {
              continue;
            }

            const positionSizePercent = Math.min(10, analysis.confidence * 10);

            try {
              await prisma.signals.create({
                data: {
                  agent_id: agent.id,
                  token_symbol: token,
                  venue: agent.venue,
                  side: analysis.side,
                  size_model: {
                    type: "balance-percentage",
                    value: positionSizePercent,
                    source: "yahoo-finance",
                  },
                  risk_model: {},
                  source_tweets: [],
                  lunarcrush_score: null,
                  lunarcrush_reasoning: analysis.reasoning,
                  lunarcrush_breakdown: {
                    source: "yahoo-finance",
                    confidence: analysis.confidence,
                    priceChange: analysis.priceChange,
                    volumeChange: analysis.volumeChange,
                    technicalIndicators: analysis.technicalIndicators,
                  },
                },
              });
              signalsGenerated++;
            } catch (createError: any) {
              if (createError.code !== "P2002") {
                throw createError;
              }
            }
          } catch (agentError: any) {
            errors++;
            console.error(
              `[YahooFinance] Error creating signal for agent ${agent.name}:`,
              agentError.message
            );
          }
        }

        await prisma.research_signals.update({
          where: { id: researchSignal.id },
          data: { processed_for_signals: true },
        });
      } catch (error: any) {
        errors++;
        console.error(`[YahooFinance] Error:`, error.message);
      }
    }

    return {
      instituteId: this.instituteId,
      instituteName: this.instituteName,
      signalsCreated: researchSignalsCreated,
      processedAssets: venueMarkets.length,
      errors,
      details: `Trading signals: ${signalsGenerated}, research signals: ${researchSignalsCreated}`,
    };
  }
}

// Export utilities from this institute for external use if needed
export {
  analyzeTokenSignal,
  canUseYahooFinance,
} from "./yahoo-finance-wrapper";
