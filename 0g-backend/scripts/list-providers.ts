import "dotenv/config";
import { listProviders } from "../src/compute.js";

async function main() {
  console.log("Connecting to 0G Compute network...\n");
  const services = await listProviders();

  if (!services || services.length === 0) {
    console.log("No providers found on testnet.");
    return;
  }

  console.log(`Found ${services.length} provider(s):\n`);
  for (const svc of services) {
    console.log("Provider Address  :", svc.provider);
    console.log("Model             :", svc.model ?? "unknown");
    console.log("Input price/token :", svc.inputPrice ?? "n/a");
    console.log("Output price/token:", svc.outputPrice ?? "n/a");
    console.log("---");
  }

  console.log("\nSet ZG_COMPUTE_PROVIDER_ADDRESS in 0g-backend/.env to one of the addresses above.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
