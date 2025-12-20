import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const moduleAddress = process.env.TRADING_MODULE_ADDRESS || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';
    const fallbackAddress = '0x74437d894C8E8A5ACf371E10919c688ae79E89FA';
    
    return res.status(200).json({
      success: true,
      tradingModuleAddress: moduleAddress,
      fallbackAddress,
      isV3: moduleAddress === '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb',
      environment: {
        TRADING_MODULE_ADDRESS: process.env.TRADING_MODULE_ADDRESS,
        MODULE_ADDRESS: process.env.MODULE_ADDRESS,
      }
    });
  } catch (error: any) {
    console.error('[CheckModuleAddress] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check module address',
    });
  }
}
