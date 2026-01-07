import { NextApiRequest, NextApiResponse } from 'next';
import { TradeQuotaService } from '@lib/trade-quota-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'Missing wallet parameter' });
    }

    try {
        const quota = await TradeQuotaService.getTradeQuota(wallet);
        res.status(200).json(quota);
    } catch (error: any) {
        console.error('Error fetching trade quota:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
