import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('🚀 Deploying MaxxitTradingModuleV3...');

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);
  console.log('Account balance:', ethers.utils.formatEther(await deployer.getBalance()));

  // Contract configuration
  const config = {
    platformFeeReceiver: process.env.PLATFORM_FEE_RECEIVER || deployer.address,
    usdc: process.env.USDC_ADDRESS || '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum USDC
    uniswapV3Router: process.env.UNISWAP_V3_ROUTER || '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Arbitrum Uniswap V3
  };

  console.log('Configuration:', config);

  // Deploy contract
  const MaxxitTradingModuleV3 = await ethers.getContractFactory('MaxxitTradingModuleV3');
  const module = await MaxxitTradingModuleV3.deploy(
    config.platformFeeReceiver,
    config.usdc,
    config.uniswapV3Router
  );

  await module.deployed();

  console.log('✅ MaxxitTradingModuleV3 deployed to:', module.address);

  // Authorize executor
  const executorAddress = process.env.EXECUTOR_ADDRESS || deployer.address;
  console.log('🔐 Authorizing executor:', executorAddress);
  
  const tx = await module.authorizeExecutor(executorAddress, true);
  await tx.wait();
  console.log('✅ Executor authorized');

  // Save deployment info
  const deploymentInfo = {
    address: module.address,
    chainId: (await ethers.provider.getNetwork()).chainId,
    network: 'Arbitrum One',
    deployer: deployer.address,
    deploymentTx: tx.hash,
    platformFeeReceiver: config.platformFeeReceiver,
    usdc: config.usdc,
    uniswapV3Router: config.uniswapV3Router,
    executor: executorAddress,
    tradeFee: '0.2 USDC',
    profitShare: '20%',
    deployedAt: new Date().toISOString(),
    version: 'V3',
    features: [
      'SPOT Trading Only',
      'Uniswap V3 Integration',
      'Automatic Fee Collection',
      'Profit Sharing',
      'Capital Tracking',
      'Gasless Execution',
      'Pre-whitelisted Tokens'
    ]
  };

  // Save to deployments directory
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, 'v3-module.json');
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log('📄 Deployment info saved to:', deploymentFile);

  // Verify deployment
  console.log('🔍 Verifying deployment...');
  const platformFeeReceiver = await module.platformFeeReceiver();
  const usdc = await module.USDC();
  const router = await module.UNISWAP_V3_ROUTER();
  const isExecutorAuthorized = await module.authorizedExecutors(executorAddress);

  console.log('Verification results:');
  console.log('- Platform Fee Receiver:', platformFeeReceiver);
  console.log('- USDC Address:', usdc);
  console.log('- Uniswap V3 Router:', router);
  console.log('- Executor Authorized:', isExecutorAuthorized);

  console.log('🎉 Deployment completed successfully!');
  console.log('📋 Next steps:');
  console.log('1. Update environment variables with new contract address');
  console.log('2. Update frontend to use V3 contract');
  console.log('3. Test trading functionality');
  console.log('4. Deploy to production');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
