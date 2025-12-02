#!/usr/bin/env tsx
/**
 * Update Ostium Delegation to New Agent Wallet
 * This signs a transaction to whitelist the new agent (with ETH)
 */

import { ethers } from 'ethers';

const OSTIUM_TRADING_CONTRACT = '0x2A9B9c988393f46a2537B0ff11E98c2C15a95afe';
const OSTIUM_TRADING_ABI = [
  'function setDelegate(address delegate) external',
];

const PLATFORM_WALLET = '0x3828dFCBff64fD07B963Ef11BafE632260413Ab3';
const NEW_AGENT_WALLET = '0xdef7EaB0e799D4d7e6902223F8A70A08a9b38F61';

async function updateDelegation() {
  console.log('🔄 Updating Ostium Delegation...\n');
  
  // Get platform wallet private key from env
  const platformKey = process.env.PLATFORM_WALLET_KEY;
  
  if (!platformKey) {
    console.error('❌ PLATFORM_WALLET_KEY not found in environment');
    console.error('   Set it with: export PLATFORM_WALLET_KEY=0x...');
    process.exit(1);
  }
  
  const provider = new ethers.providers.JsonRpcProvider(
    'https://sepolia-rollup.arbitrum.io/rpc'
  );
  
  const wallet = new ethers.Wallet(platformKey, provider);
  
  console.log('📋 Details:');
  console.log('   User Wallet:', wallet.address);
  console.log('   New Agent:', NEW_AGENT_WALLET);
  console.log('   Agent Balance: 0.008991164 ETH ✅');
  console.log('');
  
  const contract = new ethers.Contract(
    OSTIUM_TRADING_CONTRACT,
    OSTIUM_TRADING_ABI,
    wallet
  );
  
  console.log('📤 Calling setDelegate...');
  
  try {
    const tx = await contract.setDelegate(NEW_AGENT_WALLET);
    console.log('   Transaction sent:', tx.hash);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log('');
      console.log('✅ Delegation updated successfully!');
      console.log('   Block:', receipt.blockNumber);
      console.log('   Gas used:', receipt.gasUsed.toString());
      console.log('');
      console.log('🎉 Agent can now trade with ETH for gas!');
      console.log('');
      console.log('📋 View on Arbiscan:');
      console.log('   https://sepolia.arbiscan.io/tx/' + tx.hash);
    } else {
      console.log('');
      console.log('❌ Transaction failed');
    }
  } catch (error: any) {
    console.error('');
    console.error('❌ Error:', error.message);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('   Platform wallet needs ETH for gas!');
    }
  }
}

updateDelegation().catch(console.error);

