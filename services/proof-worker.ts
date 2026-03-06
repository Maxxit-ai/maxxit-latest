import { config } from "dotenv";
import * as fs from "fs";
import * as os from "os";
import { prisma } from "../lib/prisma";
import { generateProof, submitProofToRegistry } from "../lib/zk-prover";
import {
  encodeAvantisOpenTradeId,
  decodeTradeReference,
  encodeTradeReference,
} from "../lib/alpha-trade-reference";

config();

const prismaClient = prisma as any;

const POLL_INTERVAL_MS = 15_000;
const MAX_BATCH_SIZE = 5;
const STALE_PROVING_MINUTES = 35;
const SUPPORTED_STATUSES = ["PENDING", "PROVING"] as const;

let isShuttingDown = false;
let loopHandle: NodeJS.Timeout | null = null;

function readCgroupValue(paths: string[]): string | null {
  for (const filePath of paths) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return null;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function parseCgroupBytes(raw: string | null): number | null {
  if (!raw || raw === "max") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getResourceSnapshot() {
  const memory = process.memoryUsage();
  const resource = process.resourceUsage();
  const cgroupLimit = parseCgroupBytes(
    readCgroupValue([
      "/sys/fs/cgroup/memory.max",
      "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    ])
  );
  const cgroupCurrent = parseCgroupBytes(
    readCgroupValue([
      "/sys/fs/cgroup/memory.current",
      "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    ])
  );

  return {
    pid: process.pid,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    uptimeSec: Math.round(process.uptime()),
    loadAvg: os.loadavg(),
    systemMemory: {
      totalBytes: os.totalmem(),
      total: formatBytes(os.totalmem()),
      freeBytes: os.freemem(),
      free: formatBytes(os.freemem()),
    },
    processMemory: {
      rssBytes: memory.rss,
      rss: formatBytes(memory.rss),
      heapTotalBytes: memory.heapTotal,
      heapTotal: formatBytes(memory.heapTotal),
      heapUsedBytes: memory.heapUsed,
      heapUsed: formatBytes(memory.heapUsed),
      externalBytes: memory.external,
      external: formatBytes(memory.external),
      arrayBuffersBytes: memory.arrayBuffers,
      arrayBuffers: formatBytes(memory.arrayBuffers),
    },
    cgroupMemory: {
      limitBytes: cgroupLimit,
      limit: formatBytes(cgroupLimit),
      currentBytes: cgroupCurrent,
      current: formatBytes(cgroupCurrent),
    },
    cpu: {
      userMicros: resource.userCPUTime,
      systemMicros: resource.systemCPUTime,
      maxRssKb: resource.maxRSS,
    },
  };
}

function formatErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
      cause:
        errorWithCause.cause instanceof Error
          ? { name: errorWithCause.cause.name, message: errorWithCause.cause.message }
          : errorWithCause.cause ?? null,
    };
  }

  return {
    name: typeof error,
    message: String(error),
    stack: null,
    cause: null,
  };
}

function hasRequiredConfiguration(): boolean {
  const requiredKeys = [
    "DATABASE_URL",
    "SP1_PROVER_MODE",
    // "SP1_HOST_BINARY",
    "SP1_PRIVATE_KEY",
    "ARBITRUM_SEPOLIA_RPC",
  ];

  // Accept either env var name
  const hasRegistry = process.env.POSITION_REGISTRY_ADDRESS || process.env.TRADER_REGISTRY_ADDRESS;

  const missingKeys = requiredKeys.filter((key) => !process.env[key]);
  if (missingKeys.length > 0 || !hasRegistry) {
    const missing = [...missingKeys];
    if (!hasRegistry) missing.push("POSITION_REGISTRY_ADDRESS");
    console.error(
      `[proof-worker] Missing required environment variables: ${missing.join(", ")}`
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

async function processProofRecord(
  proofId: string,
  wallet: string,
  tradeRef?: string
): Promise<void> {
  const decodedRef = decodeTradeReference(tradeRef);
  const venue = decodedRef.venue;
  const tradeId = decodedRef.tradeId ?? undefined;

  console.log(
    `[proof-worker] Processing proof ${proofId} for wallet ${wallet} on ${venue}${tradeId ? ` (tradeId=${tradeId})` : ""}`
  );

  const proofResult = await generateProof(wallet, tradeId, { venue });
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
  const resolvedFeaturedTradeId =
    proofResult.venue === "AVANTIS"
      ? encodeAvantisOpenTradeId(
        proofResult.featured?.pairIndex,
        proofResult.featured?.tradeId
      ) ?? decodedRef.tradeId
      : proofResult.featured?.tradeId?.toString() ?? decodedRef.tradeId;

  await prismaClient.proof_records.update({
    where: { id: proofId },
    data: {
      status: "VERIFIED",
      brevis_request_id: proofResult.proofId,
      total_pnl: proofResult.metrics.totalPnl,
      trade_count: proofResult.metrics.tradeCount,
      win_count: proofResult.metrics.winCount,
      total_collateral: proofResult.metrics.totalCollateral,
      trade_id: encodeTradeReference(
        proofResult.venue,
        resolvedFeaturedTradeId
      ),
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
      await processProofRecord(candidate.id, userWallet, candidate.trade_id ?? undefined);
    } catch (error: any) {
      const errorDetails = formatErrorDetails(error);
      const resourceSnapshot = getResourceSnapshot();
      console.error(`[proof-worker] Failed proof ${candidate.id}: ${errorDetails.message}`);
      console.error(
        `[proof-worker] Failure diagnostics for ${candidate.id}: ${JSON.stringify(
          {
            proofId: candidate.id,
            wallet: userWallet,
            tradeRef: candidate.trade_id ?? null,
            error: errorDetails,
            resources: resourceSnapshot,
          }
        )}`
      );
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
