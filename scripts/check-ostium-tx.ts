#!/usr/bin/env tsx
/**
 * Check specific Ostium transaction details
 */

import { ethers } from 'ethers';

const RPC_URL = process.env.OSTIUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Transaction hashes from logs
const transactions = [
  '0x5470e347abf4df849bdccb0ec131716c4df64698f723dcd41743d3a09b31c6ae', // SOL close that worked
  '0xa4f33cd1753a7c572907c78347e3bec0c86a4b42830355e289c12004d1681a97', // HYPE close attempt
];

async function checkTransaction(txHash: string) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  TX: ${txHash}  ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!tx || !receipt) {
      console.log('❌ Transaction not found\n');
      return;
    }

    console.log('📋 Transaction Details:');
    console.log(`From:        ${tx.from}`);
    console.log(`To:          ${tx.to}`);
    console.log(`Block:       ${receipt.blockNumber}`);
    console.log(`Status:      ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
    console.log(`Gas Used:    ${receipt.gasUsed.toString()}`);
    console.log(`Logs:        ${receipt.logs.length} event(s)\n`);

    // Parse logs
    console.log('📊 Events:');
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`\n  Event #${i + 1}:`);
      console.log(`  Contract:  ${log.address}`);
      console.log(`  Topics:    ${log.topics.length}`);
      
      // Try to decode common events
      if (log.topics[0]) {
        const topic = log.topics[0];
        
        // Check for common Ostium events
        if (topic === ethers.utils.id('TradeClose(uint256,address,uint256,uint256)')) {
          console.log(`  Type:      TradeClose`);
          try {
            const iface = new ethers.utils.Interface([
              'event TradeClose(uint256 indexed tradeId, address indexed trader, uint256 indexed pairIndex, uint256 closePrice)'
            ]);
            const parsed = iface.parseLog(log);
            console.log(`  Trade ID:  ${parsed.args.tradeId.toString()}`);
            console.log(`  Trader:    ${parsed.args.trader}`);
            console.log(`  Pair ID:   ${parsed.args.pairIndex.toString()}`);
            console.log(`  Price:     ${ethers.utils.formatUnits(parsed.args.closePrice, 18)}`);
          } catch (e) {
            console.log(`  (Could not decode)`);
          }
        } else if (topic === ethers.utils.id('Transfer(address,address,uint256)')) {
          console.log(`  Type:      Transfer (USDC)`);
          try {
            const iface = new ethers.utils.Interface([
              'event Transfer(address indexed from, address indexed to, uint256 value)'
            ]);
            const parsed = iface.parseLog(log);
            console.log(`  From:      ${parsed.args.from}`);
            console.log(`  To:        ${parsed.args.to}`);
            console.log(`  Amount:    ${ethers.utils.formatUnits(parsed.args.value, 6)} USDC`);
          } catch (e) {
            console.log(`  (Could not decode)`);
          }
        } else {
          console.log(`  Type:      ${topic.slice(0, 10)}...`);
        }
      }
    }

    // Get block timestamp
    const block = await provider.getBlock(receipt.blockNumber);
    const timestamp = new Date(block.timestamp * 1000);
    console.log(`\n⏰ Time: ${timestamp.toISOString()}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

async function main() {
  const txHash = process.argv[2];
  
  if (txHash) {
    await checkTransaction(txHash);
  } else {
    console.log('Checking recent close transactions from logs...\n');
    for (const hash of transactions) {
      await checkTransaction(hash);
    }
  }
}

main();

