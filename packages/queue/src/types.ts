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
  TRADER_ALPHA = 'trader-alpha',
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

/**
 * Job data for generating a signal from a trader trade (copy-trading)
 * Each job represents: one trader trade + one deployment + one token
 */
export interface GenerateTraderTradeSignalJobData extends BaseJobData {
  type: 'GENERATE_TRADER_TRADE_SIGNAL';
  /** trader_trades.id */
  tradeId: string;
  /** agents.id */
  agentId: string;
  /** agent_deployments.id */
  deploymentId: string;
  /** Token symbol (e.g., "BTC") */
  tokenSymbol: string;
  /** Trade side ("LONG" or "SHORT") */
  side: string;
  /** Trader's wallet address */
  traderWallet: string;
  /** Leverage multiplier */
  leverage: number;
  /** Entry price */
  entryPrice: number;
  /** Take profit price (optional) */
  takeProfitPrice?: number | null;
  /** Stop loss price (optional) */
  stopLossPrice?: number | null;
  /** Take profit percent (calculated from trader values) */
  takeProfitPercent: number;
  /** Stop loss percent (calculated from trader values) */
  stopLossPercent: number;
  /** Source trade ID from subgraph */
  sourceTradeId: string;
  /** Trader impact factor (0-100) */
  traderImpactFactor: number;
  /** Copy-trade club name (e.g., "BTC Kingmakers") */
  agentName: string;
  /** Copy-trade club description */
  agentDescription?: string | null;
  /** Token filters for this club (e.g., ["BTC"]) */
  tokenFilters: string[];
}

export type SignalGenerationJobData =
  | ProcessTweetsJobData
  | ProcessTelegramJobData
  | ProcessResearchJobData
  | GenerateSignalJobData
  | GenerateTelegramSignalJobData
  | GenerateTraderTradeSignalJobData;

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
// Trader Alpha Queue Jobs (Copy-Trading)
// ============================================

/**
 * Job data for fetching trades from a tracked trader
 * Triggered on interval to poll subgraph for new trades
 */
export interface FetchTraderTradesJobData extends BaseJobData {
  type: 'FETCH_TRADER_TRADES';
  /** Top trader's wallet address */
  traderWallet: string;
  /** Agent ID tracking this trader */
  agentId: string;
  /** Token filters for the agent (empty = all tokens) */
  tokenFilters: string[];
  /** Timestamp to fetch trades since (unix seconds) */
  sinceTimestamp: number;
}

/**
 * Job data for processing a single trader trade into signals
 * Each job represents: one trade + one agent
 */
export interface ProcessTraderTradeJobData extends BaseJobData {
  type: 'PROCESS_TRADER_TRADE';
  /** trader_trades.id */
  tradeId: string;
  /** agents.id */
  agentId: string;
  /** Trader's wallet address */
  traderWallet: string;
  /** Token symbol (e.g., "BTC") */
  tokenSymbol: string;
  /** Trade side ("LONG" or "SHORT") */
  side: string;
  /** Collateral amount in USDC */
  collateral: number;
  /** Leverage multiplier */
  leverage: number;
  /** Entry price */
  entryPrice: number;
  /** Trade timestamp (unix seconds from subgraph) */
  tradeTimestamp: number;
  /** Take profit price (optional) */
  takeProfitPrice?: number;
  /** Stop loss price (optional) */
  stopLossPrice?: number;
}

/**
 * Job data for checking if a trader's trade is still open
 * Polls subgraph to detect when source trader closes their position
 */
export interface CheckTraderTradeStatusJobData extends BaseJobData {
  type: 'CHECK_TRADER_TRADE_STATUS';
  /** Original trade ID from subgraph (e.g., "1145147") */
  tradeId: string;
  /** Full source_trade_id from trader_trades (e.g., "1145147-uuid") */
  sourceTradeId: string;
  /** agents.id */
  agentId: string;
  /** trader_trades.id (uuid) */
  traderTradeDbId: string;
}

export type TraderAlphaJobData =
  | FetchTraderTradesJobData
  | ProcessTraderTradeJobData
  | CheckTraderTradeStatusJobData;

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
  [QueueName.TRADER_ALPHA]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
};
