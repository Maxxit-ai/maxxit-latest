/**
 * Migration Script: Change Agent Status from ACTIVE/PAUSED to PUBLIC/PRIVATE
 * 
 * This script:
 * 1. Updates the agent_status_t enum to have PUBLIC and PRIVATE instead of ACTIVE and PAUSED
 * 2. Migrates existing agents: ACTIVE -> PUBLIC, PAUSED -> PRIVATE
 * 3. Updates the default value to PUBLIC
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function migrateAgentStatus() {
  console.log('🚀 Starting Agent Status Migration...\n');

  try {
    // Step 1: Check current status distribution
    console.log('📊 Current status distribution:');
    const currentStatuses = await prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status, COUNT(*) as count
      FROM agents
      GROUP BY status
      ORDER BY status
    `;
    
    currentStatuses.forEach(({ status, count }) => {
      console.log(`   ${status}: ${count.toString()}`);
    });
    console.log('');

    // Step 2: Update the enum type (PostgreSQL)
    console.log('🔄 Updating agent_status_t enum...');
    
    // Add new values to the enum
    await prisma.$executeRawUnsafe(`
      ALTER TYPE agent_status_t ADD VALUE IF NOT EXISTS 'PUBLIC';
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TYPE agent_status_t ADD VALUE IF NOT EXISTS 'PRIVATE';
    `);
    
    console.log('✅ New enum values added\n');

    // Step 3: Migrate existing data
    console.log('🔄 Migrating existing agents...');
    
    // ACTIVE -> PUBLIC
    const activeResult = await prisma.$executeRaw`
      UPDATE agents
      SET status = 'PUBLIC'::agent_status_t
      WHERE status = 'ACTIVE'::agent_status_t
    `;
    console.log(`   ✅ Migrated ${activeResult} ACTIVE agents to PUBLIC`);
    
    // PAUSED -> PRIVATE
    const pausedResult = await prisma.$executeRaw`
      UPDATE agents
      SET status = 'PRIVATE'::agent_status_t
      WHERE status = 'PAUSED'::agent_status_t
    `;
    console.log(`   ✅ Migrated ${pausedResult} PAUSED agents to PRIVATE\n`);

    // Step 4: Update default value
    console.log('🔄 Updating default value to PUBLIC...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agents
      ALTER COLUMN status SET DEFAULT 'PUBLIC'::agent_status_t
    `);
    console.log('✅ Default value updated\n');

    // Step 5: Remove old enum values (this requires all data to be migrated)
    console.log('🔄 Removing old enum values (ACTIVE, PAUSED)...');
    
    // First, drop the default value
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agents
      ALTER COLUMN status DROP DEFAULT;
    `);
    
    // Create a temporary enum with only the new values
    await prisma.$executeRawUnsafe(`
      CREATE TYPE agent_status_t_new AS ENUM ('DRAFT', 'PUBLIC', 'PRIVATE');
    `);
    
    // Update the column to use the new enum
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agents
      ALTER COLUMN status TYPE agent_status_t_new USING status::text::agent_status_t_new;
    `);
    
    // Drop the old enum and rename the new one
    await prisma.$executeRawUnsafe(`
      DROP TYPE agent_status_t;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TYPE agent_status_t_new RENAME TO agent_status_t;
    `);
    
    // Re-add the default value
    await prisma.$executeRawUnsafe(`
      ALTER TABLE agents
      ALTER COLUMN status SET DEFAULT 'PUBLIC'::agent_status_t;
    `);
    
    console.log('✅ Old enum values removed\n');

    // Step 6: Verify migration
    console.log('📊 Final status distribution:');
    const finalStatuses = await prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status, COUNT(*) as count
      FROM agents
      GROUP BY status
      ORDER BY status
    `;
    
    finalStatuses.forEach(({ status, count }) => {
      console.log(`   ${status}: ${count.toString()}`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - ACTIVE → PUBLIC ✓');
    console.log('   - PAUSED → PRIVATE ✓');
    console.log('   - Default: PUBLIC ✓');
    console.log('   - All agents are now PUBLIC by default');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
if (require.main === module) {
  migrateAgentStatus()
    .then(() => {
      console.log('\n🎉 Migration script completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateAgentStatus };

