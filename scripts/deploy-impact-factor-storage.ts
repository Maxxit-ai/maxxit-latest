/**
 * Deployment script for ImpactFactorStorage contract to Arbitrum L2
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-impact-factor-storage.ts --network arbitrum
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying ImpactFactorStorage contract...");
  console.log("Deployer address:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const ImpactFactorStorage = await ethers.getContractFactory("ImpactFactorStorage");
  const contract = await ImpactFactorStorage.deploy();

  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log("\n✅ ImpactFactorStorage deployed to:", address);
  console.log("\n📝 Add to your .env file:");
  console.log(`IMPACT_FACTOR_CONTRACT_ADDRESS=${address}`);
  
  // Verify ownership
  const owner = await contract.owner();
  console.log("\n👤 Contract owner:", owner);
  console.log("   Expected:", deployer.address);
  
  if (owner.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("✅ Owner verified!");
  } else {
    console.log("⚠️  Owner mismatch!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
