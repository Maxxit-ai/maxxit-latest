/**
 * DEPRECATED: This endpoint is no longer used in the new flow
 * 
 * New flow uses:
 * - /api/agents/[id]/generate-deployment-address (to get user's agent address)
 * - /api/ostium/create-deployment (to create deployment)
 * 
 * Keeping this file for backward compatibility but returning error to migrate
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(410).json({
    error: 'This endpoint is deprecated',
    message: 'Please use the new deployment flow:',
    newFlow: {
      step1: 'POST /api/agents/:id/generate-deployment-address',
      step2: 'POST /api/ostium/create-deployment',
    },
    documentation: 'See AGENT_HOW_INTEGRATION.md for details',
  });
}

