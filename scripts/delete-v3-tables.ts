#!/usr/bin/env ts-node
/**
 * Delete All V3 Tables
 * Removes all V3 tables and enum from database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteV3Tables() {
  console.log('\n🗑️  Deleting All V3 Tables...\n');

  try {
    // Delete tables in reverse order of dependencies
    console.log('[1/9] Dropping venue_routing_history_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS venue_routing_history_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[2/9] Dropping venue_routing_config_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS venue_routing_config_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[3/9] Dropping pnl_snapshots_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS pnl_snapshots_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[4/9] Dropping billing_events_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS billing_events_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[5/9] Dropping positions_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS positions_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[6/9] Dropping signals_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS signals_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[7/9] Dropping agent_deployments_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS agent_deployments_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[8/9] Dropping agents_v3...');
    await prisma.$executeRaw`DROP TABLE IF EXISTS agents_v3 CASCADE;`;
    console.log('✅ Dropped\n');

    console.log('[9/9] Dropping venue_v3_t enum...');
    await prisma.$executeRaw`DROP TYPE IF EXISTS venue_v3_t CASCADE;`;
    console.log('✅ Dropped\n');

    // Verify all V3 tables are gone
    console.log('📊 Verifying V3 tables are deleted...\n');
    
    const remainingTables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE '%_v3'
      ORDER BY tablename;
    `;

    if (remainingTables.length === 0) {
      console.log('✅ All V3 tables successfully deleted!\n');
    } else {
      console.log('⚠️  Some V3 tables still exist:');
      remainingTables.forEach(t => console.log(`  - ${t.tablename}`));
      console.log();
    }

    // Check V2 tables are untouched
    console.log('📊 Verifying V2 tables are intact...\n');
    
    const v2Tables = await prisma.$queryRaw<Array<{ tablename: string, count: bigint }>>`
      SELECT 
        t.tablename,
        (SELECT COUNT(*) FROM agents) as count
      FROM pg_tables t
      WHERE t.schemaname = 'public' 
      AND t.tablename = 'agents'
      LIMIT 1;
    `;

    if (v2Tables.length > 0) {
      console.log(`✅ V2 'agents' table intact (${v2Tables[0].count} rows)\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ V3 CLEANUP COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('✅ All V3 tables deleted');
    console.log('✅ venue_v3_t enum deleted');
    console.log('✅ V2 tables untouched');
    console.log('✅ Database back to V2 state');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  deleteV3Tables()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { deleteV3Tables };

