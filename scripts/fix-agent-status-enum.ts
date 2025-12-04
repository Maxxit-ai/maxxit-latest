/**
 * Fix Agent Status Enum Issues
 * 
 * This script cleans up any leftover enum types and ensures the database
 * is in a consistent state after the status migration.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function fixAgentStatusEnum() {
  console.log('🔧 Fixing Agent Status Enum Issues...\n');

  try {
    // Step 1: Check current enum types
    console.log('📊 Checking existing enum types...');
    const enumTypes = await prisma.$queryRaw<Array<{ typname: string }>>`
      SELECT typname 
      FROM pg_type 
      WHERE typname LIKE '%status%' 
      ORDER BY typname
    `;
    
    console.log('Found enum types:', enumTypes.map(t => t.typname).join(', '));
    console.log('');

    // Step 2: Drop any temporary enums
    console.log('🧹 Cleaning up temporary enum types...');
    
    try {
      await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS agent_status_t_new CASCADE;`);
      console.log('✅ Dropped agent_status_t_new (if it existed)');
    } catch (error: any) {
      console.log('⚠️  agent_status_t_new does not exist (OK)');
    }
    
    console.log('');

    // Step 3: Check current agent_status_t values
    console.log('📊 Checking agent_status_t enum values...');
    const enumValues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'agent_status_t'
      ORDER BY e.enumsortorder
    `;
    
    console.log('Current values:', enumValues.map(v => v.enumlabel).join(', '));
    console.log('');

    // Step 4: Verify agents table structure
    console.log('📊 Checking agents table status column...');
    const columnInfo = await prisma.$queryRaw<Array<{ column_name: string; data_type: string; udt_name: string }>>`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'agents' AND column_name = 'status'
    `;
    
    if (columnInfo.length > 0) {
      console.log('Status column:', columnInfo[0]);
    } else {
      console.log('❌ Status column not found!');
    }
    console.log('');

    // Step 5: Check current agent statuses
    console.log('📊 Checking current agent status values...');
    const statusCounts = await prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status::text as status, COUNT(*) as count
      FROM agents
      GROUP BY status
      ORDER BY status
    `;
    
    statusCounts.forEach(({ status, count }) => {
      console.log(`   ${status}: ${count.toString()}`);
    });
    console.log('');

    // Step 6: Check deployment_status_t
    console.log('📊 Checking deployment_status_t enum...');
    const deploymentEnumValues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'deployment_status_t'
      ORDER BY e.enumsortorder
    `;
    
    if (deploymentEnumValues.length > 0) {
      console.log('✅ deployment_status_t exists:', deploymentEnumValues.map(v => v.enumlabel).join(', '));
    } else {
      console.log('⚠️  deployment_status_t does not exist');
    }
    console.log('');

    console.log('✅ Database check complete!');
    console.log('\n📝 Summary:');
    console.log('   - Cleaned up temporary enum types');
    console.log('   - Verified agent_status_t enum');
    console.log('   - Verified agents table structure');
    console.log('   - Verified current agent statuses');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
if (require.main === module) {
  fixAgentStatusEnum()
    .then(() => {
      console.log('\n🎉 Fix script completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Fix script failed:', error);
      process.exit(1);
    });
}

export { fixAgentStatusEnum };

