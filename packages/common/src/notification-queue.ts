/**
 * Notification Queue Module
 *
 * A reusable BullMQ-based queue system for sending notifications.
 * Supports multiple notification channels (Telegram, etc.) with:
 * - Rate limiting
 * - Automatic retries with exponential backoff
 * - Deduplication
 * - Graceful shutdown
 *
 * Usage:
 * ```typescript
 * import { NotificationQueue, NotificationProducer, NotificationWorker } from '@maxxit/common';
 *
 * // Initialize queue
 * const queue = new NotificationQueue({ redisUrl: process.env.REDIS_URL });
 *
 * // Producer: Add jobs
 * const producer = new NotificationProducer(queue);
 * await producer.enqueueTelegramNotification({
 *   chatId: '123456',
 *   message: 'Hello!',
 *   userId: 'user-wallet',
 *   signalId: 'signal-id',
 * });
 *
 * // Worker: Process jobs
 * const worker = new NotificationWorker(queue, {
 *   telegram: async (job) => {
 *     await sendTelegramMessage(job.data.chatId, job.data.message);
 *   }
 * });
 * await worker.start();
 * ```
 */

import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

// ============================================================================
// Types
// ============================================================================

export interface NotificationQueueConfig {
  /** Redis URL (e.g., redis://localhost:6379) */
  redisUrl?: string;
  /** Queue name prefix (default: 'maxxit') */
  prefix?: string;
  /** Default job options */
  defaultJobOptions?: {
    /** Number of retry attempts (default: 3) */
    attempts?: number;
    /** Backoff strategy */
    backoff?: {
      type: "exponential" | "fixed";
      delay: number;
    };
    /** Remove job after completion (default: true) */
    removeOnComplete?: boolean | number;
    /** Remove job after failure (default: false) */
    removeOnFail?: boolean | number;
  };
}

export interface TelegramNotificationJob {
  type: "telegram";
  chatId: string;
  message: string;
  /** For deduplication */
  userId: string;
  signalId: string;
  notificationType: "SIGNAL_EXECUTED" | "SIGNAL_NOT_TRADED";
  /** Optional metadata */
  metadata?: {
    positionId?: string;
    agentName?: string;
    tokenSymbol?: string;
    venue?: string;
  };
}

export interface EmailNotificationJob {
  type: "email";
  to: string;
  subject: string;
  body: string;
  userId: string;
}

export type NotificationJob = TelegramNotificationJob | EmailNotificationJob;

export interface NotificationHandlers {
  telegram?: (job: Job<TelegramNotificationJob>) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
  email?: (job: Job<EmailNotificationJob>) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export interface WorkerConfig {
  /** Max concurrent jobs (default: 10) */
  concurrency?: number;
  /** Rate limiter config */
  limiter?: {
    /** Max jobs per duration */
    max: number;
    /** Duration in ms */
    duration: number;
  };
}

// ============================================================================
// NotificationQueue - Core queue management
// ============================================================================

export class NotificationQueue {
  private connection: IORedis;
  private queue: Queue<NotificationJob>;
  private queueEvents: QueueEvents;
  private config: NotificationQueueConfig;
  private isConnected: boolean = false;

  constructor(config: NotificationQueueConfig = {}) {
    this.config = {
      redisUrl:
        config.redisUrl || process.env.REDIS_URL || "redis://localhost:6379",
      prefix: config.prefix || "maxxit",
      defaultJobOptions: {
        attempts: config.defaultJobOptions?.attempts ?? 3,
        backoff: config.defaultJobOptions?.backoff ?? {
          type: "exponential",
          delay: 2000, // 2s, 4s, 8s...
        },
        removeOnComplete: config.defaultJobOptions?.removeOnComplete ?? 100, // Keep last 100
        removeOnFail: config.defaultJobOptions?.removeOnFail ?? 500, // Keep last 500 failures
      },
    };

    // Create Redis connection
    this.connection = new IORedis(this.config.redisUrl!, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error(
            "[NotificationQueue] Redis connection failed after 10 retries"
          );
          return null;
        }
        return Math.min(times * 200, 5000);
      },
    });

    this.connection.on("connect", () => {
      this.isConnected = true;
      console.log("[NotificationQueue] ✅ Redis connected");
    });

    this.connection.on("error", (err) => {
      console.error("[NotificationQueue] ❌ Redis error:", err.message);
    });

    this.connection.on("close", () => {
      this.isConnected = false;
      console.log("[NotificationQueue] Redis connection closed");
    });

    // Create queue
    this.queue = new Queue<NotificationJob>("notifications", {
      connection: this.connection,
      prefix: this.config.prefix,
      defaultJobOptions: this.config.defaultJobOptions,
    });

    // Create queue events for monitoring
    this.queueEvents = new QueueEvents("notifications", {
      connection: this.connection.duplicate(),
      prefix: this.config.prefix,
    });
  }

  /** Get the underlying BullMQ Queue */
  getQueue(): Queue<NotificationJob> {
    return this.queue;
  }

  /** Get the Redis connection */
  getConnection(): IORedis {
    return this.connection;
  }

  /** Get queue events for monitoring */
  getQueueEvents(): QueueEvents {
    return this.queueEvents;
  }

  /** Check if Redis is connected */
  isRedisConnected(): boolean {
    return this.isConnected;
  }

  /** Get queue stats */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /** Close all connections */
  async close(): Promise<void> {
    console.log("[NotificationQueue] Closing connections...");
    await this.queueEvents.close();
    await this.queue.close();
    await this.connection.quit();
    console.log("[NotificationQueue] ✅ All connections closed");
  }
}

// ============================================================================
// NotificationProducer - Add jobs to queue
// ============================================================================

export class NotificationProducer {
  private queue: Queue<NotificationJob>;

  constructor(notificationQueue: NotificationQueue) {
    this.queue = notificationQueue.getQueue();
  }

  /**
   * Enqueue a Telegram notification
   * Uses signalId + userId as job ID for deduplication
   */
  async enqueueTelegramNotification(
    data: Omit<TelegramNotificationJob, "type">,
    options?: {
      priority?: number; // 1 = highest
      delay?: number; // ms
    }
  ): Promise<Job<TelegramNotificationJob>> {
    const jobId = `telegram:${data.signalId}:${data.userId}`;

    const job = await this.queue.add(
      "telegram",
      { type: "telegram", ...data },
      {
        jobId, // Ensures deduplication
        priority: options?.priority,
        delay: options?.delay,
      }
    );

    console.log(
      `[NotificationProducer] 📤 Enqueued Telegram notification: ${jobId}`
    );
    return job as Job<TelegramNotificationJob>;
  }

  /**
   * Enqueue multiple Telegram notifications in bulk
   */
  async enqueueTelegramNotificationsBulk(
    notifications: Array<{
      data: Omit<TelegramNotificationJob, "type">;
      options?: { priority?: number; delay?: number };
    }>
  ): Promise<Job<TelegramNotificationJob>[]> {
    const jobs = notifications.map(({ data, options }) => ({
      name: "telegram",
      data: { type: "telegram" as const, ...data },
      opts: {
        jobId: `telegram:${data.signalId}:${data.userId}`,
        priority: options?.priority,
        delay: options?.delay,
      },
    }));

    const results = await this.queue.addBulk(jobs);
    console.log(
      `[NotificationProducer] 📤 Enqueued ${results.length} Telegram notifications in bulk`
    );
    return results as Job<TelegramNotificationJob>[];
  }

  /**
   * Check if a notification job already exists (for deduplication check before enqueueing)
   */
  async jobExists(signalId: string, userId: string): Promise<boolean> {
    const jobId = `telegram:${signalId}:${userId}`;
    const job = await this.queue.getJob(jobId);
    return job !== undefined;
  }
}

// ============================================================================
// NotificationWorker - Process jobs from queue
// ============================================================================

export class NotificationWorker {
  private worker: Worker<NotificationJob> | null = null;
  private notificationQueue: NotificationQueue;
  private handlers: NotificationHandlers;
  private config: WorkerConfig;
  private isRunning: boolean = false;

  constructor(
    notificationQueue: NotificationQueue,
    handlers: NotificationHandlers,
    config: WorkerConfig = {}
  ) {
    this.notificationQueue = notificationQueue;
    this.handlers = handlers;
    this.config = {
      concurrency: config.concurrency ?? 10,
      limiter: config.limiter ?? {
        max: 25, // Telegram allows ~30/sec to different chats
        duration: 1000,
      },
    };
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[NotificationWorker] Already running");
      return;
    }

    this.worker = new Worker<NotificationJob>(
      "notifications",
      async (job) => {
        return this.processJob(job);
      },
      {
        connection: this.notificationQueue.getConnection().duplicate(),
        prefix: "maxxit",
        concurrency: this.config.concurrency,
        limiter: this.config.limiter,
      }
    );

    // Event handlers
    this.worker.on("completed", (job) => {
      console.log(`[NotificationWorker] ✅ Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(
        `[NotificationWorker] ❌ Job ${job?.id} failed:`,
        err.message
      );
    });

    this.worker.on("error", (err) => {
      console.error("[NotificationWorker] Worker error:", err.message);
    });

    this.isRunning = true;
    console.log(
      `[NotificationWorker] 🚀 Started with concurrency=${this.config.concurrency}`
    );
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job<NotificationJob>): Promise<any> {
    const { type } = job.data;

    console.log(`[NotificationWorker] 🔄 Processing ${type} job: ${job.id}`);

    switch (type) {
      case "telegram":
        if (!this.handlers.telegram) {
          throw new Error("No Telegram handler registered");
        }
        return this.handlers.telegram(job as Job<TelegramNotificationJob>);

      case "email":
        if (!this.handlers.email) {
          throw new Error("No Email handler registered");
        }
        return this.handlers.email(job as Job<EmailNotificationJob>);

      default:
        throw new Error(`Unknown notification type: ${type}`);
    }
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.worker) {
      return;
    }

    console.log("[NotificationWorker] Stopping...");
    await this.worker.close();
    this.isRunning = false;
    console.log("[NotificationWorker] ✅ Stopped");
  }

  /**
   * Check if worker is running
   */
  isWorkerRunning(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// Helper: Create a pre-configured notification system
// ============================================================================

export interface NotificationSystemConfig {
  redisUrl?: string;
  workerConfig?: WorkerConfig;
  handlers?: NotificationHandlers;
}

export function createNotificationSystem(
  config: NotificationSystemConfig = {}
) {
  const queue = new NotificationQueue({
    redisUrl: config.redisUrl || process.env.REDIS_URL,
  });

  const producer = new NotificationProducer(queue);

  const worker = config.handlers
    ? new NotificationWorker(queue, config.handlers, config.workerConfig)
    : null;

  return {
    queue,
    producer,
    worker,
    /** Close all connections */
    async close() {
      if (worker) {
        await worker.stop();
      }
      await queue.close();
    },
  };
}
