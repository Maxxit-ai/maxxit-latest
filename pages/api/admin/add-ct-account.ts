import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    console.log(`[AddCTAccount] Adding CT account: ${username}`);

    // Check if account already exists
    const existingAccount = await prisma.ctAccount.findFirst({
      where: { xUsername: username },
    });

    if (existingAccount) {
      return res.status(200).json({
        success: true,
        message: 'CT account already exists',
        account: existingAccount,
        alreadyExists: true,
      });
    }

    // Create new CT account
    const newAccount = await prisma.ctAccount.create({
      data: {
        xUsername: username,
        impactFactor: 0.0,
      },
    });

    console.log(`[AddCTAccount] Successfully added CT account: ${username}`);

    return res.status(201).json({
      success: true,
      message: 'CT account added successfully',
      account: newAccount,
    });

  } catch (error: any) {
    console.error('[AddCTAccount] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add CT account',
    });
  }
  // Note: Don't disconnect - using singleton
}
