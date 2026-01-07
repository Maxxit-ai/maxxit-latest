import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withTransaction } from '../../../lib/prisma';
import { CreditService } from '../../../lib/credit-service';
import { Decimal } from '@prisma/client/runtime/library';

interface TradingPreferences {
    risk_tolerance: number;
    trade_frequency: number;
    social_sentiment_weight: number;
    price_momentum_focus: number;
    market_rank_priority: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { agentId, userWallet, venue = 'OSTIUM', tradingPreferences } = req.body as {
            agentId: string;
            userWallet: string;
            venue?: string;
            tradingPreferences?: TradingPreferences;
        };

        if (!agentId || !userWallet) {
            return res.status(400).json({
                error: 'Missing required fields: agentId, userWallet',
            });
        }

        const normalizedWallet = userWallet.toLowerCase().trim();

        // 1. Get Agent and its Alpha Sources to calculate cost
        const agent = await prisma.agents.findUnique({
            where: { id: agentId },
            include: {
                agent_telegram_users: {
                    include: {
                        telegram_alpha_users: true
                    }
                }
            }
        });

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Check if the joining user is the club creator (creator already paid during creation)
        const isCreator = agent.creator_wallet.toLowerCase() === normalizedWallet;

        // Check if deployment already exists
        const existingDeployment = await prisma.agent_deployments.findFirst({
            where: {
                agent_id: agentId,
                user_wallet: normalizedWallet,
            },
        });

        // Only charge if it's a NEW deployment for this agent
        const alphaInfos = agent.agent_telegram_users
            .map(au => au.telegram_alpha_users)
            // @ts-ignore
            .filter(alpha => alpha !== null && alpha.credit_price && new Decimal(alpha.credit_price).gt(0))
            .map(alpha => ({
                id: alpha!.id,
                // @ts-ignore
                price: alpha!.credit_price.toString(),
                providerWallet: alpha!.user_wallet || ''
            }));

        const result = await withTransaction(async (tx) => {
            // 2. Handle Payment if required and not already joined
            // Skip charging if user is the creator (they paid during club creation)
            if (alphaInfos.length > 0 && !existingDeployment && !isCreator) {
                console.log(`[Join with Payment] Charging ${normalizedWallet} for ${alphaInfos.length} alpha sources`);

                // Final pre-flight balance check with insensitive matching
                // @ts-ignore
                const currentBalance = await tx.user_credit_balance.findFirst({
                    where: {
                        user_wallet: {
                            equals: normalizedWallet,
                            mode: 'insensitive'
                        }
                    }
                });

                if (!currentBalance || new Decimal(currentBalance.balance).lt(0)) { // purchaseAlphaAccess does the full check, but we check presence here
                    // Actually purchaseAlphaAccess will handle it, but we want to be safe with the query
                }

                await CreditService.purchaseAlphaAccess(tx, normalizedWallet, alphaInfos, `JOIN_CLUB_${agentId}_${normalizedWallet}`);
            }

            // 3. Create or Update Deployment
            if (existingDeployment) {
                const currentVenues = existingDeployment.enabled_venues || [];
                const needsVenueUpdate = !currentVenues.includes(venue);

                const updated = await tx.agent_deployments.update({
                    where: { id: existingDeployment.id },
                    data: {
                        status: 'ACTIVE',
                        sub_active: true,
                        module_enabled: true,
                        ...(needsVenueUpdate && { enabled_venues: [...currentVenues, venue] }),
                        ...(tradingPreferences && {
                            risk_tolerance: tradingPreferences.risk_tolerance,
                            trade_frequency: tradingPreferences.trade_frequency,
                            social_sentiment_weight: tradingPreferences.social_sentiment_weight,
                            price_momentum_focus: tradingPreferences.price_momentum_focus,
                            market_rank_priority: tradingPreferences.market_rank_priority,
                        }),
                    },
                });
                return { deployment: updated, isNew: false };
            } else {
                const created = await tx.agent_deployments.create({
                    data: {
                        agent_id: agentId,
                        user_wallet: normalizedWallet,
                        safe_wallet: normalizedWallet, // Using user wallet as safe for now (Ostium style)
                        enabled_venues: [venue],
                        status: 'ACTIVE',
                        sub_active: true,
                        module_enabled: true,
                        ...(tradingPreferences && {
                            risk_tolerance: tradingPreferences.risk_tolerance,
                            trade_frequency: tradingPreferences.trade_frequency,
                            social_sentiment_weight: tradingPreferences.social_sentiment_weight,
                            price_momentum_focus: tradingPreferences.price_momentum_focus,
                            market_rank_priority: tradingPreferences.market_rank_priority,
                        }),
                    },
                });
                return { deployment: created, isNew: true };
            }
        });

        return res.status(200).json({
            success: true,
            deployment: result.deployment,
            message: result.isNew ? 'Joined club successfully with payment' : 'Club settings updated',
        });

    } catch (error: any) {
        console.error('[Join with Payment API] Error:', error);
        return res.status(error.message?.includes('Insufficient') ? 402 : 500).json({
            error: error.message || 'Failed to join club',
        });
    }
}
