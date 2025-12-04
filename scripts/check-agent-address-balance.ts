/**
 * Check Agent Address Balance
 * 
 * Checks ETH balance of agent addresses for gas fees
 * Agent addresses need ETH to pay for gas when executing trades
 */

import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

// Arbitrum Sepolia RPC
const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Minimum ETH needed for gas (0.001 ETH = ~$2-3)
const MIN_ETH_FOR_GAS = ethers.utils.parseEther('0.001');

async function checkAgentAddressBalances() {
  console.log('\n🔍 Checking Agent Address Balances...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Get all user agent addresses
    const userAddresses = await prisma.user_agent_addresses.findMany({
      select: {
        user_wallet: true,
        hyperliquid_agent_address: true,
        ostium_agent_address: true,
      },
    });

    console.log(`Found ${userAddresses.length} user(s) with agent addresses\n`);

    for (const addr of userAddresses) {
      console.log(`User: ${addr.user_wallet}`);
      
      // Check Hyperliquid address
      if (addr.hyperliquid_agent_address) {
        const balance = await provider.getBalance(addr.hyperliquid_agent_address);
        const balanceEth = parseFloat(ethers.utils.formatEther(balance));
        const hasEnough = balance.gte(MIN_ETH_FOR_GAS);
        
        console.log(`  Hyperliquid Agent: ${addr.hyperliquid_agent_address}`);
        console.log(`    Balance: ${balanceEth.toFixed(6)} ETH`);
        console.log(`    Status: ${hasEnough ? '✅ Sufficient' : '❌ Insufficient (needs ~0.001 ETH)'}`);
        
        if (!hasEnough) {
          console.log(`    ⚠️  Fund this address with ETH for gas fees`);
        }
      }
      
      // Check Ostium address
      if (addr.ostium_agent_address) {
        const balance = await provider.getBalance(addr.ostium_agent_address);
        const balanceEth = parseFloat(ethers.utils.formatEther(balance));
        const hasEnough = balance.gte(MIN_ETH_FOR_GAS);
        
        console.log(`  Ostium Agent: ${addr.ostium_agent_address}`);
        console.log(`    Balance: ${balanceEth.toFixed(6)} ETH`);
        console.log(`    Status: ${hasEnough ? '✅ Sufficient' : '❌ Insufficient (needs ~0.001 ETH)'}`);
        
        if (!hasEnough) {
          console.log(`    ⚠️  Fund this address with ETH for gas fees`);
          console.log(`    💡 Send ETH from your wallet: ${addr.user_wallet}`);
        }
      }
      
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 How to Fund Agent Addresses:');
    console.log('  1. Copy the agent address that needs funding');
    console.log('  2. Send ~0.001 ETH (or more) from your wallet to the agent address');
    console.log('  3. Use Arbitrum Sepolia network');
    console.log('  4. Agent address will use this ETH to pay for gas when trading\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  checkAgentAddressBalances().catch(console.error);
}

export { checkAgentAddressBalances };









