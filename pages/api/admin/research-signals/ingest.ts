import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { parseResearchSignal } from '../../../../lib/research-signal-parser';

/**
 * Admin API for ingesting research institute signals
 * 
 * POST /api/admin/research-signals/ingest
 * Body: {
 *   institute_id: string,
 *   signal_text: string,
 *   source_url?: string
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { institute_id, signal_text, source_url } = req.body;

    if (!institute_id || !signal_text) {
      return res.status(400).json({ 
        error: 'institute_id and signal_text are required' 
      });
    }

    // Verify institute exists
    const institute = await prisma.research_institutes.findUnique({
      where: { id: institute_id },
    });

    if (!institute) {
      return res.status(404).json({ error: 'Institute not found' });
    }

    if (!institute.is_active) {
      return res.status(400).json({ error: 'Institute is not active' });
    }

    console.log(`[ADMIN] Ingesting signal from ${institute.name}`);
    console.log(`[ADMIN] Text: "${signal_text.substring(0, 100)}..."`);

    // Parse signal using LLM
    const parsed = await parseResearchSignal({
      instituteId: institute_id,
      instituteName: institute.name,
      signalText: signal_text,
      sourceUrl: source_url,
    });

    // Create research signal record
    const signal = await prisma.research_signals.create({
      data: {
        institute_id,
        signal_text,
        source_url: source_url || null,
        extracted_token: parsed.token,
        extracted_side: parsed.side,
        extracted_leverage: parsed.leverage,
        is_valid_signal: parsed.isValid,
        processed_for_trades: false,
      },
    });

    console.log(`[ADMIN] ✅ Signal ingested: ${signal.id}`);
    console.log(`[ADMIN]    Valid: ${parsed.isValid}`);
    console.log(`[ADMIN]    Token: ${parsed.token}, Side: ${parsed.side}, Leverage: ${parsed.leverage}x`);

    return res.status(201).json({
      success: true,
      message: 'Signal ingested successfully',
      signal: {
        id: signal.id,
        institute: institute.name,
        token: parsed.token,
        side: parsed.side,
        leverage: parsed.leverage,
        isValid: parsed.isValid,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Research signal ingest error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

