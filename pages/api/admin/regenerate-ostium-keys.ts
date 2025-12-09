/**
 * Admin API: Regenerate Ostium Agent Keys
 * 
 * This endpoint regenerates Ostium agent addresses and re-encrypts private keys
 * using the correct scrypt derivation method.
 * 
 * POST /api/admin/regenerate-ostium-keys
 * Body: { userWallet?: string } // Optional - if not provided, regenerates all users
 */

import { getOrCreateOstiumAgentAddress } from '../../../lib/deployment-agent-address';
import { prisma } from '../../../lib/prisma';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userWallet } = req.body;

    if (userWallet) {
      // Regenerate for specific user
      const normalizedWallet = userWallet.toLowerCase();
      
      // Delete old Ostium address and keys
      await prisma.user_agent_addresses.update({
        where: { user_wallet: normalizedWallet },
        data: {
          ostium_agent_address: null,
          ostium_agent_key_encrypted: null,
          ostium_agent_key_iv: null,
          ostium_agent_key_tag: null,
        },
      });

      // Regenerate with correct scrypt encryption
      const result = await getOrCreateOstiumAgentAddress({
        userWallet: normalizedWallet,
      });

      return res.status(200).json({
        success: true,
        message: 'Ostium keys regenerated successfully',
        userWallet: normalizedWallet,
        newAddress: result.address,
        warning: 'User must re-whitelist this address on Ostium',
      });
    } else {
      // Regenerate for all users with Ostium addresses
      const users = await prisma.user_agent_addresses.findMany({
        where: {
          ostium_agent_address: { not: null },
        },
        select: {
          user_wallet: true,
          ostium_agent_address: true,
        },
      });

      const results = [];
      let errors = 0;

      for (const user of users) {
        try {
          // Delete old keys
          await prisma.user_agent_addresses.update({
            where: { user_wallet: user.user_wallet.toLowerCase() },
            data: {
              ostium_agent_address: null,
              ostium_agent_key_encrypted: null,
              ostium_agent_key_iv: null,
              ostium_agent_key_tag: null,
            },
          });

          // Regenerate
          const result = await getOrCreateOstiumAgentAddress({
            userWallet: user.user_wallet,
          });

          results.push({
            userWallet: user.user_wallet,
            oldAddress: user.ostium_agent_address,
            newAddress: result.address,
          });
        } catch (error: any) {
          errors++;
          results.push({
            userWallet: user.user_wallet,
            error: error.message,
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: `Regenerated keys for ${results.length} users`,
        results,
        errors,
        warning: 'Users must re-whitelist their new addresses on Ostium',
      });
    }
  } catch (error: any) {
    console.error('[RegenerateOstiumKeys] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to regenerate keys',
    });
  }
  // Note: Don't disconnect - using singleton
}

