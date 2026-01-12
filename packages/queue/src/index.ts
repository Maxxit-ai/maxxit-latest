/**
 * @maxxit/queue
 * 
 * Reusable BullMQ queue infrastructure for Maxxit services.
 * Provides queue creation, worker management, distributed locking,
 * and job scheduling utilities.
 * 
 * @example
 * ```typescript
 * import { 
 *   createQueue, 
 *   createWorker, 
 *   addJob, 
 *   QueueName,
 *   TradeExecutionJobData 
 * } from '@maxxit/queue';
 * 
 * // Create a worker
 * const worker = createWorker<TradeExecutionJobData>(
 *   QueueName.TRADE_EXECUTION,
 *   async (job) => {
 *     // Process the job
 *     return { success: true };
 *   },
 *   { concurrency: 5 }
 * );
 * 
 * // Add a job
 * await addJob(QueueName.TRADE_EXECUTION, 'execute-signal', {
 *   type: 'EXECUTE_SIGNAL',
 *   signalId: 'abc123',
 *   deploymentId: 'xyz789',
 *   timestamp: Date.now(),
 * });
 * ```
 */

// Connection management
export {
  getConnection,
  getSubscriberConnection,
  closeConnections,
  isRedisHealthy,
  type RedisConnectionOptions,
} from './connection';

// Queue types and constants
export {
  QueueName,
  DEFAULT_JOB_OPTIONS,
  type BaseJobData,
  type JobOptions,
  type JobResult,
  // Trade Execution types
  type TradeExecutionJobData,
  type ExecuteSignalJobData,
  type RetryFailedExecutionJobData,
  // Signal Generation types
  type SignalGenerationJobData,
  type ProcessTweetsJobData,
  type ProcessTelegramJobData,
  type ProcessResearchJobData,
  type GenerateSignalJobData,
  type GenerateTelegramSignalJobData,
  type GenerateTraderTradeSignalJobData,
  // Position Monitor types
  type PositionMonitorJobData,
  type MonitorPositionJobData,
  type CheckStopLossJobData,
  // Telegram Notification types
  type TelegramNotificationJobData,
  type SendNotificationJobData,
  // Telegram Alpha Classification types
  type TelegramAlphaJobData,
  type ClassifyMessageJobData,
  // Trader Alpha types (Copy-Trading)
  type TraderAlphaJobData,
  type FetchTraderTradesJobData,
  type ProcessTraderTradeJobData,
  type CheckTraderTradeStatusJobData,
} from './types';

// Queue factory
export {
  createQueue,
  getQueue,
  closeAllQueues,
  addJob,
  addBulkJobs,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  drainQueue,
  type CreateQueueOptions,
} from './queue-factory';

// Worker factory
export {
  createWorker,
  createWorkerPool,
  closeAllWorkers,
  pauseAllWorkers,
  resumeAllWorkers,
  getWorkerCount,
  hasActiveWorkers,
  type CreateWorkerOptions,
  type JobProcessor,
} from './worker-factory';

// Distributed locking
export {
  acquireLock,
  releaseLock,
  extendLock,
  isLocked,
  withLock,
  waitForLock,
  getSignalDeploymentLockKey,
  getPositionMonitorLockKey,
  getMessageClassificationLockKey,
  getSignalGenerationLockKey,
  getTraderTradeLockKey,
} from './distributed-lock';

// Scheduler
export {
  scheduleRepeatingJob,
  startIntervalTrigger,
  stopIntervalTrigger,
  closeAllSchedulers,
  createTradeExecutionTrigger,
} from './scheduler';

// Re-export BullMQ types that consumers might need
export { Job, Queue, Worker, QueueEvents } from 'bullmq';

// Import for shutdown function
import { closeAllWorkers as _closeAllWorkers } from './worker-factory';
import { closeAllQueues as _closeAllQueues } from './queue-factory';
import { closeAllSchedulers as _closeAllSchedulers } from './scheduler';
import { closeConnections as _closeConnections } from './connection';

/**
 * Graceful shutdown helper for queue services
 * Call this in your cleanup handler to properly close all resources
 */
export async function shutdownQueueService(): Promise<void> {
  console.log('🛑 Shutting down queue service...');

  await _closeAllWorkers();
  await _closeAllQueues();
  await _closeAllSchedulers();
  await _closeConnections();

  console.log('✅ Queue service shutdown complete');
}
