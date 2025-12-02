/**
 * Check Database Connection and Schema
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log('🔍 Checking database connection...\n');

  try {
    // Try to query agents using Prisma ORM
    console.log('📊 Attempting to query agents table...');
    const agents = await prisma.agents.findMany({
      take: 1,
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    console.log('✅ Successfully queried agents table!');
    console.log('Sample agent:', agents[0]);
    console.log('');

    // Check count by status
    console.log('📊 Counting agents by status...');
    const publicAgents = await prisma.agents.count({ where: { status: 'PUBLIC' } });
    const draftAgents = await prisma.agents.count({ where: { status: 'DRAFT' } });
    
    console.log(`PUBLIC agents: ${publicAgents}`);
    console.log(`DRAFT agents: ${draftAgents}`);
    
    // Try to count ACTIVE agents (old enum value)
    try {
      const activeAgents = await prisma.agents.count({ where: { status: 'ACTIVE' as any } });
      console.log(`ACTIVE agents (legacy): ${activeAgents}`);
    } catch (error: any) {
      console.log(`❌ Cannot query ACTIVE agents: ${error.message}`);
    }

    console.log('\n✅ Database connection is working!');

  } catch (error: any) {
    console.error('❌ Error querying database:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();

