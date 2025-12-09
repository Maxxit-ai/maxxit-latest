import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id, accountId } = req.query;

  if (!id || typeof id !== 'string' || !accountId || typeof accountId !== 'string') {
    return res.status(400).json({ error: 'Agent ID and Account ID are required' });
  }

  try {
    switch (req.method) {
      case 'DELETE':
        return await handleDelete(id, accountId, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error(`[API /agents/${id}/accounts/${accountId}] Error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleDelete(agentId: string, ctAccountId: string, req: NextApiRequest, res: NextApiResponse) {
  // Check if link exists
  const existing = await prisma.agentAccount.findUnique({
    where: {
      agentId_ctAccountId: {
        agentId,
        ctAccountId,
      },
    },
  });

  if (!existing) {
    return res.status(404).json({ error: 'Link not found' });
  }

  // Delete the link
  await prisma.agentAccount.delete({
    where: {
      agentId_ctAccountId: {
        agentId,
        ctAccountId,
      },
    },
  });

  return res.status(204).end();
}
