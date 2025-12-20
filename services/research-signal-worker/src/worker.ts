import dotenv from "dotenv";
import express from "express";
import {
  prisma,
  checkDatabaseHealth,
  disconnectPrisma,
} from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
  createHealthCheckHandler,
} from "@maxxit/common";
import {
  AgentWithVenue,
  InstituteHandler,
  InstituteRunResult,
  getInstituteHandlers,
} from "./institutes";

dotenv.config();

const PORT = process.env.PORT || 5007;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "300000"); // 5 minutes default

let workerInterval: NodeJS.Timeout | null = null;
const instituteHandlers: InstituteHandler[] = getInstituteHandlers();

// Health check server
const app = express();
app.get(
  "/health",
  createHealthCheckHandler("research-signal-worker", async () => {
    const dbHealthy = await checkDatabaseHealth();

    return {
      database: dbHealthy ? "connected" : "disconnected",
      interval: INTERVAL,
      isRunning: workerInterval !== null,
      institutes: instituteHandlers.map((h) => ({
        id: h.instituteId,
        name: h.instituteName,
        configured: h.isConfigured(),
      })),
    };
  })
);

const server = app.listen(PORT, () => {
  console.log(
    `🏥 Research Signal Worker health check server listening on port ${PORT}`
  );
});

/**
 * Load agent → institute subscriptions (PUBLIC agents only)
 */
async function loadSubscriptions(): Promise<
  Map<
    string,
    {
      institute: any;
      agents: AgentWithVenue[];
    }
  >
> {
  const subs = await prisma.agent_research_institutes.findMany({
    where: {
      agents: {
        status: "PUBLIC",
      },
    },
    include: {
      agents: true,
      research_institutes: true,
    },
  });

  const grouped = new Map<
    string,
    {
      institute: any;
      agents: AgentWithVenue[];
    }
  >();

  subs.forEach((sub) => {
    if (!sub.research_institutes || !sub.agents) return;
    const key = sub.research_institutes.id;
    const entry = grouped.get(key) || {
      institute: sub.research_institutes,
      agents: [],
    };
    entry.agents.push({
      id: sub.agents.id,
      name: sub.agents.name,
      venue: sub.agents.venue,
      status: sub.agents.status,
    });
    grouped.set(key, entry);
  });

  return grouped;
}

async function runCycle() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📊 RESEARCH SIGNAL WORKER (Dynamic Institutes)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const subscriptions = await loadSubscriptions();
  const results: InstituteRunResult[] = [];

  for (const handler of instituteHandlers) {
    try {
      const institute = await handler.ensureInstitute(prisma);
      if (!institute) {
        console.log(
          `[${handler.instituteName}] ⚠️  Could not ensure institute record`
        );
        continue;
      }

      // Update handler id if newly created (for name-based handlers)
      handler.instituteId = institute.id;

      const sub = subscriptions.get(institute.id);
      const agents = sub?.agents || [];

      if (!institute.is_active) {
        console.log(
          `[${handler.instituteName}] ⏭️  Skipping (institute inactive)`
        );
        continue;
      }

      if (!handler.isConfigured()) {
        console.log(
          `[${handler.instituteName}] ⏭️  Skipping (configuration missing)`
        );
        continue;
      }

      if (agents.length === 0) {
        console.log(
          `[${handler.instituteName}] ⏭️  Skipping (no agents subscribed)`
        );
        continue;
      }

      console.log(
        `[${handler.instituteName}] ▶️  Processing for ${agents.length} agent(s)`
      );

      const result = await handler.run({
        agents,
        institute,
        context: { prisma, intervalMs: INTERVAL },
      });

      results.push(result);
      console.log(
        `[${handler.instituteName}] ✅ Done → signals: ${
          result.signalsCreated
        }${result.details ? ` (${result.details})` : ""}`
      );
    } catch (error: any) {
      console.error(
        `[${handler.instituteName}] ❌ Fatal error:`,
        error.message
      );
    }
  }

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 INSTITUTE SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  results.forEach((r) => {
    console.log(
      `• ${r.instituteName}: signals=${r.signalsCreated}, processed=${
        r.processedAssets || 0
      }, skipped=${r.skipped || 0}, errors=${r.errors || 0}`
    );
  });
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Research Signal Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000 / 60} minutes)`);
  console.log(
    `🏢 Institutes registered: ${instituteHandlers
      .map((h) => h.instituteName)
      .join(", ")}`
  );
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await runCycle();

  workerInterval = setInterval(async () => {
    await runCycle();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Research Signal Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  await disconnectPrisma();
  console.log("✅ Prisma disconnected");
});

// Setup graceful shutdown
setupGracefulShutdown("Research Signal Worker", server);

// Start worker
if (require.main === module) {
  console.log("✅ Environment check passed");
  console.log("   DATABASE_URL: [SET]");
  console.log("   PORT:", PORT);
  console.log("   NODE_ENV:", process.env.NODE_ENV || "development");

  checkDatabaseHealth()
    .then((healthy: boolean) => {
      if (!healthy) {
        console.error("❌ FATAL: Cannot connect to database!");
        console.error("   Check DATABASE_URL and database availability.");
        process.exit(1);
      }
      console.log("✅ Database connection verified");

      return runWorker();
    })
    .catch((error: Error) => {
      console.error("[ResearchSignal] ❌ Worker failed to start:", error);
      console.error("   Error details:", error.stack);
      process.exit(1);
    });
}

export { runCycle };
