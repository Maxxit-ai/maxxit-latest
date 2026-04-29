import "dotenv/config";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";
import { normalizePrivateKey, requireEnv } from "../src/config.js";

const DEFAULT_PROVIDER = "0xa48f01287233509FD694a22Bf840225062E67836";
const MESSAGE = "Explain Bitcoin in one sentence.";

interface CliOptions {
  provider: string;
  message: string;
  minOg: string;
  model?: string;
  help: boolean;
}

interface ChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: unknown;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    provider: DEFAULT_PROVIDER,
    message: MESSAGE,
    minOg: "0.01",
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--provider") {
      options.provider = args[++i] || options.provider;
    } else if (arg === "--message") {
      options.message = args[++i] || options.message;
    } else if (arg === "--min") {
      options.minOg = args[++i] || options.minOg;
    } else if (arg === "--model") {
      options.model = args[++i];
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  npm run 0g:check:qwen -- --message "Reply with exactly: pong"
  npm run 0g:check:qwen -- --provider 0xProvider --min 0.01 --message "Say hi"

Options:
  --provider 0x...  Provider address. Defaults to Qwen 2.5 7B testnet provider.
  --min <OG>        Minimum provider sub-account balance required before querying. Default: 0.01.
  --model <name>    Override model. Defaults to provider metadata model.
  --message <text>  Message to send after balance checks pass.
`);
}

function createWallet(): Wallet {
  const provider = new JsonRpcProvider(
    process.env.ZG_COMPUTE_RPC_URL || "https://evmrpc-testnet.0g.ai"
  );
  return new Wallet(normalizePrivateKey(requireEnv("ZG_WALLET_PRIVATE_KEY")), provider);
}

function endpointCandidates(endpoint: string): string[] {
  const base = endpoint.replace(/\/$/, "");
  const candidates = [base];

  if (!base.endsWith("/chat/completions")) {
    candidates.push(`${base}/chat/completions`);
  }

  if (!base.endsWith("/v1/chat/completions")) {
    candidates.push(`${base}/v1/chat/completions`);
  }

  return Array.from(new Set(candidates));
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printUsage();
    return;
  }

  const wallet = createWallet();
  const minBalance = parseEther(options.minOg);
  const broker = await createZGComputeNetworkBroker(wallet);
  await broker.ledger.initialize();
  await broker.inference.initialize();

  console.log("Wallet:", wallet.address);
  console.log("Provider:", options.provider);

  const ledger = await broker.ledger.getLedger();
  console.log("Ledger available:", formatEther(ledger.availableBalance), "0G");
  console.log("Ledger total    :", formatEther(ledger.totalBalance), "0G");

  const balances = await broker.ledger.getProvidersWithBalance("inference");
  const providerBalance = balances.find(
    ([provider]) => provider.toLowerCase() === options.provider.toLowerCase()
  );

  if (!providerBalance) {
    throw new Error(
      `No inference sub-account found for provider. Fund it first with: npm run 0g:fund:provider -- --provider ${options.provider} --amount 2 --yes`
    );
  }

  const [, balance, pendingRefund] = providerBalance;
  console.log("Provider balance:", formatEther(balance), "0G");
  console.log("Pending refund  :", formatEther(pendingRefund), "0G");

  if (balance < minBalance) {
    throw new Error(
      `Provider sub-account balance is below ${options.minOg} 0G. Fund it first with: npm run 0g:fund:provider -- --provider ${options.provider} --amount 2 --yes`
    );
  }

  const metadata = await broker.inference.getServiceMetadata(options.provider);
  const model = options.model || metadata.model;
  console.log("Metadata endpoint:", metadata.endpoint);
  console.log("Model            :", model);

  const headers = await broker.inference.getRequestHeaders(options.provider, options.message);
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: options.message }],
    temperature: 0.2,
    max_tokens: 128,
  });

  let lastError = "";
  for (const endpoint of endpointCandidates(metadata.endpoint)) {
    console.log("\nTrying endpoint:", endpoint);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body,
      });

      const text = await res.text();
      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${text}`;
        console.log("Failed:", lastError);
        continue;
      }

      const data = JSON.parse(text) as ChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `Empty response: ${text}`;
        console.log("Failed:", lastError);
        continue;
      }

      const chatId = res.headers.get("ZG-Res-Key") || data.id;
      const verified = await broker.inference.processResponse(
        options.provider,
        chatId,
        data.usage ? JSON.stringify(data.usage) : undefined
      );

      console.log("\nStatus   : AVAILABLE");
      console.log("Verified :", verified ?? "skipped");
      console.log("Response :", content);
      return;
    } catch (error: any) {
      lastError = error.message;
      console.log("Failed:", lastError);
    }
  }

  throw new Error(`All endpoint attempts failed. Last error: ${lastError}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
