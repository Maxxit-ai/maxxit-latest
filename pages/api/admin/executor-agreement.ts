import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { verifyExecutorAgreement } from '@lib/executor-agreement';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { signalId, executorAgreement } = req.body;

    if (!signalId || !executorAgreement) {
      return res.status(400).json({ error: 'Signal ID and executor agreement are required' });
    }

    // Find the signal
    const signal = await prisma.signal.findUnique({
      where: { id: signalId }
    });

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    // Verify the executor agreement signature
    const isValid = verifyExecutorAgreement(
      executorAgreement.message,
      executorAgreement.signature,
      executorAgreement.executorWallet
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid executor agreement signature'
      });
    }

    // Update the signal with executor agreement
    await prisma.signal.update({
      where: { id: signalId },
      data: {
        executorAgreementMessage: executorAgreement.message,
        executorAgreementSignature: executorAgreement.signature,
        executorAgreementTimestamp: executorAgreement.timestamp,
        executorWallet: executorAgreement.executorWallet,
        executorAgreementVerified: true,
        executorAgreementError: null
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Executor agreement signed and verified successfully'
    });

  } catch (error: any) {
    console.error('[ExecutorAgreement] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
  // Note: Don't disconnect - using singleton
}
