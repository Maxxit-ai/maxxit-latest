import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const checks: any = {
    database: 'unknown',
  };

  try {
    await prisma.agent.findFirst({ take: 1 });
    checks.database = 'ok';
  } catch (error: any) {
    checks.database = 'error';
    checks.databaseError = error.message;
  }

  const allOk = checks.database === 'ok';

  return res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    checks,
  });
}
