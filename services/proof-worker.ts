import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { generateProof, submitProofToRegistry } from "../lib/zk-prover";

config();

const prismaClient = prisma as any;

const POLL_INTERVAL_MS = 15_000;
const MAX_BATCH_SIZE = 5;
const STALE_PROVING_MINUTES = 10;
const SUPPORTED_STATUSES = ["PENDING", "PROVING"] as const;

let isShuttingDown = false;
let loopHandle: NodeJS.Timeout | null = null;

function hasRequiredConfiguration(): boolean {
  const requiredKeys = [
    "DATABASE_URL",
    "SP1_PROVER_MODE",
    "SP1_HOST_BINARY",
    "SP1_PRIVATE_KEY",
    "TRADER_REGISTRY_ADDRESS",
    "ARBITRUM_SEPOLIA_RPC",
  ];

  const missingKeys = requiredKeys.filter((key) => !process.env[key]);
  if (missingKeys.length > 0) {
    console.error(
      `[proof-worker] Missing required environment variables: ${missingKeys.join(", ")}`
    );
    return false;
  }

  return true;
}

async function resetStaleProvingRecords(): Promise<number> {
  const staleCutoff = new Date(Date.now() - STALE_PROVING_MINUTES * 60_000);

  const staleRecords = await prismaClient.proof_records.findMany({
    where: {
      status: "PROVING",
      created_at: { lt: staleCutoff },
      verified_at: null,
    },
    select: { id: true },
    take: MAX_BATCH_SIZE,
  });

  if (staleRecords.length === 0) {
    return 0;
  }

  const staleIds = staleRecords.map((record: { id: string }) => record.id);
  const result = await prismaClient.proof_records.updateMany({
    where: {
      id: { in: staleIds },
      status: "PROVING",
    },
    data: { status: "PENDING" },
  });

  if (result.count > 0) {
    console.warn(
      `[proof-worker] Reset ${result.count} stale PROVING records back to PENDING`
    );
  }

  return result.count;
}

async function processProofRecord(proofId: string, wallet: string): Promise<void> {
  console.log(`[proof-worker] Processing proof ${proofId} for wallet ${wallet}`);

  const proofResult = await generateProof(wallet);
  if (!proofResult.success) {
    await prismaClient.proof_records.update({
      where: { id: proofId },
      data: { status: "FAILED" },
    });
    throw new Error(proofResult.error || "Proof generation failed");
  }

  let txHash = proofResult.txHash;
  if (!proofResult.isSimulated && proofResult.proof && proofResult.publicValues) {
    txHash = await submitProofToRegistry(proofResult.publicValues, proofResult.proof);
  }

  const now = new Date();
  await prismaClient.proof_records.update({
    where: { id: proofId },
    data: {
      status: "VERIFIED",
      brevis_request_id: proofResult.proofId,
      total_pnl: proofResult.metrics.totalPnl,
      trade_count: proofResult.metrics.tradeCount,
      win_count: proofResult.metrics.winCount,
      total_collateral: proofResult.metrics.totalCollateral,
      start_block: proofResult.metrics.startBlock
        ? BigInt(proofResult.metrics.startBlock)
        : null,
      end_block: proofResult.metrics.endBlock ? BigInt(proofResult.metrics.endBlock) : null,
      proof_timestamp: now,
      verified_at: now,
      tx_hash: txHash,
    },
  });

  console.log(`[proof-worker] Proof ${proofId} verified successfully`);
}

async function pollOnce(): Promise<void> {
  await resetStaleProvingRecords();

  const candidates = await prismaClient.proof_records.findMany({
    where: { status: "PENDING" },
    include: {
      agents: {
        select: {
          creator_wallet: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
    take: MAX_BATCH_SIZE,
  });

  if (candidates.length === 0) {
    return;
  }

  console.log(`[proof-worker] Found ${candidates.length} pending proofs`);

  for (const candidate of candidates) {
    if (isShuttingDown) {
      break;
    }

    if (!SUPPORTED_STATUSES.includes(candidate.status)) {
      continue;
    }

    const userWallet = candidate.agents?.creator_wallet;
    if (!userWallet) {
      await prismaClient.proof_records.update({
        where: { id: candidate.id },
        data: { status: "FAILED" },
      });
      console.error(`[proof-worker] Proof ${candidate.id} has no associated user wallet`);
      continue;
    }

    // Atomically claim this job to avoid double-processing in multi-worker setups.
    const claim = await prismaClient.proof_records.updateMany({
      where: {
        id: candidate.id,
        status: "PENDING",
      },
      data: { status: "PROVING" },
    });

    if (claim.count === 0) {
      continue;
    }

    try {
      await processProofRecord(candidate.id, userWallet);
    } catch (error: any) {
      console.error(`[proof-worker] Failed proof ${candidate.id}: ${error.message}`);
      await prismaClient.proof_records.update({
        where: { id: candidate.id },
        data: { status: "FAILED" },
      });
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  if (loopHandle) {
    clearTimeout(loopHandle);
    loopHandle = null;
  }

  console.log(`[proof-worker] Received ${signal}. Shutting down worker...`);
  await prisma.$disconnect();
  process.exit(0);
}

async function runLoop(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  try {
    await pollOnce();
  } catch (error: any) {
    console.error(`[proof-worker] Polling failed: ${error.message}`);
  } finally {
    if (!isShuttingDown) {
      loopHandle = setTimeout(() => {
        void runLoop();
      }, POLL_INTERVAL_MS);
    }
  }
}

async function main(): Promise<void> {
  if (!hasRequiredConfiguration()) {
    process.exit(1);
  }

  console.log("[proof-worker] Starting proof worker...");
  console.log(`[proof-worker] Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`[proof-worker] Batch size: ${MAX_BATCH_SIZE}`);
  console.log(`[proof-worker] Stale proving threshold: ${STALE_PROVING_MINUTES} minutes`);

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await runLoop();
}

void main();
