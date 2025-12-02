#!/usr/bin/env tsx
/**
 * Query Ostium positions with detailed trade indices from smart contract
 */

import { ethers } from 'ethers';

const RPC_URL = process.env.OSTIUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Ostium Trading Storage contract - this holds the actual trade data
const TRADING_STORAGE = '0x0B9f5243B29938668c9Cfbd7557A389EC7Ef88b8';

// Minimal ABI for querying trades
const STORAGE_ABI = [
  'function openTrades(address trader, uint256 pairIndex, uint256 index) external view returns (tuple(address trader, uint256 pairIndex, uint256 index, uint256 positionSizeAsset, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl) trade)',
  'function openTradesCount(address trader, uint256 pairIndex) external view returns (uint256)',
];

async function queryTrades(userAddress: string) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         QUERY OSTIUM TRADES FROM STORAGE CONTRACT             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    const contract = new ethers.Contract(TRADING_STORAGE, STORAGE_ABI, provider);
    const checksumAddress = ethers.utils.getAddress(userAddress);

    console.log(`User: ${checksumAddress}`);
    console.log(`Storage Contract: ${TRADING_STORAGE}\n`);
    console.log('═'.repeat(80));

    // Common pair indices for testing
    const pairs = [
      { id: 1, name: 'ETH/USD' },
      { id: 9, name: 'SOL/USD' },
      { id: 39, name: 'XRP/USD' },
      { id: 41, name: 'HYPE/USD' },
      { id: 8, name: 'XAG/USD' },
      { id: 25, name: 'USD/CHF' },
    ];

    let totalFound = 0;

    for (const pair of pairs) {
      try {
        // Get count of open trades for this pair
        const count = await contract.openTradesCount(checksumAddress, pair.id);
        const countNum = count.toNumber();

        if (countNum > 0) {
          console.log(`\n📊 ${pair.name} (Pair ${pair.id}): ${countNum} position(s)`);
          console.log('─'.repeat(80));

          // Query each trade by index
          for (let i = 0; i < countNum; i++) {
            try {
              const trade = await contract.openTrades(checksumAddress, pair.id, i);
              
              console.log(`\n  Position Index: ${i}`);
              console.log(`  Trader:         ${trade.trader}`);
              console.log(`  Pair Index:     ${trade.pairIndex}`);
              console.log(`  Trade Index:    ${trade.index.toString()}`);
              console.log(`  Position Size:  ${ethers.utils.formatUnits(trade.positionSizeAsset, 18)} tokens`);
              console.log(`  Open Price:     $${ethers.utils.formatUnits(trade.openPrice, 18)}`);
              console.log(`  Side:           ${trade.buy ? 'LONG' : 'SHORT'}`);
              console.log(`  Leverage:       ${trade.leverage.toNumber() / 100}x`);
              console.log(`  Take Profit:    ${trade.tp.toString() === '0' ? 'Not set' : '$' + ethers.utils.formatUnits(trade.tp, 18)}`);
              console.log(`  Stop Loss:      ${trade.sl.toString() === '0' ? 'Not set' : '$' + ethers.utils.formatUnits(trade.sl, 18)}`);

              totalFound++;
            } catch (tradeError: any) {
              console.log(`  ❌ Could not fetch trade at index ${i}: ${tradeError.message}`);
            }
          }
        }
      } catch (error: any) {
        // Pair might not exist or have no trades - skip silently
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`\n📈 Total Positions Found: ${totalFound}\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

const userAddress = process.argv[2] || '0xa10846a81528d429b50b0dcbf8968938a572fac5';
queryTrades(userAddress);

