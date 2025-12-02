import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createSignalGenerator } from '../../../lib/signal-generator';
import { ProofVerificationService } from '../../../lib/proof-verification-service';

const prisma = new PrismaClient();

/**
 * Simple signal generation from CT account's signal candidate tweets
 * POST /api/admin/generate-signals-simple?ctAccountId=xxx
 * 
 * Flow:
 * 1. Get signal candidate tweets from specific CT account
 * 2. Find agents subscribed to that account
 * 3. Generate signal using LLM for each agent
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ctAccountId } = req.query;

    if (!ctAccountId) {
      return res.status(400).json({ error: 'ctAccountId is required' });
    }

    // Get signal candidate tweets from this CT account
    const signalTweets = await prisma.ctPost.findMany({
      where: {
        ctAccountId: ctAccountId as string,
        isSignalCandidate: true,
        extractedTokens: {
          isEmpty: false, // Only tweets with tokens
        },
      },
      include: {
        ctAccount: true,
      },
      orderBy: {
        tweetCreatedAt: 'desc',
      },
      take: 10, // Process last 10 signal tweets
    });

    console.log(`[GenerateSignals] Found ${signalTweets.length} signal tweets from CT account`);

    if (signalTweets.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No signal candidate tweets found with tokens',
        signalsCreated: 0,
      });
    }

    // Find agents subscribed to this CT account
    const agentLinks = await prisma.agentAccount.findMany({
      where: {
        ctAccountId: ctAccountId as string,
      },
      include: {
        agent: true,
      },
    });

    if (agentLinks.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No agents subscribed to this CT account',
        signalsCreated: 0,
      });
    }

    console.log(`[GenerateSignals] Found ${agentLinks.length} agents subscribed`);

    const signalGenerator = createSignalGenerator();
    const results = [];
    let signalsCreated = 0;
    let signalsSkipped = 0;

    // Process each tweet
    for (const tweet of signalTweets) {
      console.log(`\n[GenerateSignals] Processing tweet: "${tweet.tweetText.substring(0, 80)}..."`);
      console.log(`[GenerateSignals] Tokens: ${tweet.extractedTokens.join(', ')}`);

      // For each token in the tweet
      for (const token of tweet.extractedTokens) {
        // For each agent subscribed to this CT account
        for (const link of agentLinks) {
          const agent = link.agent;

          // Skip non-PUBLIC agents
          if (agent.status !== 'PUBLIC') {
            console.log(`[GenerateSignals] Skipping ${agent.name} - status: ${agent.status}`);
            continue;
          }

          try {
            // Check if signal already exists (last 6 hours)
            const recentSignal = await prisma.signal.findFirst({
              where: {
                agentId: agent.id,
                tokenSymbol: token,
                createdAt: {
                  gte: new Date(Date.now() - 6 * 60 * 60 * 1000),
                },
              },
            });

            if (recentSignal) {
              console.log(`[GenerateSignals] Recent signal exists for ${agent.name} - ${token}`);
              signalsSkipped++;
              continue;
            }

            // Get market indicators
            const indicators = await prisma.marketIndicators6h.findFirst({
              where: { tokenSymbol: token },
              orderBy: { windowStart: 'desc' },
            });

            // Determine sentiment from tweet
            const tweetLower = tweet.tweetText.toLowerCase();
            const sentiment: 'bullish' | 'bearish' | 'neutral' = 
              tweetLower.includes('short') || tweetLower.includes('dump') || tweetLower.includes('bear') ? 'bearish' :
              tweetLower.includes('long') || tweetLower.includes('moon') || tweetLower.includes('bull') || tweetLower.includes('buy') || tweetLower.includes('breakout') ? 'bullish' :
              'bullish'; // Default to bullish for signal candidates

            console.log(`[GenerateSignals] Generating signal for ${agent.name} (${agent.venue})`);
            console.log(`[GenerateSignals] Token: ${token}, Sentiment: ${sentiment}`);

            // For MULTI venue agents, default to HYPERLIQUID (Agent Where will route dynamically)
            const signalVenue = agent.venue === 'MULTI' ? 'HYPERLIQUID' : agent.venue;

            // Generate signal using LLM
            const tradingSignal = await signalGenerator.generateSignal({
              tweetText: tweet.tweetText,
              tweetSentiment: sentiment,
              tweetConfidence: 0.75,
              tokenSymbol: token,
              venue: signalVenue,
              marketIndicators: indicators?.indicators as any,
              ctAccountImpactFactor: tweet.ctAccount.impactFactor,
            });

            console.log(`[GenerateSignals] ✅ LLM Signal: ${tradingSignal.side}`);
            console.log(`[GenerateSignals]    Confidence: ${(tradingSignal.confidence * 100).toFixed(0)}%`);
            console.log(`[GenerateSignals]    Leverage: ${tradingSignal.leverage || 'N/A'}`);
            console.log(`[GenerateSignals]    Stop Loss: ${tradingSignal.stopLoss.value}%`);
            console.log(`[GenerateSignals]    Take Profit: ${tradingSignal.takeProfit.value}%`);
            console.log(`[GenerateSignals]    Reasoning: ${tradingSignal.reasoning.substring(0, 100)}...`);

            // Verify proof of intent before creating signal
            const proofVerification = await ProofVerificationService.verifyAgentProofOfIntent(agent.id);
            if (!proofVerification.isValid) {
              console.log(`[GenerateSignals] ❌ Proof of intent verification failed for agent ${agent.name}: ${proofVerification.error}`);
              signalsSkipped++;
              continue;
            }

            // Create signal in database
            const signal = await prisma.signal.create({
              data: {
                agentId: agent.id,
                tokenSymbol: token,
                venue: signalVenue, // MULTI agents → HYPERLIQUID (Agent Where will re-route if needed)
                side: tradingSignal.side,
                sizeModel: {
                  type: 'balance-percentage',
                  value: 5,
                  impactFactor: tweet.ctAccount.impactFactor,
                  confidence: tradingSignal.confidence,
                  leverage: tradingSignal.leverage,
                },
                riskModel: {
                  stopLoss: tradingSignal.stopLoss,
                  takeProfit: tradingSignal.takeProfit,
                  riskLevel: tradingSignal.riskLevel,
                  entryPrice: tradingSignal.entryPrice,
                },
                sourceTweets: [tweet.tweetId],
                proofVerified: true, // Mark as verified since we checked proof above
              },
            });

            signalsCreated++;

            results.push({
              signalId: signal.id,
              agent: agent.name,
              venue: signalVenue,
              token,
              side: tradingSignal.side,
              confidence: tradingSignal.confidence,
              leverage: tradingSignal.leverage,
              stopLoss: `${tradingSignal.stopLoss.value * 100}%`,
              takeProfit: `${tradingSignal.takeProfit.value * 100}%`,
              reasoning: tradingSignal.reasoning,
              tweet: tweet.tweetText.substring(0, 100),
            });

            console.log(`[GenerateSignals] ✅ Created signal ${signal.id} for ${agent.name}`);

          } catch (error: any) {
            console.error(`[GenerateSignals] Error for ${agent.name} - ${token}:`, error.message);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      tweetsProcessed: signalTweets.length,
      signalsCreated,
      signalsSkipped,
      signals: results,
      message: `Generated ${signalsCreated} signals from ${signalTweets.length} tweets`,
    });

  } catch (error: any) {
    console.error('[GenerateSignals] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to generate signals',
    });
  }
}
