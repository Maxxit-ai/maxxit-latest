import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { insertAgentSchema } from '@shared/schema';
import { z } from 'zod';

// Convert camelCase to snake_case for Prisma field names
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Convert snake_case to camelCase for API responses
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
}

// Convert all keys in an object from snake_case to camelCase
function convertKeysToCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj; // Don't convert Date objects
  if (Array.isArray(obj)) return obj.map(convertKeysToCamelCase);
  
  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = convertKeysToCamelCase(obj[key]);
    }
  }
  return result;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('[API /agents] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { status, venue, order, limit = '20', offset = '0' } = req.query;

  const where: any = {};
  if (status) where.status = status;
  if (venue) where.venue = venue;

  const orderBy: any = {};
  if (order) {
    const [field, direction] = (order as string).split('.');
    
    // Special handling for fields with numbers (camelToSnake doesn't handle these)
    const fieldMap: Record<string, string> = {
      'apr30d': 'apr_30d',
      'apr90d': 'apr_90d',
      'aprSi': 'apr_si',
      'sharpe30d': 'sharpe_30d',
      'sharpe90d': 'sharpe_90d',
      'sharpeSi': 'sharpe_si',
    };
    
    const snakeField = fieldMap[field] || camelToSnake(field);
    orderBy[snakeField] = direction === 'desc' ? 'desc' : 'asc';
  } else {
    orderBy.apr_30d = 'desc'; // Default sort (snake_case for Prisma)
  }

  const agents = await prisma.agents.findMany({
    where,
    orderBy,
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
  });

  // Convert response keys to camelCase for frontend
  const camelCaseAgents = convertKeysToCamelCase(agents);
  return res.status(200).json(camelCaseAgents);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  // Validate request body
  try {
    const validated = insertAgentSchema.parse(req.body);
    
    // Create agent
    const agent = await prisma.agents.create({
      data: validated,
    });

    // Convert response keys to camelCase for frontend
    const camelCaseAgent = convertKeysToCamelCase(agent);
    return res.status(201).json(camelCaseAgent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
      });
    }
    throw error;
  }
}
