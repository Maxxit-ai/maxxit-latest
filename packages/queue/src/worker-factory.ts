/**
 * Worker Factory
 * 
 * Factory for creating BullMQ workers with consistent configuration,
 * distributed locking, and graceful shutdown support.
 */

import { Worker, Job, WorkerOptions, Processor } from 'bullmq';
import { getConnection } from './connection';
import { QueueName, BaseJobData, JobResult } from './types';

// Store created workers for cleanup
const workers: Worker[] = [];

/**
 * Worker configuration options
 */
export interface CreateWorkerOptions {
  /** Number of concurrent jobs this worker can process */
  concurrency?: number;
  /** Maximum number of jobs to process per cycle */
  limiter?: {
    max: number;
    duration: number;
  };
  /** Lock duration in milliseconds */
  lockDuration?: number;
  /** Custom worker options */
  workerOptions?: Partial<WorkerOptions>;
}

/**
 * Job processor function type
 */
export type JobProcessor<T extends BaseJobData> = (
  job: Job<T>,
  token?: string
) => Promise<JobResult>;

/**
 * Create a worker with standard configuration
 */
export function createWorker<T extends BaseJobData>(
  queueName: QueueName | string,
  processor: JobProcessor<T>,
  options?: CreateWorkerOptions
): Worker<T, JobResult> {
  const connection = getConnection();

  const workerOptions: WorkerOptions = {
    connection,
    concurrency: options?.concurrency ?? 5,
    lockDuration: options?.lockDuration ?? 30000,
    limiter: options?.limiter,
    ...options?.workerOptions,
  };

  const wrappedProcessor: Processor<T, JobResult> = async (job, token) => {
    const startTime = Date.now();
    const jobId = job.id || 'unknown';
    const jobName = job.name;

    console.log(`[Worker] 🔄 Processing job ${jobId} (${jobName})`);

    try {
      const result = await processor(job, token);
      const duration = Date.now() - startTime;

      if (result.success) {
        console.log(`[Worker] ✅ Job ${jobId} completed in ${duration}ms`);
      } else {
        console.log(`[Worker] ⚠️  Job ${jobId} finished with warning: ${result.message}`);
      }

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Worker] ❌ Job ${jobId} failed after ${duration}ms:`, error.message);
      throw error;
    }
  };

  const worker = new Worker<T, JobResult>(queueName, wrappedProcessor, workerOptions);

  // Set up event handlers
  worker.on('completed', (job, result) => {
    console.log(`[Worker] 📦 Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[Worker] ❌ Worker error:', error.message);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[Worker] ⚠️  Job ${jobId} stalled`);
  });

  workers.push(worker as Worker);
  console.log(`👷 Worker for '${queueName}' created (concurrency: ${workerOptions.concurrency})`);

  return worker;
}

/**
 * Create multiple workers for parallel processing
 */
export function createWorkerPool<T extends BaseJobData>(
  queueName: QueueName | string,
  processor: JobProcessor<T>,
  workerCount: number,
  options?: CreateWorkerOptions
): Worker<T, JobResult>[] {
  const createdWorkers: Worker<T, JobResult>[] = [];

  for (let i = 0; i < workerCount; i++) {
    const worker = createWorker<T>(
      queueName,
      async (job, token) => {
        console.log(`[Worker-${i}] Processing job ${job.id}`);
        return processor(job, token);
      },
      options
    );
    createdWorkers.push(worker);
  }

  console.log(`👷‍♂️ Worker pool for '${queueName}' created with ${workerCount} workers`);
  return createdWorkers;
}

/**
 * Close all workers gracefully
 */
export async function closeAllWorkers(): Promise<void> {
  console.log(`🛑 Closing ${workers.length} worker(s)...`);

  const closePromises = workers.map(async (worker) => {
    try {
      await worker.close();
    } catch (error: any) {
      console.error('Error closing worker:', error.message);
    }
  });

  await Promise.all(closePromises);
  workers.length = 0; // Clear the array
  console.log('✅ All workers closed');
}

/**
 * Pause all workers
 */
export async function pauseAllWorkers(): Promise<void> {
  console.log(`⏸️  Pausing ${workers.length} worker(s)...`);

  await Promise.all(workers.map((worker) => worker.pause()));
  console.log('✅ All workers paused');
}

/**
 * Resume all workers
 */
export async function resumeAllWorkers(): Promise<void> {
  console.log(`▶️  Resuming ${workers.length} worker(s)...`);

  workers.forEach((worker) => worker.resume());
  console.log('✅ All workers resumed');
}

/**
 * Get worker statistics
 */
export function getWorkerCount(): number {
  return workers.length;
}

/**
 * Check if any workers are running
 */
export function hasActiveWorkers(): boolean {
  return workers.some((worker) => worker.isRunning());
}
