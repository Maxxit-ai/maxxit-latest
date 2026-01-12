/**
 * Queue Factory
 * 
 * Factory for creating and managing BullMQ queues with consistent configuration.
 */

import { Queue, QueueOptions, JobsOptions } from 'bullmq';
import { getConnection } from './connection';
import { QueueName, DEFAULT_JOB_OPTIONS, JobOptions, BaseJobData } from './types';

// Store created queues to avoid duplicates
const queues = new Map<string, Queue>();

/**
 * Queue factory options
 */
export interface CreateQueueOptions {
  /** Custom queue options */
  queueOptions?: Partial<QueueOptions>;
  /** Default job options for all jobs in this queue */
  defaultJobOptions?: JobOptions;
}

/**
 * Create or get an existing queue
 */
export function createQueue<T extends BaseJobData>(
  queueName: QueueName | string,
  options?: CreateQueueOptions
): Queue<T> {
  // Return existing queue if already created
  if (queues.has(queueName)) {
    return queues.get(queueName) as Queue<T>;
  }

  const connection = getConnection();
  
  // Get default options for known queue names
  const knownQueueName = Object.values(QueueName).includes(queueName as QueueName);
  const defaultOpts = knownQueueName 
    ? DEFAULT_JOB_OPTIONS[queueName as QueueName] 
    : {};

  const queueOptions: QueueOptions = {
    connection,
    defaultJobOptions: {
      ...defaultOpts,
      ...options?.defaultJobOptions,
    } as JobsOptions,
    ...options?.queueOptions,
  };

  const queue = new Queue<T>(queueName, queueOptions);
  queues.set(queueName, queue as Queue);

  console.log(`📬 Queue '${queueName}' created`);

  return queue;
}

/**
 * Get an existing queue by name
 */
export function getQueue<T extends BaseJobData>(queueName: string): Queue<T> | undefined {
  return queues.get(queueName) as Queue<T> | undefined;
}

/**
 * Close all queues gracefully
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [name, queue] of queues) {
    closePromises.push(
      queue.close().then(() => {
        console.log(`✅ Queue '${name}' closed`);
      })
    );
  }

  await Promise.all(closePromises);
  queues.clear();
}

/**
 * Add a job to a queue with type safety
 */
export async function addJob<T extends BaseJobData>(
  queueName: QueueName | string,
  jobName: string,
  data: T,
  options?: JobOptions
): Promise<string> {
  let queue = getQueue<T>(queueName);
  
  if (!queue) {
    queue = createQueue<T>(queueName);
  }

  // Add timestamp if not present
  const jobData: T = {
    ...data,
    timestamp: data.timestamp || Date.now(),
  };

  // Get default options for known queue names
  const knownQueueName = Object.values(QueueName).includes(queueName as QueueName);
  const defaultOpts = knownQueueName
    ? DEFAULT_JOB_OPTIONS[queueName as QueueName]
    : {};

  const job = await queue.add(jobName as any, jobData as any, {
    jobId: options?.jobId,
    delay: defaultOpts.delay,
    attempts: defaultOpts.attempts,
    backoff: defaultOpts.backoff,
    removeOnComplete: defaultOpts.removeOnComplete,
    removeOnFail: defaultOpts.removeOnFail,
    priority: defaultOpts.priority,
  });

  return job.id || '';
}

/**
 * Add multiple jobs to a queue in bulk
 */
export async function addBulkJobs<T extends BaseJobData>(
  queueName: QueueName | string,
  jobs: Array<{ name: string; data: T; options?: JobOptions }>
): Promise<string[]> {
  let queue = getQueue<T>(queueName);
  
  if (!queue) {
    queue = createQueue<T>(queueName);
  }

  const bulkJobs = jobs.map((job) => ({
    name: job.name as string,
    data: {
      ...job.data,
      timestamp: job.data.timestamp || Date.now(),
    } as T,
    opts: job.options ? {
      jobId: job.options.jobId,
      delay: job.options.delay,
      attempts: job.options.attempts,
      backoff: job.options.backoff,
      removeOnComplete: job.options.removeOnComplete,
      removeOnFail: job.options.removeOnFail,
      priority: job.options.priority,
    } : undefined,
  }));

  const addedJobs = await queue.addBulk(bulkJobs as any);
  return addedJobs.map((job) => job.id || '');
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(queueName);
  
  if (!queue) {
    throw new Error(`Queue '${queueName}' not found`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: string): Promise<void> {
  const queue = getQueue(queueName);
  if (queue) {
    await queue.pause();
    console.log(`⏸️  Queue '${queueName}' paused`);
  }
}

/**
 * Resume a queue
 */
export async function resumeQueue(queueName: string): Promise<void> {
  const queue = getQueue(queueName);
  if (queue) {
    await queue.resume();
    console.log(`▶️  Queue '${queueName}' resumed`);
  }
}

/**
 * Drain a queue (remove all jobs)
 */
export async function drainQueue(queueName: string): Promise<void> {
  const queue = getQueue(queueName);
  if (queue) {
    await queue.drain();
    console.log(`🚿 Queue '${queueName}' drained`);
  }
}
