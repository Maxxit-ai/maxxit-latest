import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@maxxit/database';

/**
 * API endpoint to fetch user's open trades with eigenAI signature data
 * 
 * GET /api/trades/my-trades?userWallet=0x...
 * 
 * Returns all open trades for the connected user with:
 * - Trade position details
 * - Signal information
 * - EigenAI signature verification data (from telegram_posts)
 * - Agent and deployment details
 * 
 * Flow:
 * 1. Find all agent_deployments for the user_wallet
 * 2. Find all open positions for those deployments
 * 3. Join with signals to get signal details
 * 4. Join with agent_telegram_users to get telegram user subscription
 * 5. Join with telegram_posts to get signature verification data
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use GET.' 
    });
  }

  try {
    const { userWallet } = req.query;

    if (!userWallet || typeof userWallet !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid userWallet parameter'
      });
    }

    console.log(`[MyTrades] Fetching open trades for wallet: ${userWallet}`);

    // First, let's check if there are ANY positions with status OPEN
    const allOpenPositions = await prisma.positions.findMany({
      where: {
        status: 'OPEN',
      },
      select: {
        id: true,
        deployment_id: true,
        status: true,
        token_symbol: true,
      },
      take: 5,
    });
    console.log(`[MyTrades] Total open positions in DB (sample):`, JSON.stringify(allOpenPositions, null, 2));

    // First, find all deployments for this user (case-insensitive)
    const userDeployments = await prisma.agent_deployments.findMany({
      where: {
        user_wallet: {
          equals: userWallet,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        agent_id: true,
        user_wallet: true,
      },
    });

    console.log(`[MyTrades] Found ${userDeployments.length} deployments for user:`, JSON.stringify(userDeployments, null, 2));
    
    const deploymentIds = userDeployments.map(d => d.id);

    if (deploymentIds.length === 0) {
      return res.status(200).json({
        success: true,
        trades: [],
        total: 0,
      });
    }

    // Fetch all open positions for the user with all related data
    const openTrades = await prisma.positions.findMany({
      where: {
        deployment_id: {
          in: deploymentIds,
        },
        status: 'OPEN',
      },
      include: {
        signals: {
          include: {
            agents: {
              include: {
                agent_telegram_users: {
                  include: {
                    telegram_alpha_users: true,
                  },
                },
              },
            },
          },
        },
        agent_deployments: {
          include: {
            agents: true,
          },
        },
      },
      orderBy: {
        opened_at: 'desc',
      },
    });

    console.log(`[MyTrades] Found ${openTrades.length} open trades`);

    // For each trade, try to find the corresponding telegram post with signature data
    const tradesWithSignatureData = await Promise.all(
      openTrades.map(async (trade) => {
        // Get all telegram alpha users associated with this agent
        const telegramAlphaUserIds = trade.signals.agents.agent_telegram_users.map(
          (atu) => atu.telegram_alpha_user_id
        );

        // Find telegram posts from these users that match the trade's token and timing
        // We look for posts created slightly before the signal was created
        const signalCreatedAt = trade.signals.created_at;
        const searchWindowStart = new Date(signalCreatedAt.getTime() - 60 * 60 * 1000); // 1 hour before signal
        
        const relatedTelegramPost = await prisma.telegram_posts.findFirst({
          where: {
            alpha_user_id: {
              in: telegramAlphaUserIds,
            },
            extracted_tokens: {
              has: trade.token_symbol,
            },
            message_created_at: {
              gte: searchWindowStart,
              lte: signalCreatedAt,
            },
            is_signal_candidate: true,
            // Only include posts with signature data
            llm_signature: {
              not: null,
            },
          },
          orderBy: {
            message_created_at: 'desc',
          },
        });

        console.log(`[MyTrades] Related Telegram Post: ${JSON.stringify(relatedTelegramPost)}`);

        // Calculate current PnL (if current_price is available)
        let unrealizedPnl = null;
        let unrealizedPnlPercent = null;
        
        if (trade.current_price) {
          const currentPrice = Number(trade.current_price);
          const entryPrice = Number(trade.entry_price);
          const qty = Number(trade.qty);
          
          if (trade.side === 'LONG') {
            unrealizedPnl = (currentPrice - entryPrice) * qty;
            unrealizedPnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
          } else {
            unrealizedPnl = (entryPrice - currentPrice) * qty;
            unrealizedPnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
          }
        }

        return {
          // Position details
          id: trade.id,
          tokenSymbol: trade.token_symbol,
          side: trade.side,
          qty: trade.qty.toString(),
          entryPrice: trade.entry_price.toString(),
          currentPrice: trade.current_price?.toString() || null,
          unrealizedPnl: unrealizedPnl?.toFixed(2) || null,
          unrealizedPnlPercent: unrealizedPnlPercent?.toFixed(2) || null,
          stopLoss: trade.stop_loss?.toString() || null,
          takeProfit: trade.take_profit?.toString() || null,
          openedAt: trade.opened_at.toISOString(),
          venue: trade.venue,
          
          // Agent details
          agentName: trade.agent_deployments.agents.name,
          agentId: trade.agent_deployments.agent_id,
          deploymentId: trade.deployment_id,
          
          // Signal details
          signalId: trade.signal_id,
          signalCreatedAt: trade.signals.created_at.toISOString(),
          
          // EigenAI Signature data (if available)
          hasSignatureData: !!relatedTelegramPost,
          signatureData: relatedTelegramPost ? {
            messageText: relatedTelegramPost.message_text,
            llmSignature: relatedTelegramPost.llm_signature,
            llmRawOutput: relatedTelegramPost.llm_raw_output,
            llmModelUsed: relatedTelegramPost.llm_model_used,
            llmChainId: relatedTelegramPost.llm_chain_id,
            llmReasoning: relatedTelegramPost.llm_reasoning,
            messageCreatedAt: relatedTelegramPost.message_created_at.toISOString(),
            confidenceScore: relatedTelegramPost.confidence_score,
            telegramPostId: relatedTelegramPost.id,
            
            // Telegram alpha user info
            telegramUsername: trade.signals.agents.agent_telegram_users.find(
              (atu) => atu.telegram_alpha_user_id === relatedTelegramPost.alpha_user_id
            )?.telegram_alpha_users.telegram_username || 'Unknown',
          } : null,
        };
      })
    );

    // Filter out trades without signature data (optional - you can remove this if you want to show all trades)
    const tradesWithSignatures = tradesWithSignatureData.filter(
      (trade) => trade.hasSignatureData
    );

    console.log(`[MyTrades] ${tradesWithSignatures.length} trades have signature data`);

    return res.status(200).json({
      success: true,
      trades: tradesWithSignatures,
      total: tradesWithSignatures.length,
    });

  } catch (error) {
    console.error('[MyTrades] Error fetching trades:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch trades',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
