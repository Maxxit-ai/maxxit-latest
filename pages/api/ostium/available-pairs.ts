import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@maxxit/database';
/**
 * GET /api/ostium/available-pairs
 * Returns all available trading pairs from ostium_available_pairs table
 * Used for token filter selection in copy-trade club creation
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const pairs = await prisma.ostium_available_pairs.findMany({
            select: {
                id: true,
                symbol: true,
                group: true,
                max_leverage: true,
            },
            orderBy: [
                { group: 'asc' },
                { symbol: 'asc' },
            ],
        });

        const tokens = pairs.map((pair) => {
            return {
                id: pair.id,
                symbol: pair.symbol,
                group: pair.group || 'Other',
                maxLeverage: pair.max_leverage,
            };
        });

        // Group tokens by category for easier UI rendering
        const groupedTokens: Record<string, typeof tokens> = {};
        for (const token of tokens) {
            if (!groupedTokens[token.group]) {
                groupedTokens[token.group] = [];
            }
            groupedTokens[token.group].push(token);
        }

        return res.status(200).json({
            success: true,
            tokens,
            groupedTokens,
            count: tokens.length,
        });
    } catch (error: any) {
        console.error('[API /ostium/available-pairs] Error:', error.message);
        return res.status(500).json({
            error: 'Failed to fetch available pairs',
            message: error.message,
        });
    }
}
