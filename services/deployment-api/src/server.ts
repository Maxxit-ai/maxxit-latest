import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import hyperliquidRoutes from './routes/hyperliquid';
import ostiumRoutes from './routes/ostium';
import deploymentsRoutes from './routes/deployments';
import { setupGracefulShutdown } from "@maxxit/common";
import { errorHandler } from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware
app.use(cors());
app.use(express.json());

// Health check with database status
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'ok' : 'degraded',
    service: 'deployment-api',
    port: PORT,
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/hyperliquid', hyperliquidRoutes);
app.use('/api/ostium', ostiumRoutes);
app.use('/api/deployments', deploymentsRoutes);

// Error handling (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Deployment API Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Setup graceful shutdown
setupGracefulShutdown('Deployment API', server);

export default app;

