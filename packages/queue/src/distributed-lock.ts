/**
 * Distributed Lock Manager
 * 
 * Provides distributed locking using Redis to prevent concurrent
 * processing of the same job across multiple workers.
 */

import { getConnection } from './connection';

const DEFAULT_LOCK_TTL = 30000; // 30 seconds
const LOCK_RETRY_DELAY = 100; // 100ms between retries

/**
 * Acquire a distributed lock
 * 
 * @param lockKey - Unique key for the lock
 * @param ttl - Lock time-to-live in milliseconds
 * @returns true if lock was acquired, false otherwise
 */
export async function acquireLock(
  lockKey: string,
  ttl: number = DEFAULT_LOCK_TTL
): Promise<boolean> {
  const connection = getConnection();
  const lockValue = `${process.pid}-${Date.now()}`;

  try {
    const result = await connection.set(
      `lock:${lockKey}`,
      lockValue,
      'PX', ttl,
      'NX'
    );

    return result === 'OK';
  } catch (error) {
    console.error(`Error acquiring lock ${lockKey}:`, error);
    return false;
  }
}

/**
 * Release a distributed lock
 * 
 * @param lockKey - Unique key for the lock
 */
export async function releaseLock(lockKey: string): Promise<void> {
  const connection = getConnection();

  try {
    await connection.del(`lock:${lockKey}`);
  } catch (error) {
    console.error(`Error releasing lock ${lockKey}:`, error);
  }
}

/**
 * Extend the TTL of an existing lock
 * 
 * @param lockKey - Unique key for the lock
 * @param ttl - New TTL in milliseconds
 * @returns true if lock was extended, false if lock doesn't exist
 */
export async function extendLock(
  lockKey: string,
  ttl: number = DEFAULT_LOCK_TTL
): Promise<boolean> {
  const connection = getConnection();

  try {
    const result = await connection.pexpire(`lock:${lockKey}`, ttl);
    return result === 1;
  } catch (error) {
    console.error(`Error extending lock ${lockKey}:`, error);
    return false;
  }
}

/**
 * Check if a lock exists
 * 
 * @param lockKey - Unique key for the lock
 */
export async function isLocked(lockKey: string): Promise<boolean> {
  const connection = getConnection();

  try {
    const exists = await connection.exists(`lock:${lockKey}`);
    return exists === 1;
  } catch (error) {
    console.error(`Error checking lock ${lockKey}:`, error);
    return false;
  }
}

/**
 * Execute a function with a distributed lock
 * 
 * @param lockKey - Unique key for the lock
 * @param fn - Function to execute while holding the lock
 * @param ttl - Lock TTL in milliseconds
 * @returns The result of the function, or undefined if lock couldn't be acquired
 */
export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_LOCK_TTL
): Promise<T | undefined> {
  const acquired = await acquireLock(lockKey, ttl);

  if (!acquired) {
    console.log(`Could not acquire lock: ${lockKey}`);
    return undefined;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(lockKey);
  }
}

/**
 * Wait for a lock to become available, then acquire it
 * 
 * @param lockKey - Unique key for the lock
 * @param timeout - Maximum time to wait in milliseconds
 * @param ttl - Lock TTL in milliseconds
 * @returns true if lock was acquired, false if timeout
 */
export async function waitForLock(
  lockKey: string,
  timeout: number = 10000,
  ttl: number = DEFAULT_LOCK_TTL
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const acquired = await acquireLock(lockKey, ttl);

    if (acquired) {
      return true;
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY));
  }

  return false;
}

/**
 * Generate a lock key for a signal-deployment pair
 */
export function getSignalDeploymentLockKey(signalId: string, deploymentId: string): string {
  return `signal-execution:${signalId}:${deploymentId}`;
}

/**
 * Generate a lock key for a position monitor
 */
export function getPositionMonitorLockKey(positionId: string): string {
  return `position-monitor:${positionId}`;
}

/**
 * Generate a lock key for telegram message classification
 */
export function getMessageClassificationLockKey(messageId: string): string {
  return `message-classification:${messageId}`;
}

/**
 * Generate a lock key for signal generation (post + deployment + token)
 */
export function getSignalGenerationLockKey(postId: string, deploymentId: string, token: string): string {
  return `signal-generation:${postId}:${deploymentId}:${token}`;
}

/**
 * Generate a lock key for trader alpha trade processing (trade + agent)
 */
export function getTraderTradeLockKey(sourceTradeId: string, agentId: string): string {
  return `trader-trade:${sourceTradeId}:${agentId}`;
}
