import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
dotenv.config();

async function quickCheck() {
  try {
    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    
    console.log('\n🔍 PIPELINE STATUS FOR $HYPE TWEET\n');
    console.log(`⏰ Current Time: ${now.toLocaleTimeString()}\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Check tweets
    const tweets = await prisma.ct_posts.findMany({
      where: {
        tweet_text: {
          contains: 'HYPE',
          mode: 'insensitive'
        },
        tweet_created_at: {
          gte: tenMinAgo
        }
      },
      include: {
        ct_accounts: {
          select: {
            x_username: true
          }
        }
      },
      orderBy: {
        tweet_created_at: 'desc'
      },
      take: 3
    });
    
    console.log(`📥 STAGE 1: Tweet Ingestion`);
    if (tweets.length === 0) {
      console.log('   ⏳ No HYPE tweets in last 10 minutes');
      console.log('   💡 Tweet ingestion worker runs every 5 minutes');
      console.log('   💡 Next cycle will pick up your tweet\n');
    } else {
      console.log(`   ✅ Found ${tweets.length} HYPE tweet(s)!\n`);
      tweets.forEach((tweet, idx) => {
        console.log(`   [${idx + 1}] @${tweet.ct_accounts.x_username}`);
        console.log(`       Text: "${tweet.tweet_text.substring(0, 70)}"`);
        console.log(`       Is Signal?: ${tweet.is_signal_candidate ? '✅ YES' : '⏳ Not yet classified'}`);
        if (tweet.is_signal_candidate) {
          const tokens = tweet.extracted_tokens || [];
          console.log(`       Tokens: ${tokens.join(', ') || 'N/A'}`);
          console.log(`       Side: ${tweet.signal_type || 'N/A'}`);
          console.log(`       Confidence: ${tweet.confidence_score || 0}%`);
        }
        console.log(`       Ingested: ${new Date(tweet.tweet_created_at).toLocaleTimeString()}`);
        console.log('');
      });
    }
    
    // Check signals
    const signals = await prisma.signals.findMany({
      where: {
        token_symbol: 'HYPE',
        created_at: {
          gte: tenMinAgo
        }
      },
      include: {
        agents: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 3
    });
    
    console.log(`📊 STAGE 3: Signal Generation`);
    if (signals.length === 0) {
      console.log('   ⏳ No HYPE signals yet');
      console.log('   💡 Signal generator runs every 5 minutes after classification\n');
    } else {
      console.log(`   ✅ Found ${signals.length} signal(s)!\n`);
      signals.forEach((signal, idx) => {
        const sizeModel = typeof signal.size_model === 'string'
          ? JSON.parse(signal.size_model)
          : signal.size_model;
        console.log(`   [${idx + 1}] Agent: ${signal.agents.name}`);
        console.log(`       ${signal.side} ${signal.token_symbol} on ${signal.venue}`);
        console.log(`       Position Size: ${sizeModel?.value || 0}%`);
        console.log(`       Created: ${new Date(signal.created_at).toLocaleTimeString()}`);
        console.log('');
      });
    }
    
    // Check positions
    const positions = await prisma.positions.findMany({
      where: {
        token_symbol: 'HYPE',
        opened_at: {
          gte: tenMinAgo
        }
      },
      include: {
        agent_deployments: {
          include: {
            agents: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        opened_at: 'desc'
      },
      take: 3
    });
    
    console.log(`⚡ STAGE 4: Trade Execution`);
    if (positions.length === 0) {
      console.log('   ⏳ No HYPE positions yet');
      console.log('   💡 Trade executor runs every 2 minutes after signal\n');
    } else {
      console.log(`   ✅ Found ${positions.length} position(s)!\n`);
      positions.forEach((pos, idx) => {
        console.log(`   [${idx + 1}] Agent: ${pos.agent_deployments.agents.name}`);
        console.log(`       ${pos.side} ${pos.token_symbol} on ${pos.venue}`);
        console.log(`       Size: ${pos.qty.toString()} @ $${pos.entry_price.toString()}`);
        console.log(`       Status: ${pos.status}`);
        console.log(`       Opened: ${new Date(pos.opened_at).toLocaleTimeString()}`);
        console.log('');
      });
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('💡 WORKER SCHEDULES:');
    console.log('   • Tweet Ingestion: Every 5 minutes');
    console.log('   • Signal Generator: Every 5 minutes');
    console.log('   • Trade Executor: Every 2 minutes');
    console.log('   • Position Monitor: Every 1 minute\n');
    
    if (tweets.length === 0) {
      console.log('⏰ NEXT STEPS:');
      console.log('   1. Tweet ingestion worker will pick up your tweet in next cycle');
      console.log('   2. LLM will classify it (should recognize HYPE + bullish)');
      console.log('   3. Signal generator will create signals (~5-10 min)');
      console.log('   4. Trade executor will execute (~2-4 min after signal)');
      console.log('   5. Position monitor starts tracking\n');
      console.log('   📊 Total time: ~10-15 minutes for full pipeline\n');
    } else if (tweets.length > 0 && !tweets[0].is_signal_candidate) {
      console.log('⏰ NEXT STEPS:');
      console.log('   ✅ Tweet ingested');
      console.log('   ⏳ Waiting for LLM classification (in tweet-ingestion-worker)');
      console.log('   💡 This should happen in the same cycle as ingestion\n');
    } else if (tweets.length > 0 && tweets[0].is_signal_candidate && signals.length === 0) {
      console.log('⏰ NEXT STEPS:');
      console.log('   ✅ Tweet classified as signal candidate');
      console.log('   ⏳ Waiting for signal generation (next 5-min cycle)');
      console.log('   💡 Signal generator picks up classified tweets\n');
    } else if (signals.length > 0 && positions.length === 0) {
      console.log('⏰ NEXT STEPS:');
      console.log('   ✅ Signal generated');
      console.log('   ⏳ Waiting for trade execution (next 2-min cycle)');
      console.log('   💡 Trade executor will call Hyperliquid/Ostium service\n');
    } else if (positions.length > 0) {
      console.log('🎉 PIPELINE COMPLETE!');
      console.log('   ✅ Tweet → Classification → Signal → Position');
      console.log('   📈 Position monitor is now tracking your trade\n');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
  // Note: Don't disconnect - using singleton
}

quickCheck();
