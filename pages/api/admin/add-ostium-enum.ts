import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
/**
 * Admin endpoint to add OSTIUM to the venue_t enum
 * Safe to run multiple times (idempotent)
 * 
 * Usage: POST http://localhost:3000/api/admin/add-ostium-enum
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Checking if OSTIUM exists in venue_t enum...');

    // Check if OSTIUM already exists
    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'OSTIUM' 
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'venue_t'
      )
    `);

    if (result.length > 0) {
      console.log('✅ OSTIUM already exists in venue_t enum');
      return res.status(200).json({
        success: true,
        message: 'OSTIUM already exists in venue_t enum',
        alreadyExists: true,
      });
    }

    // Add OSTIUM to the enum
    console.log('➕ Adding OSTIUM to venue_t enum...');
    await prisma.$executeRawUnsafe(`
      ALTER TYPE venue_t ADD VALUE 'OSTIUM'
    `);

    console.log('✅ Successfully added OSTIUM to venue_t enum');

    return res.status(200).json({
      success: true,
      message: 'Successfully added OSTIUM to venue_t enum',
      alreadyExists: false,
    });
  } catch (error: any) {
    console.error('❌ Error adding OSTIUM to enum:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add OSTIUM to enum',
    });
  }
  // Note: Don't disconnect - using singleton
}

