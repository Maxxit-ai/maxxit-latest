#!/usr/bin/env tsx
/**
 * Track Ostium position closures on-chain
 */

import { ethers } from 'ethers';
import axios from 'axios';

// Arbitrum Sepolia RPC
const RPC_URL = process.env.OSTIUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Ostium Trading contract
const TRADING_CONTRACT = '0x2A9B9c988393f46a2537B0ff11E98c2C15a95afe';

// TradeClose event signature
const TRADE_CLOSE_EVENT = 'TradeClose(uint256,address,uint256,uint256)';
const TRADE_CLOSE_TOPIC = ethers.utils.id(TRADE_CLOSE_EVENT);

async function trackClosures(userAddress?: string) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           OSTIUM CLOSURE ACTIVITY TRACKER                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Get latest block
    const latestBlock = await provider.getBlockNumber();
    console.log(`Latest Block: ${latestBlock}`);
    console.log(`Network: Arbitrum Sepolia\n`);

    // Look back 50,000 blocks (~24 hours on Arbitrum)
    const fromBlock = latestBlock - 50000;
    console.log(`Searching blocks ${fromBlock} to ${latestBlock} (~last 24 hours)\n`);
    console.log('═'.repeat(80));

    // Get TradeClose events
    const filter = {
      address: TRADING_CONTRACT,
      topics: [TRADE_CLOSE_TOPIC],
      fromBlock,
      toBlock: 'latest'
    };

    console.log('\n🔍 Fetching TradeClose events...\n');
    const logs = await provider.getLogs(filter);

    if (logs.length === 0) {
      console.log('❌ No TradeClose events found in the last ~5 hours\n');
      return;
    }

    console.log(`✅ Found ${logs.length} TradeClose event(s)\n`);
    console.log('═'.repeat(80));

    // Parse events
    const iface = new ethers.utils.Interface([
      'event TradeClose(uint256 indexed tradeId, address indexed trader, uint256 indexed pairIndex, uint256 closePrice)'
    ]);

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      
      try {
        const parsed = iface.parseLog(log);
        const tradeId = parsed.args.tradeId.toString();
        const trader = parsed.args.trader;
        const pairIndex = parsed.args.pairIndex.toString();
        const closePrice = ethers.utils.formatUnits(parsed.args.closePrice, 18);

        // Get block timestamp
        const block = await provider.getBlock(log.blockNumber);
        const timestamp = new Date(block.timestamp * 1000);

        // Get transaction details
        const tx = await provider.getTransaction(log.transactionHash);

        console.log(`\n📊 CLOSURE #${i + 1}`);
        console.log('─'.repeat(80));
        console.log(`Trade ID:      ${tradeId}`);
        console.log(`Trader:        ${trader}`);
        console.log(`Pair Index:    ${pairIndex}`);
        console.log(`Close Price:   $${parseFloat(closePrice).toFixed(4)}`);
        console.log(`Block:         ${log.blockNumber}`);
        console.log(`Time:          ${timestamp.toISOString()}`);
        console.log(`Tx Hash:       ${log.transactionHash}`);
        console.log(`From (Agent):  ${tx.from}`);

        // Check if this matches the user we're looking for
        if (userAddress && trader.toLowerCase() === userAddress.toLowerCase()) {
          console.log(`\n✅ THIS IS YOUR POSITION!`);
        }

        // Get pair name from Ostium service
        try {
          const response = await axios.get('http://localhost:5002/markets');
          if (response.data.success) {
            const markets = response.data.markets;
            const pairName = Object.entries(markets).find(([, idx]) => idx === parseInt(pairIndex))?.[0];
            if (pairName) {
              console.log(`Market:        ${pairName}`);
            }
          }
        } catch (e) {
          // Ignore if service not available
        }

      } catch (parseError) {
        console.log(`\n⚠️  Could not parse log at block ${log.blockNumber}`);
      }
    }

    console.log('\n' + '═'.repeat(80));

    // Summary by user
    const userClosures = new Map<string, number>();
    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        const trader = parsed.args.trader.toLowerCase();
        userClosures.set(trader, (userClosures.get(trader) || 0) + 1);
      } catch (e) {
        // Skip
      }
    }

    console.log('\n📈 SUMMARY BY USER\n');
    for (const [trader, count] of userClosures.entries()) {
      console.log(`${trader}: ${count} position(s) closed`);
    }

    console.log('\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Run
const userAddress = process.argv[2];
if (userAddress) {
  console.log(`Filtering for user: ${userAddress}\n`);
}

trackClosures(userAddress);

