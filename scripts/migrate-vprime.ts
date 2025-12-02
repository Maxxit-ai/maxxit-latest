#!/usr/bin/env ts-node
/**
 * Vprime Migration
 * Add multi-venue support to existing V2 tables
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateVprime() {
  console.log('\n🚀 Vprime Migration - Multi-Venue Support\n');

  try {
    // 1. Add enabled_venues to agent_deployments
    console.log('[1/4] Adding enabled_venues to agent_deployments...');
    await prisma.$executeRaw`
      ALTER TABLE agent_deployments 
      ADD COLUMN IF NOT EXISTS enabled_venues TEXT[] DEFAULT ARRAY['HYPERLIQUID'];
    `;
    console.log('✅ enabled_venues added\n');

    // 2. Add Ostium credentials to agent_deployments
    console.log('[2/4] Adding Ostium credentials to agent_deployments...');
    await prisma.$executeRaw`
      ALTER TABLE agent_deployments 
      ADD COLUMN IF NOT EXISTS ostium_agent_address TEXT,
      ADD COLUMN IF NOT EXISTS ostium_agent_key_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS ostium_agent_key_iv TEXT,
      ADD COLUMN IF NOT EXISTS ostium_agent_key_tag TEXT;
    `;
    console.log('✅ Ostium credentials added\n');

    // 3. Add routing_history to signals
    console.log('[3/4] Adding routing_history to signals...');
    await prisma.$executeRaw`
      ALTER TABLE signals 
      ADD COLUMN IF NOT EXISTS routing_history JSONB;
    `;
    console.log('✅ routing_history added\n');

    // 4. Create agent_routing_history table (optional but recommended)
    console.log('[4/4] Creating agent_routing_history table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS agent_routing_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
        requested_venues TEXT[],
        selected_venue venue_t,
        routing_reason TEXT,
        checked_venues TEXT[],
        venue_availability JSONB,
        routing_duration_ms INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_routing_history_signal ON agent_routing_history(signal_id);`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_routing_history_venue ON agent_routing_history(selected_venue);`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_routing_history_created ON agent_routing_history(created_at);`;
    console.log('✅ agent_routing_history table created\n');

    // Verify changes
    console.log('📊 Verifying changes...\n');
    
    // Check enabled_venues field
    const deploymentColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'agent_deployments' 
      AND column_name IN ('enabled_venues', 'ostium_agent_address')
      ORDER BY column_name;
    `;
    
    console.log('agent_deployments new columns:');
    deploymentColumns.forEach(col => console.log(`  ✅ ${col.column_name}`));
    console.log();

    // Check signals routing_history field
    const signalColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'signals' 
      AND column_name = 'routing_history';
    `;
    
    if (signalColumns.length > 0) {
      console.log('signals table:');
      console.log('  ✅ routing_history');
      console.log();
    }

    // Check routing history table
    const routingTable = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = 'agent_routing_history';
    `;
    
    if (routingTable.length > 0) {
      console.log('New tables:');
      console.log('  ✅ agent_routing_history');
      console.log();
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VPRIME MIGRATION COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📋 Changes Applied:');
    console.log('  ✅ agent_deployments.enabled_venues (TEXT[])');
    console.log('  ✅ agent_deployments.ostium_agent_* (4 fields)');
    console.log('  ✅ signals.routing_history (JSONB)');
    console.log('  ✅ agent_routing_history table (full history)');
    console.log('');
    console.log('🎯 What\'s New:');
    console.log('  • Users can select multiple venues per deployment');
    console.log('  • Agent Where routing: Hyperliquid → Ostium → GMX → SPOT');
    console.log('  • Full routing transparency and history');
    console.log('  • Backward compatible with existing agents');
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
  migrateVprime()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { migrateVprime };

