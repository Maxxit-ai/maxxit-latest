/**
 * Script to add OSTIUM to the venue_t enum in the database
 * Safe to run multiple times (idempotent)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addOstiumEnum() {
  console.log('🔄 Adding OSTIUM to venue_t enum...');

  try {
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
      return;
    }

    // Add OSTIUM to the enum
    await prisma.$executeRawUnsafe(`
      ALTER TYPE venue_t ADD VALUE 'OSTIUM'
    `);

    console.log('✅ Successfully added OSTIUM to venue_t enum');
    console.log('');
    console.log('🎉 Database is now ready for Ostium agents!');
    console.log('   You can now create agents with venue="OSTIUM"');
  } catch (error: any) {
    console.error('❌ Error adding OSTIUM to enum:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addOstiumEnum()
  .then(() => {
    console.log('');
    console.log('Done! 🚀');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

