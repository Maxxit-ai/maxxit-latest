import "dotenv/config";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { normalizePrivateKey, requireEnv } from "../src/config.js";
import { listProviders } from "../src/compute.js";

interface CliOptions {
  provider?: string;
  all: boolean;
  amountOg: string;
  ledgerOg: number;
  yes: boolean;
  help: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    all: false,
    amountOg: "1",
    ledgerOg: 5,
    yes: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--provider") {
      options.provider = args[++i];
    } else if (arg === "--amount") {
      options.amountOg = args[++i] || options.amountOg;
    } else if (arg === "--ledger") {
      options.ledgerOg = Number(args[++i] || options.ledgerOg);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  npm run 0g:fund:provider -- --provider 0xProvider --amount 1 --ledger 5 --yes
  npm run 0g:fund:provider -- --all --amount 1 --ledger 5 --yes

Options:
  --provider 0x...   Provider address to fund. Defaults to ZG_COMPUTE_PROVIDER_ADDRESS.
  --all              Fund every non-image testnet inference provider.
  --amount <OG>      Amount to transfer to each provider sub-account. Default: 1.
  --ledger <OG>      Initial ledger balance if ledger does not exist. Default: 5.
  --yes              Required to submit transactions.
`);
}

function createWallet(): Wallet {
  const provider = new JsonRpcProvider(
    process.env.ZG_COMPUTE_RPC_URL || "https://evmrpc-testnet.0g.ai"
  );
  return new Wallet(normalizePrivateKey(requireEnv("ZG_WALLET_PRIVATE_KEY")), provider);
}

async function ensureLedger(broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>>, ledgerOg: number) {
  try {
    const ledger = await broker.ledger.getLedger();
    console.log("Ledger exists");
    console.log("Ledger available balance:", formatEther(ledger.availableBalance), "0G");
    console.log("Ledger total balance:", formatEther(ledger.totalBalance), "0G");
  } catch (error: any) {
    console.log("Ledger not found; creating ledger with", ledgerOg, "0G...");
    await broker.ledger.addLedger(ledgerOg);
    console.log("Ledger created");
  }
}

async function resolveProviders(options: CliOptions): Promise<string[]> {
  if (options.provider) {
    return [options.provider];
  }

  if (process.env.ZG_COMPUTE_PROVIDER_ADDRESS && !options.all) {
    return [process.env.ZG_COMPUTE_PROVIDER_ADDRESS];
  }

  if (!options.all) {
    throw new Error(
      "Provide --provider 0x..., set ZG_COMPUTE_PROVIDER_ADDRESS, or pass --all"
    );
  }

  const providers = await listProviders(true);
  return providers
    .filter((provider) => !provider.model?.toLowerCase().includes("image"))
    .map((provider) => provider.provider);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    return;
  }

  if (!options.yes) {
    printUsage();
    throw new Error("Refusing to submit transactions without --yes");
  }

  const wallet = createWallet();
  const amountNeuron = parseEther(options.amountOg);

  console.log("Wallet:", wallet.address);
  console.log("Funding amount per provider:", options.amountOg, "0G");

  const broker = await createZGComputeNetworkBroker(wallet);
  await broker.ledger.initialize();
  await broker.inference.initialize();

  await ensureLedger(broker, options.ledgerOg);

  const providers = await resolveProviders(options);
  console.log("Providers to fund:", providers.length);

  for (const provider of providers) {
    console.log(`\nFunding inference sub-account for ${provider}...`);
    await broker.ledger.transferFund(provider, "inference", amountNeuron);
    console.log("Funded", provider, "with", options.amountOg, "0G");
  }

  const balances = await broker.ledger.getProvidersWithBalance("inference");
  console.log("\nInference provider balances:");
  for (const [provider, balance, pendingRefund] of balances) {
    console.log(provider, "balance:", formatEther(balance), "0G", "pendingRefund:", formatEther(pendingRefund), "0G");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
