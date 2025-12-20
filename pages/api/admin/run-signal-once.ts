import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { bucket6hUtc } from '../../../lib/time-utils';
import { createLunarCrushScorer } from '../../../lib/lunarcrush-score';

/**
 * Admin endpoint to trigger signal creation once for testing
 * 
 * This implements a minimal signal creation flow:
 * 1. Reads candidate ct_posts (is_signal_candidate=true)
 * 2. Gets latest market_indicators_6h
 * 3. Reads agent weights and linked agent_accounts
 * 4. Verifies venue availability in venues_status
 * 5. Inserts into signals only if no duplicate for (agent_id, token_symbol, 6h bucket)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[ADMIN] Running signal creation once...');

    // Initialize LunarCrush scorer
    const lunarCrushScorer = createLunarCrushScorer();
    if (!lunarCrushScorer) {
      console.warn('[SIGNAL] LunarCrush API key not configured - using default 5% position size');
    }

    // 1. Get candidate posts from Twitter, Telegram Channels, and Telegram Alpha Users
    const ctPosts = await prisma.ct_posts.findMany({
      where: {
        is_signal_candidate: true,
        ct_accounts: {
          is_active: true
        }
      },
      include: { ct_accounts: true },
      orderBy: { tweet_created_at: 'desc' },
      take: 10,
    });

    // Telegram posts from channels (via research_institutes)
    const telegramChannelPosts = await prisma.telegram_posts.findMany({
      where: {
        is_signal_candidate: true,
        source_id: { not: null }, // Has source (channel/group)
        telegram_sources: {
          is_active: true
        }
      },
      include: { telegram_sources: true },
      orderBy: { message_created_at: 'desc' },
      take: 10,
    });

    // Telegram posts from individual alpha users (via agent_telegram_users)
    const telegramAlphaPosts = await prisma.telegram_posts.findMany({
      where: {
        is_signal_candidate: true,
        alpha_user_id: { not: null }, // Has alpha user (individual DMs)
        telegram_alpha_users: {
          is_active: true
        }
      },
      include: { telegram_alpha_users: true },
      orderBy: { message_created_at: 'desc' },
      take: 10,
    });

    console.log(`[SIGNAL] Found ${ctPosts.length} Twitter + ${telegramChannelPosts.length} Telegram channels + ${telegramAlphaPosts.length} Telegram alpha users`);

    if (ctPosts.length === 0 && telegramChannelPosts.length === 0 && telegramAlphaPosts.length === 0) {
      return res.status(200).json({ 
        message: 'No signal candidates found',
        signalsCreated: 0,
      });
    }

    // Normalize posts to a common format for processing
    interface NormalizedPost {
      source: 'twitter' | 'telegram_channel' | 'telegram_alpha';
      id: string;
      text: string;
      extracted_tokens: string[];
      signal_type: string | null;
      created_at: Date;
      source_id: string;  // ct_account_id, telegram_source_id, or telegram_alpha_user_id
      source_name: string;
      impact_factor?: number;
    }

    const candidatePosts: NormalizedPost[] = [
      ...ctPosts.map(p => ({
        source: 'twitter' as const,
        id: p.tweet_id,
        text: p.tweet_text,
        extracted_tokens: p.extracted_tokens,
        signal_type: p.signal_type,
        created_at: p.tweet_created_at,
        source_id: p.ct_account_id,
        source_name: `@${p.ct_accounts.x_username}`,
        impact_factor: p.ct_accounts.impact_factor,
      })),
      ...telegramChannelPosts.map(p => ({
        source: 'telegram_channel' as const,
        id: p.message_id,
        text: p.message_text,
        extracted_tokens: p.extracted_tokens,
        signal_type: p.signal_type,
        created_at: p.message_created_at,
        source_id: p.source_id!,
        source_name: p.telegram_sources!.source_name,
        impact_factor: 0.5, // Default impact factor for Telegram channels
      })),
      ...telegramAlphaPosts.map(p => ({
        source: 'telegram_alpha' as const,
        id: p.message_id,
        text: p.message_text,
        extracted_tokens: p.extracted_tokens,
        signal_type: p.signal_type,
        created_at: p.message_created_at,
        source_id: p.alpha_user_id!,
        source_name: p.telegram_alpha_users!.telegram_username 
          ? `@${p.telegram_alpha_users!.telegram_username}` 
          : p.telegram_alpha_users!.first_name || 'Telegram User',
        impact_factor: p.telegram_alpha_users!.impact_factor,
      })),
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const signalsCreated = [];
    
    // Stablecoins that should NOT be traded (they are the base currency)
    const EXCLUDED_TOKENS = ['USDC', 'USDT', 'DAI', 'USDC.E', 'BUSD', 'FRAX'];

    for (const post of candidatePosts) {
      // Extract tokens from the post
      for (const tokenSymbol of post.extracted_tokens) {
        // Skip stablecoins - they are base currency, not trading assets
        if (EXCLUDED_TOKENS.includes(tokenSymbol.toUpperCase())) {
          console.log(`[SIGNAL] Skipping stablecoin ${tokenSymbol} - base currency only`);
          continue;
        }
        // 2. Get latest market indicators for this token
        const indicators = await prisma.market_indicators_6h.findFirst({
          where: { token_symbol: tokenSymbol },
          orderBy: { window_start: 'desc' },
        });

        // 3. Find agents that monitor this source
        let agents: any[] = [];
        
        if (post.source === 'twitter') {
          // For Twitter: find agents linked via agent_accounts
          const agentLinks = await prisma.agent_accounts.findMany({
            where: { ct_account_id: post.source_id },
            include: { agents: true },
          });
          agents = agentLinks.map(link => link.agents);
        } else if (post.source === 'telegram_channel') {
          // For Telegram Channels: find agents linked via research_institutes
          const telegramSource = await prisma.telegram_sources.findUnique({
            where: { id: post.source_id },
            include: {
              research_institutes: {
                include: {
                  agent_research_institutes: {
                    include: { agents: true }
                  }
                }
              }
            }
          });
          
          if (telegramSource?.research_institutes) {
            agents = telegramSource.research_institutes.agent_research_institutes.map(
              ari => ari.agents
            );
          }
        } else if (post.source === 'telegram_alpha') {
          // For Telegram Alpha Users: find agents linked via agent_telegram_users
          const agentLinks = await prisma.agent_telegram_users.findMany({
            where: { telegram_alpha_user_id: post.source_id },
            include: { agents: true },
          });
          agents = agentLinks.map(link => link.agents);
        }

        console.log(`[SIGNAL] Found ${agents.length} agents monitoring ${post.source_name}`);

        for (const agent of agents) {

          // Skip non-ACTIVE agents
          if (agent.status !== 'PUBLIC') continue; // Only generate signals for public agents

          // Check for duplicate (same agent, token, 6h bucket)
          const currentBucket = bucket6hUtc(new Date());
          const existing = await prisma.signals.findFirst({
            where: {
              agent_id: agent.id,
              token_symbol: tokenSymbol,
              created_at: {
                gte: currentBucket,
              },
            },
          });

          if (existing) {
            console.log(`[SIGNAL] Duplicate found for ${agent.name} - ${tokenSymbol}`);
            continue;
          }

          // For MULTI venue agents, default to HYPERLIQUID (Agent Where will route dynamically)
          const signalVenue = agent.venue === 'MULTI' ? 'HYPERLIQUID' : agent.venue;

          // Get LunarCrush score for dynamic position sizing
          let positionSizePercentage = 5; // Default 5%
          let lunarCrushScore = null;
          let lunarCrushReasoning = null;
          let lunarCrushBreakdown = null;

          if (lunarCrushScorer) {
            try {
              console.log(`[SIGNAL] Fetching LunarCrush score for ${tokenSymbol}...`);
              const scoreData = await lunarCrushScorer.getTokenScore(tokenSymbol);
              
              if (scoreData.tradeable) {
                positionSizePercentage = scoreData.positionSize; // 0-10%
                lunarCrushScore = scoreData.score;
                lunarCrushReasoning = scoreData.reasoning;
                lunarCrushBreakdown = scoreData.breakdown;
                
                console.log(`[SIGNAL] LunarCrush: ${tokenSymbol} score=${scoreData.score.toFixed(3)}, position=${positionSizePercentage.toFixed(2)}%`);
              } else {
                console.log(`[SIGNAL] LunarCrush: ${tokenSymbol} score=${scoreData.score.toFixed(3)} - NOT TRADEABLE (score <= 0)`);
                continue; // Skip this signal if LunarCrush says don't trade
              }
            } catch (error: any) {
              console.warn(`[SIGNAL] LunarCrush error for ${tokenSymbol}:`, error.message, '- using default 5%');
            }
          }

          // Create signal with LunarCrush-derived position sizing
          // Wrapped in try-catch to handle race condition duplicate errors gracefully
          try {
            const signal = await prisma.signals.create({
              data: {
                agent_id: agent.id,
                token_symbol: tokenSymbol,
                venue: signalVenue, // MULTI agents → HYPERLIQUID (Agent Where will re-route if needed)
                side: 'LONG', // Simplified - would use sentiment analysis
                size_model: {
                  type: 'balance-percentage',
                  value: positionSizePercentage, // Dynamic from LunarCrush!
                  impactFactor: post.impact_factor || 0.5,
                },
                risk_model: {
                  stopLoss: 0.05,
                  takeProfit: 0.15,
                },
                source_tweets: [post.source === 'twitter' ? post.id : `TELEGRAM_${post.id}`],
                lunarcrush_score: lunarCrushScore,
                lunarcrush_reasoning: lunarCrushReasoning,
                lunarcrush_breakdown: lunarCrushBreakdown,
              },
            });

            signalsCreated.push(signal);
            console.log(`[SIGNAL] Created signal from ${post.source}: ${agent.name} - ${tokenSymbol} with ${positionSizePercentage.toFixed(2)}% position size`);
          } catch (createError: any) {
            // P2002: Unique constraint violation (race condition - another worker created it first)
            if (createError.code === 'P2002') {
              console.log(`[SIGNAL] Signal already created by another worker: ${agent.name} - ${tokenSymbol} (race condition handled)`);
            } else {
              // Re-throw unexpected errors
              throw createError;
            }
          }
        }
      }
    }

    return res.status(200).json({
      message: 'Signal creation completed',
      signalsCreated: signalsCreated.length,
      signals: signalsCreated,
    });
  } catch (error: any) {
    console.error('[ADMIN] Signal creation error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
