import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const key = process.env.AGENT_WALLET_ENCRYPTION_KEY;
  
  res.status(200).json({
    hasKey: !!key,
    keyLength: key?.length || 0,
    keyPreview: key ? key.substring(0, 20) + '...' : 'NOT SET',
  });
}

