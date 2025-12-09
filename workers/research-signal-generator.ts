/**
 * Research Signal Generator Worker
 * Processes research institute signals and creates trading signals for subscribed agents
 * 
 * Uses Agent HOW: Personalized position sizing based on user preferences
 * 
 * Run: npx tsx workers/research-signal-generator.ts
 */

import { parseResearchSignal } from '../lib/research-signal-parser';
import { prisma } from '../lib/prisma';
import { getPositionSizeForSignal } from '../lib/agent-how';

async function processResearchSignals() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║      📊 RESEARCH SIGNAL GENERATOR WORKER                     ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Get unprocessed research signals that are valid
    const signals = await prisma.research_signals.findMany({
      where: {
        processed_for_trades: false,
        is_valid_signal: true, // Only process signals marked as valid
      },
      include: {
        research_institutes: {
          include: {
            agent_research_institutes: {
              include: {
                agents: {
                  select: {
                    id: true,
                    name: true,
                    venue: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'asc',
      },
      take: 50, // Process max 50 signals at a time
    });

    console.log(`📊 Found ${signals.length} unprocessed valid research signals\n`);

    if (signals.length === 0) {
      console.log('✅ No signals to process\n');
      return { success: true, signalsProcessed: 0 };
    }

    let signalsProcessed = 0;
    let tradingSignalsCreated = 0;

    for (const signal of signals) {
      try {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📝 Processing Signal: ${signal.id.substring(0, 8)}...`);
        console.log(`   Institute: ${signal.research_institutes.name}`);
        console.log(`   Token: ${signal.extracted_token}`);
        console.log(`   Side: ${signal.extracted_side}`);
        console.log(`   Leverage: ${signal.extracted_leverage}x`);

        // Get agents following this institute
        const agentLinks = signal.research_institutes.agent_research_institutes;
        const activeAgents = agentLinks
          .map(link => link.agents)
          .filter(agent => agent.status === 'ACTIVE');

        console.log(`   👥 Active agents following: ${activeAgents.length}`);

        if (activeAgents.length === 0) {
          console.log(`   ⚠️  No active agents - skipping`);
          await prisma.research_signals.update({
            where: { id: signal.id },
            data: { processed_for_trades: true },
          });
          signalsProcessed++;
          continue;
        }

        // Create trading signal for each agent
        for (const agent of activeAgents) {
          try {
            // Check for duplicate (same agent, token, same 6h bucket)
            const now = new Date();
            const bucket6hStart = new Date(
              Math.floor(now.getTime() / (6 * 60 * 60 * 1000)) * 6 * 60 * 60 * 1000
            );

            const existing = await prisma.signals.findFirst({
              where: {
                agent_id: agent.id,
                token_symbol: signal.extracted_token,
                created_at: {
                  gte: bucket6hStart,
                },
              },
            });

            if (existing) {
              console.log(`      ⚠️  ${agent.name}: Signal already exists for this token in current bucket`);
              continue;
            }

            // For MULTI venue agents, default to HYPERLIQUID (Agent Where will route dynamically)
            const signalVenue = agent.venue === 'MULTI' ? 'HYPERLIQUID' : agent.venue;

            // Get personalized position size using Agent HOW
            // Use first active deployment's user preferences (or default 5% if no deployments)
            let positionSize = 5; // Default
            let reasoning = 'Default position size (no user preferences available)';
            
            try {
              // Get active deployments for this agent
              const deployments = await prisma.agent_deployments.findMany({
                where: {
                  agent_id: agent.id,
                  status: 'ACTIVE',
                },
                select: {
                  user_wallet: true,
                },
                take: 1, // Use first deployment's preferences
              });

              if (deployments.length > 0) {
                const userWallet = deployments[0].user_wallet;
                
                // Calculate personalized position size (Agent HOW)
                const positionResult = await getPositionSizeForSignal({
                  tokenSymbol: signal.extracted_token!,
                  confidence: 0.7, // Research signals have default 70% confidence
                  userWallet,
                  venue: signalVenue,
                });

                positionSize = positionResult.value;
                reasoning = positionResult.reasoning;
                console.log(`      📊 Agent HOW: ${positionSize.toFixed(2)}% position`);
              }
            } catch (sizeError: any) {
              console.log(`      ⚠️  Agent HOW failed: ${sizeError.message} - using default 5%`);
            }

            // Create trading signal with PERSONALIZED position size
            const tradingSignal = await prisma.signals.create({
              data: {
                agent_id: agent.id,
                venue: signalVenue, // MULTI agents → HYPERLIQUID (Agent Where will re-route if needed)
                token_symbol: signal.extracted_token!,
                side: signal.extracted_side!,
                size_model: {
                  type: 'balance-percentage',
                  value: positionSize, // PERSONALIZED via Agent HOW
                  reasoning, // Store reasoning for transparency
                },
                risk_model: {
                  stopLoss: 0.05, // 5% stop loss
                  takeProfit: 0.15, // 15% take profit
                  trailingPercent: 1, // 1% trailing stop
                  leverage: signal.extracted_leverage || 3,
                },
                source_tweets: [`RESEARCH_${signal.id}`],
                proof_verified: true,
              },
            });

            console.log(`      ✅ ${agent.name} (${agent.venue}): Signal ${tradingSignal.id.substring(0, 8)}... (${positionSize.toFixed(2)}% position)`);
            tradingSignalsCreated++;
          } catch (agentError: any) {
            console.error(`      ❌ ${agent.name}: Failed - ${agentError.message}`);
          }
        }

        // Mark research signal as processed
        await prisma.research_signals.update({
          where: { id: signal.id },
          data: { processed_for_trades: true },
        });

        signalsProcessed++;
      } catch (signalError: any) {
        console.error(`   ❌ Error processing signal: ${signalError.message}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📈 Summary:`);
    console.log(`   Research signals processed: ${signalsProcessed}`);
    console.log(`   Trading signals created: ${tradingSignalsCreated}`);
    console.log('\n✅ Research signal generation complete!\n');

    return {
      success: true,
      signalsProcessed,
      tradingSignalsCreated,
    };
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
  // Note: Don't disconnect - using singleton
}

// Auto-run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  processResearchSignals()
    .then(result => {
      console.log('[ResearchSignalWorker] Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[ResearchSignalWorker] Fatal error:', error);
      process.exit(1);
    });
}

export { processResearchSignals };

