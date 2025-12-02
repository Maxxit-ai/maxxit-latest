/**
 * Approve Ostium Trading Contract to spend USDC
 */

const { ethers } = require('ethers');

const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY || '0xa72ec44934835f3f5d76a9957800d3a727b2fa2f634f6fcc6c58602c0621deef';
const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';

// Arbitrum Sepolia USDC address (from Ostium SDK)
const USDC_ADDRESS = '0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548';  // Ostium's USDC on Arbitrum Sepolia

// Ostium Trading STORAGE Contract (this is what SDK checks!)
const OSTIUM_TRADING_CONTRACT = '0x0b9F5243B29938668c9Cfbd7557A389EC7Ef88b8';

// ERC20 ABI (approve function)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

async function approveUSDC() {
  console.log('💰 Approving Ostium Trading Contract to spend USDC\n');
  
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
    
    console.log(`User Wallet: ${userWallet.address}`);
    console.log(`USDC Contract: ${USDC_ADDRESS}`);
    console.log(`Ostium Trading: ${OSTIUM_TRADING_CONTRACT}\n`);
    
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, userWallet);
    
    // Check current allowance
    const currentAllowance = await usdcContract.allowance(userWallet.address, OSTIUM_TRADING_CONTRACT);
    console.log(`Current Allowance: ${ethers.utils.formatUnits(currentAllowance, 6)} USDC`);
    
    if (currentAllowance.gt(ethers.utils.parseUnits('1000', 6))) {
      console.log('\n✅ Allowance already sufficient!');
      return;
    }
    
    // Approve max amount
    const maxAmount = ethers.constants.MaxUint256;
    
    console.log(`\nApproving unlimited USDC spending...`);
    const tx = await usdcContract.approve(OSTIUM_TRADING_CONTRACT, maxAmount);
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    console.log(`\n✅ SUCCESS!`);
    console.log(`   Transaction confirmed: ${receipt.hash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    
    // Check new allowance
    const newAllowance = await usdcContract.allowance(userWallet.address, OSTIUM_TRADING_CONTRACT);
    console.log(`\n📊 New Allowance: ${newAllowance.toString() === ethers.constants.MaxUint256.toString() ? 'UNLIMITED' : ethers.utils.formatUnits(newAllowance, 6) + ' USDC'}`);
    console.log(`\n🎉 Ostium can now trade with your USDC!`);
    
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.error) {
      console.error('Details:', error.error);
    }
    process.exit(1);
  }
}

approveUSDC();

