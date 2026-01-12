/**
 * Queue Scheduler
 * 
 * Utility for scheduling recurring jobs and managing job triggers.
 * Uses BullMQ's built-in repeat functionality for cron-like scheduling.
 */

import { RepeatOptions } from 'bullmq';
import { createQueue, addJob } from './queue-factory';
import { QueueName, BaseJobData } from './types';

// Store intervals for cleanup
const repeatIntervals: NodeJS.Timeout[] = [];

/**
 * Schedule a repeating job
 * 
 * @param queueName - Name of the queue
 * @param jobName - Name of the job
 * @param data - Job data
 * @param repeatOptions - Repeat configuration
 */
export async function scheduleRepeatingJob<T extends BaseJobData>(
  queueName: QueueName | string,
  jobName: string,
  data: T,
  repeatOptions: RepeatOptions
): Promise<void> {
  const queue = createQueue<T>(queueName);
  
  await queue.add(jobName as any, data as any, {
    repeat: repeatOptions,
    removeOnComplete: true,
    removeOnFail: false,
  });
  
  console.log(`🔁 Scheduled repeating job '${jobName}' in queue '${queueName}'`);
}

/**
 * Start a simple interval-based job trigger
 * This is useful when you need more control over when jobs are added
 * 
 * @param intervalMs - Interval in milliseconds
 * @param triggerFn - Function that adds jobs to the queue
 * @param options - Additional options
 */
export function startIntervalTrigger(
  intervalMs: number,
  triggerFn: () => Promise<void>,
  options?: {
    runImmediately?: boolean;
    name?: string;
  }
): NodeJS.Timeout {
  const name = options?.name || 'unnamed';
  
  console.log(`⏰ Starting interval trigger '${name}' (every ${intervalMs}ms)`);
  
  // Run immediately if requested
  if (options?.runImmediately) {
    triggerFn().catch((error) => {
      console.error(`[Trigger:${name}] Error in initial run:`, error);
    });
  }
  
  // Start the interval
  const interval = setInterval(async () => {
    try {
      await triggerFn();
    } catch (error: any) {
      console.error(`[Trigger:${name}] Error:`, error.message);
    }
  }, intervalMs);
  
  repeatIntervals.push(interval);
  return interval;
}

/**
 * Stop an interval trigger
 */
export function stopIntervalTrigger(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  const index = repeatIntervals.indexOf(interval);
  if (index > -1) {
    repeatIntervals.splice(index, 1);
  }
}

/**
 * Close all schedulers and stop all triggers
 */
export async function closeAllSchedulers(): Promise<void> {
  // Stop all interval triggers
  repeatIntervals.forEach((interval) => clearInterval(interval));
  repeatIntervals.length = 0;
  
  console.log('✅ All schedulers closed');
}

/**
 * Trigger function for checking pending signals and adding them to the trade execution queue
 */
export async function createTradeExecutionTrigger(
  checkPendingSignals: () => Promise<Array<{ signalId: string; deploymentId: string }>>
): Promise<() => Promise<void>> {
  return async () => {
    try {
      const pendingSignals = await checkPendingSignals();
      
      if (pendingSignals.length === 0) {
        return;
      }
      
      console.log(`[Trigger] Found ${pendingSignals.length} pending signals`);
      
      // Add jobs for each pending signal
      for (const signal of pendingSignals) {
        await addJob(
          QueueName.TRADE_EXECUTION,
          'execute-signal',
          {
            type: 'EXECUTE_SIGNAL' as const,
            signalId: signal.signalId,
            deploymentId: signal.deploymentId,
            timestamp: Date.now(),
          },
          {
            // Use signal-deployment pair as job ID to prevent duplicates
            jobId: `execute-${signal.signalId}-${signal.deploymentId}`,
          }
        );
      }
      
      console.log(`[Trigger] Added ${pendingSignals.length} jobs to trade execution queue`);
    } catch (error: any) {
      console.error('[Trigger] Error checking pending signals:', error.message);
    }
  };
}
