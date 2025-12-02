#!/usr/bin/env ts-node
/**
 * Add MULTI to venue_t enum
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addMultiVenue() {
  console.log('\n✨ Adding MULTI venue to enum...\n');

  try {
    await prisma.$executeRaw`
      ALTER TYPE venue_t ADD VALUE IF NOT EXISTS 'MULTI';
    `;
    
    console.log('✅ MULTI added to venue_t enum\n');

    // Verify
    const venues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'venue_t')
      ORDER BY enumsortorder;
    `;

    console.log('Current venue_t values:');
    venues.forEach(v => console.log(`  • ${v.enumlabel}`));
    console.log();

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addMultiVenue()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
