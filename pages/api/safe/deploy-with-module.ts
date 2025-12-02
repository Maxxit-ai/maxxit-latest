/**
 * Deploy Safe with Module API
 * Creates a Safe account with trading module enabled in a single transaction
 * This endpoint returns the configuration for frontend to execute
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { prepareSafeDeployment } from '@lib/safe-deployment';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { ownerAddress, chainId = 42161 } = req.body;

    if (!ownerAddress || !ethers.utils.isAddress(ownerAddress)) {
      return res.status(400).json({
        error: 'Invalid owner address',
      });
    }

    console.log('[DeploySafe] Preparing Safe deployment for:', ownerAddress, 'on chain:', chainId);

    // Prepare Safe deployment configuration
    const deployment = prepareSafeDeployment({
      owner: ownerAddress,
      chainId,
      threshold: 1,
    });

    return res.status(200).json({
      success: true,
      deployment: {
        owners: deployment.config.owners,
        threshold: deployment.config.threshold,
        setupData: deployment.config.data,
        moduleAddress: deployment.moduleAddress,
        chainId,
      },
      message: 'Safe deployment configuration ready',
      instructions: {
        step1: 'Frontend will use Safe SDK to deploy Safe',
        step2: 'Safe will be created with trading module enabled',
        step3: 'User signs one transaction to deploy Safe with module',
      },
    });

  } catch (error: any) {
    console.error('[DeploySafe] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to prepare Safe deployment',
    });
  }
}

