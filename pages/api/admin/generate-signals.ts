import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createSignalGenerator } from '../../../lib/signal-generator';

const prisma = new PrismaClient();

/**
 * Admin endpoint to generate trading signals from classified tweets
 * POST /api/admin/generate-signals
 * 
 * Flow:
 * 1. Find signal candidate tweets (isSignalCandidate: true)
 * 2. For each tweet+token combination:
 *    - Find agents subscribed to that CT account
 *    - Get market indicators for the token
 *    - Use LLM to generate comprehensive signal
 *    - Create signal in database
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tokenSymbol, ctPostId } = req.query;

    // Get signal candidate tweets from ACTIVE accounts only
    const where: any = {
      // isSignalCandidate: true,
      ctAccount: {
        isActive: true,
      },
    };

    if (ctPostId) {
      where.id = ctPostId as string;
    }

    const signalCandidates = await prisma.ctPost.findMany({
      where,
      include: {
        ctAccount: true,
      },
      orderBy: {
        tweetCreatedAt: 'desc',
      },
      take: 20, // Process up to 20 tweets at a time
    });

    console.log(`[GenerateSignals] Found ${signalCandidates.length} signal candidate tweets`);

    if (signalCandidates.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No signal candidates found',
        signalsCreated: 0,
      });
    }

    const signalGenerator = createSignalGenerator();
    const results = [];
    let signalsCreated = 0;
    let signalsSkipped = 0;
    let errors = 0;

    for (const post of signalCandidates) {
      // Get tokens from this tweet
      const tokens = post.extractedTokens.length > 0 
        ? post.extractedTokens 
        : ['BTC']; // Fallback to BTC

      for (const token of tokens) {
        try {
          // Filter by tokenSymbol if specified
          if (tokenSymbol && token !== tokenSymbol) {
            continue;
          }

          console.log(`[GenerateSignals] Processing ${token} from tweet: "${post.tweetText.substring(0, 60)}..."`);

          // Find agents subscribed to this CT account
          const agentLinks = await prisma.agentAccount.findMany({
            where: {
              ctAccountId: post.ctAccountId,
            },
            include: {
              agent: true,
            },
          });

          console.log(`[GenerateSignals] Found ${agentLinks.length} agents subscribed to @${post.ctAccount.xUsername}`);

          for (const link of agentLinks) {
            const agent = link.agent;

            // Skip non-PUBLIC agents
            if (agent.status !== 'PUBLIC') {
              console.log(`[GenerateSignals] Skipping ${agent.name} - status: ${agent.status}`);
              continue;
            }

            // Check venue availability for this token
            // For MULTI venue agents, check if token is available on ANY enabled venue
            let venueStatus: any;
            
            if (agent.venue === 'MULTI') {
              // Check if token is available on Hyperliquid OR Ostium
              const multiVenueStatuses = await prisma.venues_status.findMany({
                where: {
                  token_symbol: token,
                  venue: { in: ['HYPERLIQUID', 'OSTIUM'] },
                },
              });
              
              if (multiVenueStatuses.length === 0) {
                console.log(`[GenerateSignals] ${token} not available on any venue (MULTI agent)`);
                signalsSkipped++;
                continue;
              }
              
              venueStatus = multiVenueStatuses[0]; // Use first available venue
              console.log(`[GenerateSignals] ${token} available on ${multiVenueStatuses.map(v => v.venue).join(', ')} (MULTI agent)`);
            } else {
              // Single venue agent
              venueStatus = await prisma.venues_status.findUnique({
                where: {
                  venue_token_symbol: {
                    venue: agent.venue,
                    token_symbol: token,
                  },
                },
              });

              if (!venueStatus) {
                console.log(`[GenerateSignals] ${token} not available on ${agent.venue}`);
                signalsSkipped++;
                continue;
              }
            }

            // Check for duplicate signal (same agent, token, recent time)
            const recentSignal = await prisma.signal.findFirst({
              where: {
                agentId: agent.id,
                tokenSymbol: token,
                createdAt: {
                  gte: new Date(Date.now() - 6 * 60 * 60 * 1000), // Within last 6 hours
                },
              },
            });

            if (recentSignal) {
              console.log(`[GenerateSignals] Recent signal exists for ${agent.name} - ${token}`);
              signalsSkipped++;
              continue;
            }

            // Get market indicators for this token
            const latestIndicators = await prisma.marketIndicators6h.findFirst({
              where: {
                tokenSymbol: token,
              },
              orderBy: {
                windowStart: 'desc',
              },
            });

            const indicators = latestIndicators?.indicators as any;

            // Determine tweet sentiment from classification
            // For now, we'll infer from tweet text, but ideally this should be stored during classification
            const tweetLower = post.tweetText.toLowerCase();
            const sentiment: 'bullish' | 'bearish' | 'neutral' = 
              tweetLower.includes('short') || tweetLower.includes('dump') || tweetLower.includes('bearish') ? 'bearish' :
              tweetLower.includes('long') || tweetLower.includes('moon') || tweetLower.includes('bullish') || tweetLower.includes('buy') ? 'bullish' :
              'neutral';

            console.log(`[GenerateSignals] Generating LLM signal for ${agent.name} (${agent.venue})`);

            // For MULTI venue agents, default to HYPERLIQUID (Agent Where will route dynamically)
            const signalVenue = agent.venue === 'MULTI' ? 'HYPERLIQUID' : agent.venue;

            // Generate signal using LLM
            const tradingSignal = await signalGenerator.generateSignal({
              tweetText: post.tweetText,
              tweetSentiment: sentiment,
              tweetConfidence: 0.7, // Default confidence
              tokenSymbol: token,
              venue: signalVenue,
              marketIndicators: indicators ? {
                rsi: indicators.rsi,
                macd: indicators.macd,
                movingAverages: indicators.ma,
                priceChange24h: indicators.priceChange24h,
                currentPrice: indicators.price,
              } : undefined,
              ctAccountImpactFactor: post.ctAccount.impactFactor,
            });

            console.log(`[GenerateSignals] LLM Signal: ${tradingSignal.side} with ${(tradingSignal.confidence * 100).toFixed(0)}% confidence`);
            console.log(`[GenerateSignals] Risk: ${tradingSignal.riskLevel}, Leverage: ${tradingSignal.leverage || 'N/A'}`);
            console.log(`[GenerateSignals] Reasoning: ${tradingSignal.reasoning}`);

            // Create signal in database
            const signal = await prisma.signal.create({
              data: {
                agentId: agent.id,
                tokenSymbol: token,
                venue: signalVenue, // MULTI agents → HYPERLIQUID (Agent Where will re-route if needed)
                side: tradingSignal.side,
                sizeModel: {
                  type: 'balance-percentage',
                  value: 5, // 5% of balance
                  impactFactor: post.ctAccount.impactFactor,
                  confidence: tradingSignal.confidence,
                  leverage: tradingSignal.leverage,
                },
                riskModel: {
                  stopLoss: tradingSignal.stopLoss,
                  takeProfit: tradingSignal.takeProfit,
                  riskLevel: tradingSignal.riskLevel,
                  entryPrice: tradingSignal.entryPrice,
                },
                sourceTweets: [post.tweetId],
              },
            });

            signalsCreated++;

            results.push({
              signalId: signal.id,
              agent: agent.name,
              token,
              venue: agent.venue,
              side: tradingSignal.side,
              confidence: tradingSignal.confidence,
              leverage: tradingSignal.leverage,
              reasoning: tradingSignal.reasoning,
              tweet: post.tweetText.substring(0, 100),
            });

            console.log(`[GenerateSignals] ✅ Created signal for ${agent.name} - ${token} ${tradingSignal.side}`);
          }
        } catch (error: any) {
          console.error(`[GenerateSignals] Error processing ${token}:`, error);
          errors++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      processed: signalCandidates.length,
      signalsCreated,
      signalsSkipped,
      errors,
      signals: results,
      message: `Generated ${signalsCreated} trading signals from ${signalCandidates.length} tweets`,
    });
  } catch (error: any) {
    console.error('[GenerateSignals] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate signals',
    });
  }
}
