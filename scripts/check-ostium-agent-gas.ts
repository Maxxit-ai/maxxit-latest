#!/usr/bin/env tsx
/**
 * Check Ostium agent wallet ETH balances for gas
 */

import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Arbitrum Sepolia RPC
const RPC_URL = process.env.OSTIUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Minimum recommended balance for gas (0.001 ETH)
const MIN_BALANCE = ethers.utils.parseEther('0.001');
const RECOMMENDED_BALANCE = ethers.utils.parseEther('0.005');

async function checkAgentGasBalances() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           OSTIUM AGENT GAS BALANCE CHECK                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Get all unique Ostium agent addresses
    const agentAddresses = await prisma.user_agent_addresses.findMany({
      where: {
        ostium_agent_address: {
          not: null
        }
      },
      select: {
        ostium_agent_address: true,
        user_wallet: true,
      }
    });

    if (agentAddresses.length === 0) {
      console.log('❌ No Ostium agent addresses found in database\n');
      return;
    }

    console.log(`Found ${agentAddresses.length} Ostium agent address(es)\n`);
    console.log('═'.repeat(80));

    const needsFunding: Array<{address: string, balance: string, userWallet: string}> = [];

    for (const agent of agentAddresses) {
      if (!agent.ostium_agent_address) continue;

      const address = agent.ostium_agent_address;
      const userWallet = agent.user_wallet;

      try {
        // Get ETH balance
        const balance = await provider.getBalance(address);
        const balanceEth = ethers.utils.formatEther(balance);
        
        // Status indicators
        let status = '✅';
        let message = 'Good';
        
        if (balance.lt(MIN_BALANCE)) {
          status = '🔴';
          message = 'CRITICAL - Cannot execute transactions!';
          needsFunding.push({ address, balance: balanceEth, userWallet });
        } else if (balance.lt(RECOMMENDED_BALANCE)) {
          status = '⚠️ ';
          message = 'Low - Should top up soon';
          needsFunding.push({ address, balance: balanceEth, userWallet });
        }

        console.log(`\n${status} Agent: ${address}`);
        console.log(`   User:    ${userWallet}`);
        console.log(`   Balance: ${balanceEth} ETH`);
        console.log(`   Status:  ${message}`);

      } catch (error: any) {
        console.log(`\n❌ Agent: ${address}`);
        console.log(`   Error:  ${error.message}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 SUMMARY\n');
    console.log(`Total Agents:          ${agentAddresses.length}`);
    console.log(`Need Funding:          ${needsFunding.length}`);
    console.log(`Minimum Balance:       ${ethers.utils.formatEther(MIN_BALANCE)} ETH`);
    console.log(`Recommended Balance:   ${ethers.utils.formatEther(RECOMMENDED_BALANCE)} ETH`);

    if (needsFunding.length > 0) {
      console.log('\n🚨 AGENTS NEEDING FUNDING:\n');
      
      for (const agent of needsFunding) {
        const needed = RECOMMENDED_BALANCE.sub(ethers.utils.parseEther(agent.balance));
        console.log(`Agent:  ${agent.address}`);
        console.log(`User:   ${agent.userWallet}`);
        console.log(`Current: ${agent.balance} ETH`);
        console.log(`Needs:   ${ethers.utils.formatEther(needed)} ETH to reach recommended level`);
        console.log('');
      }

      console.log('💡 HOW TO FUND:\n');
      console.log('1. Get Arbitrum Sepolia testnet ETH from:');
      console.log('   https://faucet.quicknode.com/arbitrum/sepolia\n');
      console.log('2. Send 0.005 ETH to each agent address above\n');
      console.log('3. Or use the following script:');
      console.log('   npx tsx scripts/fund-ostium-agents.ts\n');
    } else {
      console.log('\n✅ All agent wallets have sufficient ETH for gas!\n');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgentGasBalances();

