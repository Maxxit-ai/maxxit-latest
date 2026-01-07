import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withTransaction } from '../../../lib/prisma';
import { insertAgentSchema } from '@shared/schema';
import { z } from 'zod';
import { AgentService } from '../../../lib/agent-service';
import { CreditService } from '../../../lib/credit-service';

/**
 * Atomic API to create an Agent along with its links and process credit payment.
 */

const createWithPaymentSchema = z.object({
    agentData: insertAgentSchema,
    linkingData: z.object({
        ctAccountIds: z.array(z.string().uuid()).optional().default([]),
        researchInstituteIds: z.array(z.string().uuid()).optional().default([]),
        telegramAlphaUserIds: z.array(z.string().uuid()).optional().default([]),
        topTraderIds: z.array(z.string().uuid()).optional().default([]),
    })
});

// Helper for snake_to_camel conversion (consistency with existing API)
function snakeToCamel(str: string): string {
    return str.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
}

function convertKeysToCamelCase(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(convertKeysToCamelCase);

    const result: any = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const camelKey = snakeToCamel(key);
            result[camelKey] = convertKeysToCamelCase(obj[key]);
        }
    }
    return result;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const validated = createWithPaymentSchema.parse(req.body);
        const { agentData, linkingData } = validated;

        // Normalize wallets
        agentData.creatorWallet = agentData.creatorWallet.toLowerCase();
        if (agentData.profitReceiverAddress) {
            agentData.profitReceiverAddress = agentData.profitReceiverAddress.toLowerCase();
        }

        // 1. Fetch Alpha Users to get prices and provider wallets
        let alphaInfos: { id: string, price: string, providerWallet: string }[] = [];
        if (linkingData.telegramAlphaUserIds.length > 0) {
            // @ts-ignore
            const alphaUsers = await prisma.telegram_alpha_users.findMany({
                where: { id: { in: linkingData.telegramAlphaUserIds } },
                select: { id: true, credit_price: true, user_wallet: true }
            });

            alphaInfos = alphaUsers.map(u => ({
                id: u.id,
                price: u.credit_price.toString(),
                providerWallet: u.user_wallet || ''
            }));

            // Validation: Check if all PAID alphas have a provider wallet
            const missingWallets = alphaInfos.filter(a => Number(a.price) > 0 && !a.providerWallet);
            if (missingWallets.length > 0) {
                return res.status(400).json({
                    error: 'Missing Provider Wallet',
                    message: 'Some selected paid alpha sources do not have a configured provider wallet to receive credits.',
                    details: missingWallets.map(m => m.id)
                });
            }
        }

        // 2. Perform Atomic Creation + Payment
        const result = await withTransaction(async (tx) => {
            // a. Purchase Alphas (Credit Transfers)
            // Reference ID for the transaction (for audit/tracking)
            const referenceId = `CLUB_CREATE_${Date.now()}`;

            const paymentResult = await CreditService.purchaseAlphaAccess(
                tx,
                agentData.creatorWallet,
                alphaInfos,
                referenceId
            );

            // b. Create Agent completely (record + links)
            const agent = await AgentService.createAgentCompletely(
                tx,
                agentData,
                linkingData
            );

            return { agent, paymentResult };
        }, { timeout: 60000 });

        // 3. Return response
        const camelCaseAgent = convertKeysToCamelCase(result.agent);
        return res.status(201).json({
            success: true,
            agent: camelCaseAgent,
            payment: result.paymentResult
        });

    } catch (error: any) {
        console.error('[API /agents/create-with-payment] Error:', error.message);

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors,
            });
        }

        // Handle specific business logic errors from CreditService
        if (error.message.includes('Insufficient credit balance')) {
            return res.status(402).json({
                error: 'INSUFFICIENT_FUNDS',
                message: error.message
            });
        }

        return res.status(500).json({
            error: 'SERVER_ERROR',
            message: error.message || 'Internal server error'
        });
    }
}
