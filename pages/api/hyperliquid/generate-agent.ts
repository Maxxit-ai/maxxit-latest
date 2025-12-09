/**
 * Generate Unique Agent Wallet for Hyperliquid Trading
 * Creates a dedicated EOA wallet for each deployment
 * Private keys are encrypted and stored securely
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { ethers } from 'ethers';
import crypto from 'crypto';

// Encryption settings
const ENCRYPTION_KEY = process.env.AGENT_WALLET_ENCRYPTION_KEY;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
  console.error('[HyperliquidAgent] CRITICAL: AGENT_WALLET_ENCRYPTION_KEY not set in environment!');
}

/**
 * Encrypt private key using AES-256-GCM
 */
function encryptPrivateKey(privateKey: string): { encrypted: string; iv: string; tag: string } {
  if (!ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  // Hash the encryption key to get consistent 256-bit key
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deploymentId } = req.body;

    if (!deploymentId) {
      return res.status(400).json({ error: 'deploymentId required' });
    }

    // Check encryption key
    if (!ENCRYPTION_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error: Encryption key not set' 
      });
    }

    // Find deployment
    const deployment = await prisma.agent_deployments.findUnique({
      where: { id: deploymentId },
      include: { agents: true }
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    // Check if agent wallet already exists
    if (deployment.hyperliquid_agent_address) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        agentAddress: deployment.hyperliquid_agent_address,
        message: 'Agent wallet already registered for this deployment',
      });
    }

    // Generate new unique agent wallet
    const agentWallet = ethers.Wallet.createRandom();
    const agentAddress = agentWallet.address;
    const agentPrivateKey = agentWallet.privateKey;

    console.log('[HyperliquidAgent] Generated unique agent wallet:', agentAddress, 'for deployment:', deploymentId);

    // Encrypt private key
    const { encrypted, iv, tag } = encryptPrivateKey(agentPrivateKey);

    // Store encrypted private key in deployment record
    await prisma.agent_deployments.update({
      where: { id: deploymentId },
      data: {
        hyperliquid_agent_address: agentAddress,
        hyperliquid_agent_key_encrypted: encrypted,
        hyperliquid_agent_key_iv: iv,
        hyperliquid_agent_key_tag: tag,
      }
    });

    console.log('[HyperliquidAgent] ✅ Unique agent wallet registered and encrypted');

    return res.status(200).json({
      success: true,
      agentAddress,
      message: 'Unique agent wallet generated successfully',
      instructions: [
        '1. Go to Hyperliquid (testnet or mainnet)',
        '2. Navigate to Settings → API/Agent',
        `3. Add this agent address: ${agentAddress}`,
        '4. Agent will now be able to trade on your behalf (non-custodial)',
        '5. Agent CANNOT withdraw your funds (Hyperliquid security)'
      ]
    });
  } catch (error: any) {
    console.error('[HyperliquidAgent] Error generating agent:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to generate agent wallet' 
    });
  }
  // Note: Don't disconnect - using singleton
}

