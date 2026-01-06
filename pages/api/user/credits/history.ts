import { NextApiRequest, NextApiResponse } from 'next';
import { CreditService } from '@lib/credit-service';
import { serializePrisma } from '@lib/prisma-serializer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'Missing wallet parameter' });
    }

    const normalizedWallet = wallet.toLowerCase();

    try {
        const history = await CreditService.getHistory(normalizedWallet);
        res.status(200).json({ history: serializePrisma(history) });
    } catch (error: any) {
        console.error('Error fetching credit history:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
