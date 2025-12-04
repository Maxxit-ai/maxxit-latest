/**
 * Health Check Utilities
 * 
 * Provides standardized health check endpoints.
 */

import { Request, Response } from 'express';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  uptime: number;
  database?: 'connected' | 'disconnected';
  [key: string]: any;
}

/**
 * Create a health check handler
 */
export function createHealthCheckHandler(
  serviceName: string,
  additionalChecks?: () => Promise<Record<string, any>>
) {
  return async (req: Request, res: Response) => {
    const result: HealthCheckResult = {
      status: 'ok',
      service: serviceName,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    if (additionalChecks) {
      try {
        const checks = await additionalChecks();
        Object.assign(result, checks);
      } catch (error) {
        result.status = 'error';
      }
    }

    res.status(result.status === 'ok' ? 200 : 503).json(result);
  };
}

