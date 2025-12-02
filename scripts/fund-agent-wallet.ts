/**
 * Fund Agent Wallet with ETH for Gas
 */

const { ethers } = require('ethers');

const USER_PRIVATE_KEY = process.env.USER_PRIVATE_KEY || '0xa72ec44934835f3f5d76a9957800d3a727b2fa2f634f6fcc6c58602c0621deef';
const AGENT_WALLET = '0xdef7EaB0e799D4d7e6902223F8A70A08a9b38F61';
const RPC_URL = 'https://sepolia-rollup.arbitrum.io/rpc';

async function fundAgentWallet() {
  console.log('💰 Funding Agent Wallet with ETH\n');
  
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
    
    console.log(`From: ${userWallet.address}`);
    console.log(`To: ${AGENT_WALLET}`);
    
    // Check balance
    const balance = await provider.getBalance(userWallet.address);
    console.log(`User Balance: ${ethers.utils.formatEther(balance)} ETH\n`);
    
    // Send 0.01 ETH to agent for gas
    const amount = ethers.utils.parseEther('0.01');
    
    console.log(`Sending ${ethers.utils.formatEther(amount)} ETH to agent...`);
    const tx = await userWallet.sendTransaction({
      to: AGENT_WALLET,
      value: amount,
    });
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    console.log(`\n✅ SUCCESS!`);
    console.log(`   Transaction confirmed: ${receipt?.hash}`);
    console.log(`   Block: ${receipt?.blockNumber}`);
    
    // Check agent balance
    const agentBalance = await provider.getBalance(AGENT_WALLET);
    console.log(`\n📊 Agent Balance: ${ethers.utils.formatEther(agentBalance)} ETH`);
    
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    process.exit(1);
  }
}

fundAgentWallet();

