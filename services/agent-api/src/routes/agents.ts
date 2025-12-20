import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from "@maxxit/database";

const router = Router();

// Schema for agent creation (matching shared/schema.ts)
const VenueEnum = z.enum(["SPOT", "GMX", "HYPERLIQUID", "OSTIUM", "MULTI"]);
const StatusEnum = z.enum(["DRAFT", "PUBLIC", "PRIVATE"]); // Changed from ACTIVE/PAUSED to PUBLIC/PRIVATE

const insertAgentSchema = z.object({
  creator_wallet: z.string(),
  profit_receiver_address: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  venue: VenueEnum.default("MULTI"),
  status: StatusEnum.default("PUBLIC"), // Default to PUBLIC
  weights: z.array(z.number()).optional(),
  proof_of_intent_message: z.string().optional(),
  proof_of_intent_signature: z.string().optional(),
  proof_of_intent_timestamp: z.string().optional(),
});

// Utility functions for case conversion
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
}

function convertKeysToCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
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

// GET /api/agents - List agents with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, venue, order, limit = '20', offset = '0' } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (venue) where.venue = venue;

    const orderBy: any = {};
    if (order && typeof order === 'string') {
      const [field, direction] = order.split('.');
      
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
      orderBy.apr_30d = 'desc';
    }

    const agents = await prisma.agents.findMany({
      where,
      orderBy,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const camelCaseAgents = convertKeysToCamelCase(agents);
    res.status(200).json(camelCaseAgents);
  } catch (error: any) {
    console.error('[Agent API] GET / error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id - Get agent by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const agent = await prisma.agents.findUnique({
      where: { id },
      include: {
        agent_accounts: true,
        agent_deployments: true,
        agent_research_institutes: {
          include: {
            research_institutes: true,
          },
        },
      },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const camelCaseAgent = convertKeysToCamelCase(agent);
    res.status(200).json(camelCaseAgent);
  } catch (error: any) {
    console.error('[Agent API] GET /:id error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch agent' });
  }
});

// POST /api/agents - Create new agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const validated = insertAgentSchema.parse(req.body);
    
    const agent = await prisma.agents.create({
      data: validated,
    });

    const camelCaseAgent = convertKeysToCamelCase(agent);
    res.status(201).json(camelCaseAgent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
      });
    }
    console.error('[Agent API] POST / error:', error);
    res.status(500).json({ error: error.message || 'Failed to create agent' });
  }
});

// PUT /api/agents/:id - Update agent
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const agent = await prisma.agents.update({
      where: { id },
      data: updates,
    });

    const camelCaseAgent = convertKeysToCamelCase(agent);
    res.status(200).json(camelCaseAgent);
  } catch (error: any) {
    console.error('[Agent API] PUT /:id error:', error);
    res.status(500).json({ error: error.message || 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.agents.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Agent deleted successfully' });
  } catch (error: any) {
    console.error('[Agent API] DELETE /:id error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete agent' });
  }
});

export default router;

