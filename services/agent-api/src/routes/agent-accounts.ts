import { Router, Request, Response } from 'express';
import { prisma } from "@maxxit/database";

const router = Router();

// GET /api/agent-accounts - List agent accounts for a specific agent
router.get('/', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.query;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    const accounts = await prisma.agent_accounts.findMany({
      where: { agent_id: agentId },
    });

    res.status(200).json(accounts);
  } catch (error: any) {
    console.error('[Agent API] GET /agent-accounts error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch agent accounts' });
  }
});

// POST /api/agent-accounts - Link X account to agent
router.post('/', async (req: Request, res: Response) => {
  try {
    const { agentId, ctAccountId } = req.body;

    if (!agentId || !ctAccountId) {
      return res.status(400).json({ error: 'Agent ID and CT account ID are required' });
    }

    const account = await prisma.agent_accounts.create({
      data: {
        agent_id: agentId,
        ct_account_id: ctAccountId,
      },
    });

    res.status(201).json(account);
  } catch (error: any) {
    console.error('[Agent API] POST /agent-accounts error:', error);
    res.status(500).json({ error: error.message || 'Failed to create agent account' });
  }
});

// DELETE /api/agent-accounts/:id - Remove linked account
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.agent_accounts.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Agent account deleted successfully' });
  } catch (error: any) {
    console.error('[Agent API] DELETE /agent-accounts/:id error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete agent account' });
  }
});

export default router;

