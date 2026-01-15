import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';

const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmgql529ykrlw01v6b9so0woq/subgraphs/ost-prod/v8/gn';

interface StatsResponse {
    tradingVolume: string;
    tradingVolumeRaw: number;
    alphaSources: number;
    tradingPairs: number;
    uptime: string;
}

async function fetchTradingVolumes(walletAddresses: string[]): Promise<number> {
    if (walletAddresses.length === 0) return 0;

    const userQueries = walletAddresses.map((addr, idx) =>
        `user${idx}: user(id: "${addr.toLowerCase()}") { totalVolume }`
    ).join('\n');

    const query = `query { ${userQueries} }`;

    try {
        const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) {
            console.error('[Stats API] Subgraph request failed:', response.status);
            return 0;
        }

        const result = await response.json();

        if (result.errors) {
            console.error('[Stats API] Subgraph query errors:', result.errors);
            return 0;
        }

        let totalVolume = 0;
        for (const key of Object.keys(result.data || {})) {
            const userData = result.data[key];
            if (userData?.totalVolume) {
                totalVolume += parseFloat(userData.totalVolume) / 1e6;
            }
        }

        return totalVolume;
    } catch (error) {
        console.error('[Stats API] Failed to fetch trading volumes:', error);
        return 0;
    }
}

function formatVolume(volume: number): string {
    if (volume >= 1_000_000_000) {
        return `$${(volume / 1_000_000_000).toFixed(1)}B+`;
    } else if (volume >= 1_000_000) {
        return `$${(volume / 1_000_000).toFixed(1)}M+`;
    } else if (volume >= 1_000) {
        return `$${(volume / 1_000).toFixed(1)}K+`;
    }
    return `$${volume.toFixed(0)}`;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<StatsResponse | { error: string }>
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [
            walletAddresses,
            telegramAlphaUsersCount,
            ctAccountsCount,
            researchInstitutesCount,
            topTradersCount,
            tradingPairsCount,
        ] = await Promise.all([
            prisma.user_agent_addresses.findMany({
                select: { user_wallet: true },
            }),
            prisma.telegram_alpha_users.count(),
            prisma.ct_accounts.count(),
            prisma.research_institutes.count(),
            prisma.agent_top_traders.count(),
            prisma.ostium_available_pairs.count(),
        ]);
        const wallets = walletAddresses.map(w => w.user_wallet);
        const tradingVolumeRaw = await fetchTradingVolumes(wallets);

        const alphaSources =
            telegramAlphaUsersCount +
            ctAccountsCount +
            researchInstitutesCount +
            topTradersCount;

        const stats: StatsResponse = {
            tradingVolume: formatVolume(tradingVolumeRaw),
            tradingVolumeRaw,
            alphaSources,
            tradingPairs: tradingPairsCount,
            uptime: '99.9%',
        };

        return res.status(200).json(stats);
    } catch (error: any) {
        console.error('[Stats API] Error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch stats' });
    }
}
