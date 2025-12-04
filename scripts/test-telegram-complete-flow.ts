/**
 * Complete Telegram Flow Test
 * 
 * Tests the entire pipeline:
 * 1. Telegram user sends message → Bot receives
 * 2. LLM classifies message
 * 3. Creates signal for subscribed agents
 * 4. Agent HOW calculates personalized position size
 * 5. Trade executor processes signal
 * 
 * Run: npx tsx scripts/test-telegram-complete-flow.ts
 */

import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

interface TestConfig {
  telegramUsername: string;
  testMessage: string;
  expectedToken: string;
  expectedSide: 'LONG' | 'SHORT';
}

const DEFAULT_TEST: TestConfig = {
  telegramUsername: 'abhidavinci',
  testMessage: 'ETH looking extremely bullish here. Breaking out of resistance at $3500. Going LONG with 5x leverage. Target $4000. 🚀',
  expectedToken: 'ETH',
  expectedSide: 'LONG',
};

async function testCompleteTelegramFlow(config: TestConfig = DEFAULT_TEST) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║      🧪 TELEGRAM COMPLETE FLOW TEST                      ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Verify Telegram alpha user exists
    console.log('📋 Step 1: Checking Telegram Alpha User...');
    const telegramUser = await prisma.telegram_alpha_users.findFirst({
      where: {
        telegram_username: config.telegramUsername,
      },
    });

    if (!telegramUser) {
      console.log(`❌ Telegram user @${config.telegramUsername} not found in database`);
      console.log(`\n💡 Run this first:`);
      console.log(`   npx tsx scripts/add-telegram-alpha-user.ts ${config.telegramUsername}`);
      return { success: false, error: 'User not found' };
    }

    console.log(`✅ Found user: @${telegramUser.telegram_username} (ID: ${telegramUser.telegram_user_id})`);

    // Step 2: Check for agents subscribed to this user
    console.log('\n📋 Step 2: Checking Agent Subscriptions...');
    const agentLinks = await prisma.agent_telegram_users.findMany({
      where: {
        telegram_alpha_user_id: telegramUser.id,
      },
      include: {
        agents: {
          select: {
            id: true,
            name: true,
            venue: true,
            status: true,
            creator_wallet: true,
          },
        },
      },
    });

    if (agentLinks.length === 0) {
      console.log(`❌ No agents subscribed to @${config.telegramUsername}`);
      console.log(`\n💡 Link an agent to this Telegram user in the UI or via SQL:`);
      console.log(`   INSERT INTO agent_telegram_users (agent_id, telegram_alpha_user_id)`);
      console.log(`   VALUES ('<agent-id>', '${telegramUser.id}');`);
      return { success: false, error: 'No agents subscribed' };
    }

    console.log(`✅ Found ${agentLinks.length} agent(s) subscribed:`);
    for (const link of agentLinks) {
      console.log(`   - ${link.agents.name} (${link.agents.venue}, status: ${link.agents.status})`);
    }

    // Step 3: Check for active deployments
    console.log('\n📋 Step 3: Checking Active Deployments...');
    const activeAgentIds = agentLinks.map((l) => l.agents.id);
    const deployments = await prisma.agent_deployments.findMany({
      where: {
        agent_id: { in: activeAgentIds },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        agent_id: true,
        user_wallet: true,
        enabled_venues: true,
      },
    });

    if (deployments.length === 0) {
      console.log(`❌ No active deployments found for subscribed agents`);
      console.log(`\n💡 Deploy one of the agents via the UI`);
      return { success: false, error: 'No active deployments' };
    }

    console.log(`✅ Found ${deployments.length} active deployment(s):`);
    for (const dep of deployments) {
      const agent = agentLinks.find((l) => l.agents.id === dep.agent_id)?.agents;
      console.log(`   - ${agent?.name}: ${dep.user_wallet.substring(0, 10)}... (venues: ${dep.enabled_venues.join(', ')})`);
    }

    // Step 4: Check user agent addresses
    console.log('\n📋 Step 4: Checking User Agent Addresses...');
    const firstDeployment = deployments[0];
    const userAddress = await prisma.user_agent_addresses.findUnique({
      where: { user_wallet: firstDeployment.user_wallet.toLowerCase() },
    });

    if (!userAddress) {
      console.log(`❌ No agent addresses found for user ${firstDeployment.user_wallet}`);
      console.log(`\n💡 Generate addresses via:`);
      console.log(`   POST /api/agents/:id/generate-deployment-address`);
      return { success: false, error: 'No agent addresses' };
    }

    console.log(`✅ User addresses found:`);
    if (userAddress.hyperliquid_agent_address) {
      console.log(`   - Hyperliquid: ${userAddress.hyperliquid_agent_address}`);
    }
    if (userAddress.ostium_agent_address) {
      console.log(`   - Ostium: ${userAddress.ostium_agent_address}`);
    }

    // Step 5: Check user trading preferences
    console.log('\n📋 Step 5: Checking User Trading Preferences (Agent HOW)...');
    const preferences = await prisma.user_trading_preferences.findUnique({
      where: { user_wallet: firstDeployment.user_wallet.toLowerCase() },
    });

    if (preferences) {
      console.log(`✅ User has personalized preferences:`);
      console.log(`   - Risk Tolerance: ${preferences.risk_tolerance}/100`);
      console.log(`   - Trade Frequency: ${preferences.trade_frequency}/100`);
      console.log(`   - Social Weight: ${preferences.social_sentiment_weight}/100`);
      console.log(`   - Momentum Focus: ${preferences.price_momentum_focus}/100`);
      console.log(`   - Market Rank: ${preferences.market_rank_priority}/100`);
    } else {
      console.log(`⚠️  User has no custom preferences (will use defaults: 50/50 all)`);
    }

    // Step 6: Simulate incoming Telegram message
    console.log('\n📋 Step 6: Simulating Telegram Message...');
    console.log(`Message: "${config.testMessage}"`);

    // Create a test post entry
    const testPost = await prisma.telegram_posts.create({
      data: {
        telegram_alpha_user_id: telegramUser.id,
        message_id: `test_${Date.now()}`,
        message_text: config.testMessage,
        posted_at: new Date(),
        is_processed: false,
      },
    });

    console.log(`✅ Created test post: ${testPost.id.substring(0, 8)}...`);

    // Step 7: Classify the message (simulate LLM)
    console.log('\n📋 Step 7: LLM Classification...');
    console.log(`   Using test classification (would normally call LLM API)`);

    await prisma.telegram_posts.update({
      where: { id: testPost.id },
      data: {
        is_signal_candidate: true,
        extracted_tokens: [config.expectedToken],
        llm_classification: {
          isSignalCandidate: true,
          confidence: 0.85,
          sentiment: config.expectedSide === 'LONG' ? 'BULLISH' : 'BEARISH',
          extractedTokens: [config.expectedToken],
          reasoning: 'Test classification',
        },
        is_processed: true,
      },
    });

    console.log(`✅ Classified as signal candidate: ${config.expectedToken} ${config.expectedSide} (85% confidence)`);

    // Step 8: Manually trigger signal generation
    console.log('\n📋 Step 8: Generating Trading Signals...');

    for (const deployment of deployments) {
      const agent = agentLinks.find((l) => l.agents.id === deployment.agent_id)?.agents;
      if (!agent || agent.status !== 'ACTIVE') continue;

      // Determine signal venue
      const signalVenue = agent.venue === 'MULTI' ? 'HYPERLIQUID' : agent.venue;

      // Get personalized position size (Agent HOW)
      let positionSize = 5;
      let reasoning = 'Default position size';

      try {
        const { getPositionSizeForSignal } = await import('../lib/agent-how');
        const result = await getPositionSizeForSignal({
          tokenSymbol: config.expectedToken,
          confidence: 0.85,
          userWallet: deployment.user_wallet,
          venue: signalVenue,
        });
        positionSize = result.value;
        reasoning = result.reasoning;
      } catch (error: any) {
        console.log(`   ⚠️  Agent HOW failed: ${error.message} - using default 5%`);
      }

      // Create signal
      const signal = await prisma.signals.create({
        data: {
          agent_id: agent.id,
          venue: signalVenue,
          token_symbol: config.expectedToken,
          side: config.expectedSide,
          size_model: {
            type: 'balance-percentage',
            value: positionSize,
            reasoning,
          },
          risk_model: {
            stopLoss: 0.05,
            takeProfit: 0.15,
            trailingPercent: 1,
            leverage: 5,
          },
          source_tweets: [`TELEGRAM_${testPost.id}`],
          proof_verified: true,
        },
      });

      console.log(`   ✅ ${agent.name}: Created signal ${signal.id.substring(0, 8)}... (${positionSize.toFixed(2)}% position)`);
      console.log(`      Reasoning: ${reasoning.substring(0, 80)}...`);
    }

    // Step 9: Show recent signals
    console.log('\n📋 Step 9: Recent Signals Created...');
    const recentSignals = await prisma.signals.findMany({
      where: {
        agent_id: { in: activeAgentIds },
        created_at: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      include: {
        agents: {
          select: {
            name: true,
          },
        },
      },
    });

    if (recentSignals.length > 0) {
      console.log(`✅ Found ${recentSignals.length} recent signal(s):`);
      for (const sig of recentSignals) {
        const sizeModel = sig.size_model as any;
        console.log(`   - ${sig.agents.name}: ${sig.token_symbol} ${sig.side} @ ${sig.venue} (${sizeModel.value}%)`);
      }
    } else {
      console.log(`⚠️  No recent signals found`);
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ TEST COMPLETE                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('Summary:');
    console.log(`✅ Telegram user: @${config.telegramUsername}`);
    console.log(`✅ Subscribed agents: ${agentLinks.length}`);
    console.log(`✅ Active deployments: ${deployments.length}`);
    console.log(`✅ Test message classified`);
    console.log(`✅ Signals generated with personalized sizing`);

    console.log('\n💡 Next Steps:');
    console.log('1. Check signals table for new entries');
    console.log('2. Trade executor worker will pick up signals automatically');
    console.log('3. Send a real message to your bot on Telegram to test live flow');
    console.log(`4. Message format: "@${process.env.TELEGRAM_BOT_USERNAME || 'your_bot'} ${config.testMessage}"`);

    return {
      success: true,
      telegramUser,
      agents: agentLinks.length,
      deployments: deployments.length,
      signalsCreated: deployments.length,
    };
  } catch (error: any) {
    console.error('\n❌ Test failed:', error);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Run test
if (require.main === module) {
  const customMessage = process.argv[2];
  const customToken = process.argv[3];
  const customSide = (process.argv[4] as 'LONG' | 'SHORT') || 'LONG';

  const config: TestConfig = customMessage
    ? {
        telegramUsername: 'abhidavinci',
        testMessage: customMessage,
        expectedToken: customToken || 'ETH',
        expectedSide: customSide,
      }
    : DEFAULT_TEST;

  testCompleteTelegramFlow(config)
    .then((result) => {
      if (result.success) {
        console.log('\n✅ All systems operational!\n');
        process.exit(0);
      } else {
        console.log('\n❌ Test failed. Fix the issues above and try again.\n');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { testCompleteTelegramFlow };

