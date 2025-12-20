import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { verifyProofOfIntent } from '@lib/proof-of-intent';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId, message, signature, creatorWallet } = req.body;

    if (!agentId || !message || !signature || !creatorWallet) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // Verify the signature
    const verificationResult = await verifyProofOfIntent(
      message,
      signature,
      creatorWallet
    );

    if (!verificationResult.isValid) {
      return res.status(400).json({
        success: false,
        error: verificationResult.error
      });
    }

    // Update the agent with proof of intent data
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        proofOfIntentMessage: message,
        proofOfIntentSignature: signature,
        proofOfIntentTimestamp: new Date(),
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Proof of intent verified and stored successfully'
    });

  } catch (error: any) {
    console.error('[VerifyProofOfIntent] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify proof of intent'
    });
  }
  // Note: Don't disconnect - using singleton
}
