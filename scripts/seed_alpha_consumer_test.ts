/**
 * Seed script for Alpha Consumer Flow testing
 *
 * Two modes (set SEED_MODE env var):
 *
 *   full (default)    — Creates everything: API key, consumer agent, producer data.
 *                       Needs TEST_WALLET. Use when starting from scratch.
 *
 *   minimal           — Only creates producer data (agent, proof, listing).
 *                       Use your existing API key and agent.
 *
 * Examples:
 *   SEED_MODE=full    TEST_WALLET=0xYourAddress npx tsx scripts/seed_alpha_consumer_test.ts
 *   SEED_MODE=minimal npx tsx scripts/seed_alpha_consumer_test.ts
 */

import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { getOrCreateOstiumAgentAddress } from "../lib/deployment-agent-address";

const prisma = new PrismaClient() as any;

const SEED_MODE = "minimal".toLowerCase();
// const SEED_MODE = (process.env.SEED_MODE || "full").toLowerCase();
const isFullMode = SEED_MODE === "full";

async function seed() {
  let rawApiKey: string | null = null;
  let ostiumAgentAddress: string | null = null;
  let normalizedWallet: string | null = null;

  // ── Full mode: consumer setup (API key + agent) ─────────────────────────────
  if (isFullMode) {
    const YOUR_WALLET = process.env.TEST_WALLET || "0xYOUR_WALLET_ADDRESS_HERE";

    if (YOUR_WALLET === "0xYOUR_WALLET_ADDRESS_HERE") {
      console.error("\n❌ Full mode requires TEST_WALLET. Run with:");
      console.error(
        "   SEED_MODE=full TEST_WALLET=0xYourAddress npx tsx scripts/seed_alpha_consumer_test.ts\n",
      );
      process.exit(1);
    }

    normalizedWallet = YOUR_WALLET.toLowerCase();

    // Create API Key
    rawApiKey = "mxxt_test_" + randomBytes(16).toString("hex");
    const keyHash = createHash("sha256").update(rawApiKey).digest("hex");

    await prisma.user_api_keys.create({
      data: {
        user_wallet: normalizedWallet,
        key_hash: keyHash,
        key_prefix: rawApiKey.slice(0, 12),
      },
    });

    console.log("\n=== SAVE THIS API KEY (you'll need it for every request) ===");
    console.log("API Key:", rawApiKey);
    console.log("Wallet: ", YOUR_WALLET);
    console.log("============================================================\n");

    // Create Consumer's Ostium Agent (required for POST /pay)
    console.log("Creating consumer agent address for POST /pay...");
    const result = await getOrCreateOstiumAgentAddress({
      userWallet: normalizedWallet,
    });
    ostiumAgentAddress = result.address;
    console.log("Consumer agent (ostium_agent_address):", ostiumAgentAddress);
    console.log(
      "⛔ FUND THIS ADDRESS with Arbitrum Sepolia USDC (e.g. 10 USDC)\n",
    );
  } else {
    console.log("\n=== SEED_MODE=minimal: Using your existing API key and agent ===\n");
  }

  // ── Producer: Create agent + proof + listing ─────────────────────────────
  const producerWallet = "0x7e3D3Ce78D53AaA557f38a9618976c230AEd9988"; // Fake producer for testing
  const salt = randomBytes(16).toString("hex");
  const commitment = createHash("sha256")
    .update(producerWallet + salt)
    .digest("hex");

  const agent = await prisma.agents.create({
    data: {
      creator_wallet: producerWallet,
      name: "Manual Test Producer Agent",
      description: "Seeded for manual alpha consumer testing",
      venue: "OSTIUM",
      weights: [50, 50, 50, 50, 50, 50, 50, 50],
      profit_receiver_address: producerWallet,
      status: "PUBLIC",
      commitment,
      salt_encrypted: salt,
    },
  });

  await prisma.agent_deployments.create({
    data: {
      agent_id: agent.id,
      user_wallet: producerWallet,
      safe_wallet: producerWallet,
      status: "ACTIVE",
      is_testnet: true,
    },
  });

  await prisma.proof_records.create({
    data: {
      agent_id: agent.id,
      commitment,
      status: "VERIFIED",
      total_pnl: 1500.0,
      trade_count: 50,
      win_count: 32,
      total_collateral: 8000.0,
      verified_at: new Date(),
    },
  });

  const sortKeys = (obj: any): any => {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, k: string) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  };

  const alphaContent = {
    token: "BTC",
    side: "LONG",
    leverage: 15,
    venue: "OSTIUM",
    entryPrice: 68500.12,
    collateralUsdc: 100,
    positionPct: 2500,
    timestamp: new Date().toISOString(),
  };

  const contentHash = createHash("sha256")
    .update(JSON.stringify(sortKeys(alphaContent)))
    .digest("hex");

  const listing = await prisma.alpha_listings.create({
    data: {
      agent_id: agent.id,
      commitment,
      token: "BTC",
      side: "LONG",
      leverage: 15,
      position_pct: 2500,
      price_usdc: 5.0,
      content_hash: contentHash,
      alpha_content: alphaContent,
      active: true,
    },
  });

  console.log("Producer agent:  ", agent.id);
  console.log("Commitment:     ", commitment);
  console.log("Listing ID:     ", listing.id);
  console.log("Price:          5 USDC");
  console.log("Content:        BTC LONG 15x\n");

  console.log("=== SEED COMPLETE ===");
  console.log("\nValues you'll need:");
  console.log("  Listing ID:     ", listing.id);
  console.log("  Commitment:     ", commitment);
  if (isFullMode && rawApiKey && ostiumAgentAddress) {
    console.log("  API Key:        ", rawApiKey);
    console.log("  Agent address   ", ostiumAgentAddress, "(fund with USDC!)");
    console.log("\nNext steps:");
    console.log(
      "  1. Fund",
      ostiumAgentAddress,
      "with testnet USDC (Arbitrum Sepolia faucet)",
    );
    console.log("  2. npm run dev");
  } else {
    console.log("\nNext steps:");
    console.log("  1. Use your existing API key and agent");
    console.log("  2. npm run dev");
  }
  console.log(
    "  3. Follow docs/ALPHA_CONSUMER_TESTING_GUIDE.md Step 1 → Step 5\n",
  );

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
