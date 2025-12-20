import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import agentRoutes from './routes/agents';
import agentAccountsRoutes from './routes/agent-accounts';
import routingStatsRoutes from './routes/routing-stats';
import { setupGracefulShutdown } from "@maxxit/common";
import { errorHandler } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check with database status
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'agent-api',
    port: PORT,
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/agents', agentRoutes);
app.use('/api/agent-accounts', agentAccountsRoutes);
app.use('/api/routing-stats', routingStatsRoutes);

// Error handling (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Agent API Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Setup graceful shutdown
setupGracefulShutdown('Agent API', server);

export default app;

