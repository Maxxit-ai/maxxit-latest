/**
 * Redis Connection Manager
 * 
 * Singleton pattern for managing Redis connections used by BullMQ.
 * Provides connection pooling and graceful shutdown support.
 */

import Redis from 'ioredis';

let connection: Redis | null = null;
let subscriberConnection: Redis | null = null;

/**
 * Redis connection configuration options
 */
export interface RedisConnectionOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

/**
 * Get or create the main Redis connection
 * This connection is used for publishing and general operations
 */
export function getConnection(options?: RedisConnectionOptions): Redis {
  if (!connection) {
    const redisUrl = options?.url || process.env.REDIS_URL || 'redis://localhost:6379';
    
    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: options?.maxRetriesPerRequest ?? null,
      enableReadyCheck: options?.enableReadyCheck ?? false,
      lazyConnect: options?.lazyConnect ?? false,
    });

    connection.on('connect', () => {
      console.log('🔗 Redis connection established');
    });

    connection.on('error', (error) => {
      console.error('❌ Redis connection error:', error.message);
    });

    connection.on('close', () => {
      console.log('🔌 Redis connection closed');
    });
  }

  return connection;
}

/**
 * Get or create a subscriber Redis connection
 * BullMQ requires a separate connection for subscribing to events
 */
export function getSubscriberConnection(options?: RedisConnectionOptions): Redis {
  if (!subscriberConnection) {
    const redisUrl = options?.url || process.env.REDIS_URL || 'redis://localhost:6379';
    
    subscriberConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: options?.maxRetriesPerRequest ?? null,
      enableReadyCheck: options?.enableReadyCheck ?? false,
      lazyConnect: options?.lazyConnect ?? false,
    });

    subscriberConnection.on('connect', () => {
      console.log('🔗 Redis subscriber connection established');
    });

    subscriberConnection.on('error', (error) => {
      console.error('❌ Redis subscriber connection error:', error.message);
    });
  }

  return subscriberConnection;
}

/**
 * Close all Redis connections gracefully
 */
export async function closeConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (connection) {
    closePromises.push(
      connection.quit().then(() => {
        console.log('✅ Redis main connection closed');
        connection = null;
      })
    );
  }

  if (subscriberConnection) {
    closePromises.push(
      subscriberConnection.quit().then(() => {
        console.log('✅ Redis subscriber connection closed');
        subscriberConnection = null;
      })
    );
  }

  await Promise.all(closePromises);
}

/**
 * Check if Redis is connected and healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const conn = getConnection();
    const result = await conn.ping();
    return result === 'PONG';
  } catch (error) {
    return false;
  }
}
