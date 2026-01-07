/**
 * Queue Job Types and Definitions
 * 
 * Centralized type definitions for all queue jobs across the system.
 * This ensures type safety when adding and processing jobs.
 */

/**
 * Queue names enum for type safety
 */
export enum QueueName {
  TRADE_EXECUTION = 'trade-execution',
  SIGNAL_GENERATION = 'signal-generation',
  POSITION_MONITOR = 'position-monitor',
  TELEGRAM_NOTIFICATION = 'telegram-notification',
  TELEGRAM_ALPHA_CLASSIFICATION = 'telegram-alpha-classification',
}

/**
 * Base job data interface that all jobs should extend
 */
export interface BaseJobData {
  timestamp: number;
  correlationId?: string;
}

// ============================================
// Trade Execution Queue Jobs
// ============================================

export interface ExecuteSignalJobData extends BaseJobData {
  type: 'EXECUTE_SIGNAL';
  signalId: string;
  deploymentId: string;
}

export interface RetryFailedExecutionJobData extends BaseJobData {
  type: 'RETRY_FAILED_EXECUTION';
  signalId: string;
  deploymentId: string;
  retryCount: number;
}

export type TradeExecutionJobData = 
  | ExecuteSignalJobData 
  | RetryFailedExecutionJobData;

// ============================================
// Signal Generation Queue Jobs
// ============================================

export interface ProcessTweetsJobData extends BaseJobData {
  type: 'PROCESS_TWEETS';
  tweetIds: string[];
}

export interface ProcessTelegramJobData extends BaseJobData {
  type: 'PROCESS_TELEGRAM';
  messageIds: string[];
}

export interface ProcessResearchJobData extends BaseJobData {
  type: 'PROCESS_RESEARCH';
  signalIds: string[];
}

export interface GenerateSignalJobData extends BaseJobData {
  type: 'GENERATE_SIGNAL';
  source: 'tweet' | 'telegram' | 'research';
  sourceId: string;
  agentId: string;
  token: string;
}

/**
 * Job data for generating a signal from a telegram post with LLM decision
 * Each job represents: one post + one deployment + one token
 */
export interface GenerateTelegramSignalJobData extends BaseJobData {
  type: 'GENERATE_TELEGRAM_SIGNAL';
  /** telegram_posts.id */
  postId: string;
  /** agents.id */
  agentId: string;
  /** agent_deployments.id */
  deploymentId: string;
  /** Token symbol (e.g., "BTC") */
  token: string;
  /** Is this a Lazy Trader agent */
  isLazyTraderAgent: boolean;
  /** Influencer impact factor (0-100) */
  influencerImpactFactor: number;
}

export type SignalGenerationJobData = 
  | ProcessTweetsJobData 
  | ProcessTelegramJobData 
  | ProcessResearchJobData
  | GenerateSignalJobData
  | GenerateTelegramSignalJobData;

// ============================================
// Position Monitor Queue Jobs
// ============================================

export interface MonitorPositionJobData extends BaseJobData {
  type: 'MONITOR_POSITION';
  positionId: string;
  deploymentId: string;
}

export interface CheckStopLossJobData extends BaseJobData {
  type: 'CHECK_STOP_LOSS';
  positionId: string;
}

export type PositionMonitorJobData = 
  | MonitorPositionJobData 
  | CheckStopLossJobData;

// ============================================
// Telegram Notification Queue Jobs
// ============================================

export interface SendNotificationJobData extends BaseJobData {
  type: 'SEND_NOTIFICATION';
  userId: string;
  chatId: string;
  message: string;
  notificationType: 'SIGNAL_EXECUTED' | 'POSITION_CLOSED' | 'STOP_LOSS_HIT' | 'TAKE_PROFIT_HIT';
}

export type TelegramNotificationJobData = SendNotificationJobData;

// ============================================
// Telegram Alpha Classification Queue Jobs
// ============================================

export interface ClassifyMessageJobData extends BaseJobData {
  type: 'CLASSIFY_MESSAGE';
  /** telegram_posts.id */
  messageId: string;
}

export type TelegramAlphaJobData = ClassifyMessageJobData;

// ============================================
// Job Result Types
// ============================================

export interface JobResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================
// Job Options
// ============================================

export interface JobOptions {
  /** Unique job ID to prevent duplicates */
  jobId?: string;
  /** Delay in milliseconds before job is processed */
  delay?: number;
  /** Number of retry attempts */
  attempts?: number;
  /** Backoff configuration for retries */
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  /** Remove job from queue after completion */
  removeOnComplete?: boolean | number;
  /** Remove job from queue after failure */
  removeOnFail?: boolean | number;
  /** Job priority (lower number = higher priority) */
  priority?: number;
}

/**
 * Default job options for different queue types
 */
export const DEFAULT_JOB_OPTIONS: Record<QueueName, JobOptions> = {
  [QueueName.TRADE_EXECUTION]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
  [QueueName.SIGNAL_GENERATION]: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 3000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
  [QueueName.POSITION_MONITOR]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
  [QueueName.TELEGRAM_NOTIFICATION]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 1000,
    },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
  [QueueName.TELEGRAM_ALPHA_CLASSIFICATION]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
};
