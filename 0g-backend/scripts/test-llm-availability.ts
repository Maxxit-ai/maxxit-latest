import "dotenv/config";
import { listProviders, queryZgCompute } from "../src/compute.js";

const INCLUDE_NON_CHAT = process.argv.includes("--include-non-chat");
const INCLUDE_UNACKNOWLEDGED = !process.argv.includes("--acknowledged-only");
const prompt =
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .join(" ")
    .trim() || "Reply with exactly: pong";

function isLikelyChatModel(model?: string): boolean {
  if (!model) return false;
  const normalized = model.toLowerCase();
  return !normalized.includes("image") && !normalized.includes("vision");
}

async function main() {
  console.log("Discovering 0G testnet providers...\n");
  const providers = await listProviders(INCLUDE_UNACKNOWLEDGED);

  if (!providers.length) {
    console.log("No providers found.");
    return;
  }

  const candidates = INCLUDE_NON_CHAT
    ? providers
    : providers.filter((provider) => isLikelyChatModel(provider.model));

  console.log(`Found ${providers.length} provider(s); testing ${candidates.length} LLM candidate(s).\n`);

  for (const provider of candidates) {
    const startedAt = Date.now();
    console.log(`Testing ${provider.model || "unknown"} (${provider.provider})`);

    try {
      const result = await queryZgCompute(
        [
          {
            role: "user",
            content: prompt,
          },
        ],
        provider.model,
        provider.provider
      );

      console.log("Status    : AVAILABLE");
      console.log("Model     :", result.model);
      console.log("Verified  :", result.verified ?? "skipped");
      console.log("Latency ms:", Date.now() - startedAt);
      console.log("Response  :", result.content.replace(/\s+/g, " ").slice(0, 240));
    } catch (error: any) {
      console.log("Status    : UNAVAILABLE");
      console.log("Error     :", error.message);
    }

    console.log("---");
  }

  if (!INCLUDE_NON_CHAT) {
    console.log("Skipped non-chat models. Re-run with --include-non-chat to test every provider.");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
