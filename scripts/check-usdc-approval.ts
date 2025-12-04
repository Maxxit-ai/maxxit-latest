import { ethers } from 'ethers';

const userAddress = '0x482f913d4327e5f30ec4eb8301a0aeb4db5780f6';
const agentAddress = '0x51C1Ee6d50AEf0BaF1aCE997aa42D7d9758B37fd';

// Ostium Trading Contract on Arbitrum Sepolia
const OSTIUM_TRADING_CONTRACT = '0x2A9B9c988393f46a2537B0ff11E98c2C15a95afe';
// USDC on Arbitrum Sepolia
const USDC_TOKEN = '0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548';

// Arbitrum Sepolia RPC
const ARBITRUM_SEPOLIA_RPC = 'https://sepolia-rollup.arbitrum.io/rpc';
const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);

// USDC ABI (just the functions we need)
const USDC_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

async function checkApproval() {
  console.log('\n🔍 Checking USDC Approval Status...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`User Address: ${userAddress}`);
  console.log(`Agent Address: ${agentAddress}`);
  console.log(`Ostium Trading Contract: ${OSTIUM_TRADING_CONTRACT}\n`);
  
  const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, provider);
  
  try {
    // Check USDC balance
    console.log('📊 Checking USDC Balance...');
    const balance = await usdcContract.balanceOf(userAddress);
    const balanceFormatted = ethers.utils.formatUnits(balance, 6);
    console.log(`   Balance: ${balanceFormatted} USDC\n`);
    
    // Check allowance for Ostium Trading Contract
    console.log('🔐 Checking USDC Allowance...');
    console.log(`   Spender: ${OSTIUM_TRADING_CONTRACT} (Ostium Trading Contract)\n`);
    
    const allowance = await usdcContract.allowance(userAddress, OSTIUM_TRADING_CONTRACT);
    const allowanceFormatted = ethers.utils.formatUnits(allowance, 6);
    
    console.log(`   Current Allowance: ${allowanceFormatted} USDC`);
    
    // Check if sufficient (we need at least $1M for trading)
    const requiredAllowance = ethers.utils.parseUnits('1000000', 6); // $1M
    const isApproved = allowance.gte(requiredAllowance);
    
    console.log(`   Required: 1,000,000.00 USDC`);
    console.log(`   Status: ${isApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}\n`);
    
    if (!isApproved) {
      console.log('⚠️  USDC approval is insufficient or missing!');
      console.log('   The user needs to approve the Ostium Trading Contract to spend USDC.\n');
      console.log('   To approve:');
      console.log(`   1. Connect wallet: ${userAddress}`);
      console.log(`   2. Approve USDC token: ${USDC_TOKEN}`);
      console.log(`   3. Spender: ${OSTIUM_TRADING_CONTRACT}`);
      console.log(`   4. Amount: 1,000,000 USDC (or max)\n`);
    } else {
      console.log('✅ USDC is approved and ready for trading!\n');
    }
    
    // Also check allowance for agent address (though this shouldn't be needed for Ostium)
    console.log('🔐 Checking USDC Allowance for Agent Address...');
    console.log(`   Spender: ${agentAddress} (Agent Address)\n`);
    
    const agentAllowance = await usdcContract.allowance(userAddress, agentAddress);
    const agentAllowanceFormatted = ethers.utils.formatUnits(agentAllowance, 6);
    
    console.log(`   Current Allowance: ${agentAllowanceFormatted} USDC`);
    console.log(`   Note: Agent address approval is NOT needed for Ostium delegation model\n`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Summary
    console.log('📋 Summary:\n');
    console.log(`   User Wallet: ${userAddress}`);
    console.log(`   USDC Balance: ${balanceFormatted} USDC`);
    console.log(`   Trading Contract Allowance: ${allowanceFormatted} USDC`);
    console.log(`   Approval Status: ${isApproved ? '✅ APPROVED' : '❌ NOT APPROVED'}\n`);
    
  } catch (error: any) {
    console.error('❌ Error checking approval:', error.message);
    console.error('   Make sure you\'re connected to Arbitrum Sepolia network');
  }
}

if (require.main === module) {
  checkApproval().catch(console.error);
}

export { checkApproval };









