import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

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
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET.",
    });
  }

  try {
    const { userWallet, status, page = "1", pageSize = "10" } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid userWallet parameter",
      });
    }

    console.log(`[MyTrades] Fetching open trades for wallet: ${userWallet}`);

    // First, let's check if there are ANY positions with status OPEN
    const allOpenPositions = await prisma.positions.findMany({
      where: {
        status: "OPEN",
      },
      select: {
        id: true,
        deployment_id: true,
        status: true,
        token_symbol: true,
      },
      take: 5,
    });
    console.log(
      `[MyTrades] Total open positions in DB (sample):`,
      JSON.stringify(allOpenPositions, null, 2)
    );

    // First, find all deployments for this user (case-insensitive)
    const userDeployments = await prisma.agent_deployments.findMany({
      where: {
        user_wallet: {
          equals: userWallet,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        agent_id: true,
        user_wallet: true,
      },
    });

    console.log(
      `[MyTrades] Found ${userDeployments.length} deployments for user:`,
      JSON.stringify(userDeployments, null, 2)
    );

    const deploymentIds = userDeployments.map((d) => d.id);

    if (deploymentIds.length === 0) {
      return res.status(200).json({
        success: true,
        trades: [],
        total: 0,
      });
    }

    const currentPage = Math.max(parseInt(page as string, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(pageSize as string, 10) || 10, 1),
      50
    );
    const skip = (currentPage - 1) * limit;

    const statusFilter =
      status === "OPEN"
        ? { equals: "OPEN" }
        : status === "CLOSED"
        ? { not: "OPEN" }
        : undefined;

    const baseWhere = {
      deployment_id: { in: deploymentIds },
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [totalCount, openCount, closedCount] = await Promise.all([
      prisma.positions.count({ where: baseWhere }),
      prisma.positions.count({
        where: {
          deployment_id: { in: deploymentIds },
          status: "OPEN",
        },
      }),
      prisma.positions.count({
        where: {
          deployment_id: { in: deploymentIds },
          status: { not: "OPEN" },
        },
      }),
    ]);

    // Fetch positions for the user with all related data (open and closed) with pagination
    const openTrades = await prisma.positions.findMany({
      where: baseWhere,
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
        opened_at: "desc",
      },
      skip,
      take: limit,
    });

    console.log(
      `[MyTrades] Found ${openTrades.length} trades for page ${currentPage}`
    );

    // For each trade, try to find the corresponding telegram post with signature data
    const tradesWithSignatureData = await Promise.all(
      openTrades.map(async (trade) => {
        // Get all telegram alpha users associated with this agent
        const telegramAlphaUserIds =
          trade.signals.agents.agent_telegram_users.map(
            (atu) => atu.telegram_alpha_user_id
          );

        // Find telegram posts from these users that match the trade's token and timing
        // We look for posts created slightly before the signal was created
        const signalCreatedAt = trade.signals.created_at;
        const searchWindowStart = new Date(
          signalCreatedAt.getTime() - 60 * 60 * 1000
        ); // 1 hour before signal

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
            message_created_at: "desc",
          },
          select: {
            id: true,
            alpha_user_id: true,
            message_text: true,
            llm_signature: true,
            llm_raw_output: true,
            llm_model_used: true,
            llm_chain_id: true,
            llm_reasoning: true,
            llm_market_context: true,
            message_created_at: true,
            confidence_score: true,
            extracted_tokens: true,
          },
        });

        console.log(
          `[MyTrades] Related Telegram Post: ${JSON.stringify(
            relatedTelegramPost
          )}`
        );

        // Calculate current PnL (if current_price is available)
        let unrealizedPnl = null;
        let unrealizedPnlPercent = null;

        if (trade.current_price) {
          const currentPrice = Number(trade.current_price);
          const entryPrice = Number(trade.entry_price);
          const qty = Number(trade.qty);

          if (trade.side === "LONG") {
            unrealizedPnl = (currentPrice - entryPrice) * qty;
            unrealizedPnlPercent =
              ((currentPrice - entryPrice) / entryPrice) * 100;
          } else {
            unrealizedPnl = (entryPrice - currentPrice) * qty;
            unrealizedPnlPercent =
              ((entryPrice - currentPrice) / entryPrice) * 100;
          }
        }

        return {
          // Position details
          id: trade.id,
          tokenSymbol: trade.token_symbol,
          side: trade.side,
          status: trade.status,
          qty: trade.qty.toString(),
          entryPrice: trade.entry_price.toString(),
          currentPrice: trade.current_price?.toString() || null,
          exitPrice: trade.exit_price?.toString() || null,
          pnl: trade.pnl?.toString() || null,
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
          llmDecision: trade.signals.llm_decision,
          llmFundAllocation: trade.signals.llm_fund_allocation,
          llmLeverage: trade.signals.llm_leverage,
          llmShouldTrade: trade.signals.llm_should_trade,

          // EigenAI Signature data (if available)
          hasSignatureData: !!relatedTelegramPost,
          signatureData: relatedTelegramPost
            ? {
                messageText: relatedTelegramPost.message_text,
                llmSignature: relatedTelegramPost.llm_signature,
                llmRawOutput: relatedTelegramPost.llm_raw_output,
                llmModelUsed: relatedTelegramPost.llm_model_used,
                llmChainId: relatedTelegramPost.llm_chain_id,
                llmMarketContext:
                  (relatedTelegramPost as any).llm_market_context || null,
                llmReasoning: relatedTelegramPost.llm_reasoning,
                messageCreatedAt:
                  relatedTelegramPost.message_created_at.toISOString(),
                confidenceScore: relatedTelegramPost.confidence_score,
                telegramPostId: relatedTelegramPost.id,

                // Telegram alpha user info
                telegramUsername:
                  trade.signals.agents.agent_telegram_users.find(
                    (atu) =>
                      atu.telegram_alpha_user_id ===
                      relatedTelegramPost.alpha_user_id
                  )?.telegram_alpha_users.telegram_username || "Unknown",
              }
            : null,
        };
      })
    );

    // Also fetch signals that did NOT result in positions (untraded signals)
    const untradedSignalsRaw = await prisma.signals.findMany({
      // Type cast used here because Prisma client maps some fields to camelCase
      // but our schema uses snake_case. This is safe at runtime.
      where: {
        deployment_id: { in: deploymentIds },
        positions: {
          none: {}, // no positions linked to this signal
        },
      } as any,
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
      } as any,
      orderBy: {
        created_at: "desc",
      },
      take: 20,
    });

    const untradedSignals = await Promise.all(
      (untradedSignalsRaw as any[]).map(async (signal) => {
        const telegramAlphaUserIds = signal.agents.agent_telegram_users.map(
          (atu: any) => atu.telegram_alpha_user_id
        );

        const signalCreatedAt = signal.created_at;
        const searchWindowStart = new Date(
          signalCreatedAt.getTime() - 60 * 60 * 1000
        ); // 1 hour before signal

        const relatedTelegramPost = await prisma.telegram_posts.findFirst({
          where: {
            alpha_user_id: {
              in: telegramAlphaUserIds,
            },
            extracted_tokens: {
              has: signal.token_symbol,
            },
            message_created_at: {
              gte: searchWindowStart,
              lte: signalCreatedAt,
            },
            is_signal_candidate: true,
            llm_signature: {
              not: null,
            },
          },
          orderBy: {
            message_created_at: "desc",
          },
          select: {
            id: true,
            alpha_user_id: true,
            message_text: true,
            llm_signature: true,
            llm_raw_output: true,
            llm_model_used: true,
            llm_chain_id: true,
            llm_reasoning: true,
            llm_market_context: true,
            message_created_at: true,
            confidence_score: true,
            extracted_tokens: true,
          },
        });

        return {
          id: signal.id,
          tokenSymbol: signal.token_symbol,
          side: signal.side,
          venue: signal.venue,
          createdAt: signal.created_at.toISOString(),
          agentName: signal.agents.name,
          agentId: signal.agent_id,
          deploymentId: signal.deployment_id || null,
          llmDecision: signal.llm_decision,
          llmFundAllocation: signal.llm_fund_allocation,
          llmLeverage: signal.llm_leverage,
          llmShouldTrade: signal.llm_should_trade,
          hasSignatureData: !!relatedTelegramPost,
          signatureData: relatedTelegramPost
            ? {
                messageText: relatedTelegramPost.message_text,
                llmSignature: relatedTelegramPost.llm_signature,
                llmRawOutput: relatedTelegramPost.llm_raw_output,
                llmModelUsed: relatedTelegramPost.llm_model_used,
                llmChainId: relatedTelegramPost.llm_chain_id,
                llmMarketContext:
                  (relatedTelegramPost as any).llm_market_context || null,
                llmReasoning: relatedTelegramPost.llm_reasoning,
                messageCreatedAt:
                  relatedTelegramPost.message_created_at.toISOString(),
                confidenceScore: relatedTelegramPost.confidence_score,
                telegramPostId: relatedTelegramPost.id,
                telegramUsername:
                  signal.agents.agent_telegram_users.find(
                    (atu: any) =>
                      atu.telegram_alpha_user_id ===
                      relatedTelegramPost.alpha_user_id
                  )?.telegram_alpha_users.telegram_username || "Unknown",
              }
            : null,
        };
      })
    );

    console.log(
      `[MyTrades] ${tradesWithSignatureData.length} trades returned (including unsigned)`
    );

    return res.status(200).json({
      success: true,
      trades: tradesWithSignatureData,
      total: totalCount,
      summary: {
        total: totalCount,
        open: openCount,
        closed: closedCount,
      },
      untradedSignals,
    });
  } catch (error) {
    console.error("[MyTrades] Error fetching trades:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch trades",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
