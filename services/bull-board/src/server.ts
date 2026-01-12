/**
 * Bull Board Dashboard
 * 
 * Standalone Bull Board dashboard for monitoring all BullMQ queues.
 * Run alongside your main app with: npm run board
 * 
 * Access at: http://localhost:5050/admin/queues
 */

import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.BULL_BOARD_PORT || 5050;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Create Redis connection
const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

// Define all queues to monitor
const QUEUE_NAMES = [
    "trade-execution",
    "signal-generation",
    "position-monitor",
    "telegram-notification",
    "telegram-alpha-classification",
    "trader-alpha",
];

// Create queue instances for Bull Board
const queues = QUEUE_NAMES.map((name) => {
    const queue = new Queue(name, { connection });
    return new BullMQAdapter(queue);
});

// Setup Express server
const app = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
    queues,
    serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", queues: QUEUE_NAMES });
});

// Redirect root to dashboard
app.get("/", (_req, res) => {
    res.redirect("/admin/queues");
});

app.listen(PORT, () => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Bull Board Dashboard`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Dashboard: http://localhost:${PORT}/admin/queues`);
    console.log(`📡 Monitoring: ${QUEUE_NAMES.join(", ")}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
});
