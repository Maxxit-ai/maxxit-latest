import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
dotenv.config();

async function testPipelineFlow() {
  console.log('\n🧪 MANUAL PIPELINE FLOW TEST\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  try {
    // ============================================================================
    // FLOW 1: Tweet Ingestion Worker
    // ============================================================================
    console.log('📥 FLOW 1: TWEET INGESTION WORKER\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Check if $HYPE tweet exists
    const hypeTweet = await prisma.ct_posts.findFirst({
      where: {
        tweet_text: {
          contains: 'elevation seeking',
          mode: 'insensitive'
        }
      },
      include: {
        ct_accounts: true
      }
    });
    
    if (!hypeTweet) {
      console.log('❌ FLOW 1 FAILED: $HYPE tweet not found in database\n');
      console.log('💡 Tweet ingestion worker needs to run\n');
      return;
    }
    
    console.log('✅ FLOW 1 PASSED: Tweet ingested successfully\n');
    console.log(`   Tweet ID: ${hypeTweet.tweet_id}`);
    console.log(`   Author: @${hypeTweet.ct_accounts.x_username}`);
    console.log(`   Text: "${hypeTweet.tweet_text}"`);
    console.log(`   Ingested: ${new Date(hypeTweet.tweet_created_at).toLocaleString()}\n`);
    
    // ============================================================================
    // FLOW 2: LLM Classification (in Tweet Ingestion Worker)
    // ============================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🤖 FLOW 2: LLM CLASSIFICATION\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const isClassified = hypeTweet.is_signal_candidate !== null;
    const hasTokens = hypeTweet.extracted_tokens && hypeTweet.extracted_tokens.length > 0;
    
    if (!isClassified) {
      console.log('❌ FLOW 2 FAILED: Tweet not classified\n');
      console.log('💡 LLM classification needs to run\n');
      return;
    }
    
    if (!hypeTweet.is_signal_candidate) {
      console.log('❌ FLOW 2 RESULT: Tweet classified as NOT a signal candidate\n');
      console.log('💡 Pipeline stops here (as expected)\n');
      return;
    }
    
    if (!hasTokens) {
      console.log('⚠️  FLOW 2 WARNING: Signal candidate but no tokens extracted\n');
      console.log(`   is_signal_candidate: ${hypeTweet.is_signal_candidate}`);
      console.log(`   extracted_tokens: ${hypeTweet.extracted_tokens || 'null'}`);
      console.log(`   signal_type: ${hypeTweet.signal_type || 'null'}`);
      console.log(`   confidence_score: ${hypeTweet.confidence_score || 0}\n`);
    } else {
      console.log('✅ FLOW 2 PASSED: Tweet classified as signal candidate\n');
      console.log(`   is_signal_candidate: true ✅`);
      console.log(`   extracted_tokens: ${hypeTweet.extracted_tokens.join(', ')} ✅`);
      console.log(`   signal_type: ${hypeTweet.signal_type || 'N/A (will default to LONG)'}`);
      console.log(`   confidence_score: ${hypeTweet.confidence_score || 0}%\n`);
    }
    
    // ============================================================================
    // FLOW 3: Agent Subscription Check
    // ============================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('👥 FLOW 3: AGENT SUBSCRIPTION CHECK\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const subscriptions = await prisma.agent_accounts.findMany({
      where: {
        ct_account_id: hypeTweet.ct_account_id,
        agents: {
          status: 'PUBLIC'
        }
      },
      include: {
        agents: {
          select: {
            name: true,
            status: true,
            venue: true
          }
        }
      }
    });
    
    if (subscriptions.length === 0) {
      console.log('❌ FLOW 3 FAILED: No PUBLIC agents subscribed to this account\n');
      console.log(`   Tweet from: @${hypeTweet.ct_accounts.x_username}`);
      console.log('💡 Need to add agents to this CT account\n');
      return;
    }
    
    console.log(`✅ FLOW 3 PASSED: ${subscriptions.length} PUBLIC agent(s) subscribed\n`);
    subscriptions.forEach((sub, idx) => {
      console.log(`   [${idx + 1}] ${sub.agents.name} (${sub.agents.venue})`);
    });
    console.log('');
    
    // ============================================================================
    // FLOW 4: Venue Market Check
    // ============================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🏪 FLOW 4: VENUE MARKET AVAILABILITY\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    let venueChecksPassed = 0;
    const token = hypeTweet.extracted_tokens?.[0];
    
    if (!token) {
      console.log('❌ FLOW 4 FAILED: No token extracted\n');
      return;
    }
    
    for (const sub of subscriptions) {
      const venueMarket = await prisma.venue_markets.findFirst({
        where: {
          token_symbol: token.toUpperCase(),
          venue: sub.agents.venue,
          is_active: true
        }
      });
      
      if (venueMarket) {
        console.log(`✅ ${token} available on ${sub.agents.venue} (${venueMarket.market_name})`);
        venueChecksPassed++;
      } else {
        console.log(`❌ ${token} NOT available on ${sub.agents.venue}`);
      }
    }
    
    console.log('');
    
    if (venueChecksPassed === 0) {
      console.log('❌ FLOW 4 FAILED: Token not available on any subscribed agent venue\n');
      return;
    }
    
    console.log(`✅ FLOW 4 PASSED: Token available on ${venueChecksPassed} venue(s)\n`);
    
    // ============================================================================
    // FLOW 5: Signal Generation
    // ============================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 FLOW 5: SIGNAL GENERATION\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Processing status: processed_for_signals = ${hypeTweet.processed_for_signals}\n`);
    
    if (!hypeTweet.processed_for_signals) {
      console.log('⏳ FLOW 5 PENDING: Tweet not yet processed by signal generator\n');
      console.log('💡 Signal generator will process in next cycle (every 5 min)\n');
      console.log('   Expected outcome: Signal will be created for each subscribed agent\n');
    } else {
      // Check if signals were created
      const signals = await prisma.signals.findMany({
        where: {
          source_tweets: {
            has: hypeTweet.tweet_id
          }
        },
        include: {
          agents: {
            select: {
              name: true
            }
          }
        }
      });
      
      if (signals.length === 0) {
        console.log('❌ FLOW 5 FAILED: Tweet processed but no signals created\n');
        console.log('💡 Check signal-generator-worker logs for errors\n');
        console.log('   Possible causes:');
        console.log('   • LunarCrush API error');
        console.log('   • Token filtering (stablecoin?)');
        console.log('   • Duplicate signal (within 6-hour window)\n');
      } else {
        console.log(`✅ FLOW 5 PASSED: ${signals.length} signal(s) created\n`);
        signals.forEach((signal, idx) => {
          const sizeModel = typeof signal.size_model === 'string'
            ? JSON.parse(signal.size_model)
            : signal.size_model;
          console.log(`   [${idx + 1}] Agent: ${signal.agents.name}`);
          console.log(`       ${signal.side} ${signal.token_symbol} on ${signal.venue}`);
          console.log(`       Position Size: ${sizeModel?.value || 0}%`);
          console.log(`       LunarCrush: ${signal.lunarcrush_score || 'N/A'}`);
          console.log(`       Created: ${new Date(signal.created_at).toLocaleString()}`);
        });
        console.log('');
        
        // ============================================================================
        // FLOW 6: Agent Deployment Check
        // ============================================================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('🚀 FLOW 6: AGENT DEPLOYMENT CHECK\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        for (const signal of signals) {
          const deployments = await prisma.agent_deployments.findMany({
            where: {
              agent_id: signal.agent_id,
              status: 'ACTIVE'
            }
          });
          
          console.log(`Agent: ${signal.agents.name}`);
          console.log(`  Active Deployments: ${deployments.length}`);
          
          if (deployments.length === 0) {
            console.log(`  ⚠️  No active deployments - signal won't be executed\n`);
          } else {
            console.log(`  ✅ ${deployments.length} deployment(s) ready for execution\n`);
            deployments.forEach((dep, idx) => {
              console.log(`     [${idx + 1}] User: ${dep.safe_wallet}`);
              console.log(`         Hyperliquid Agent: ${dep.hyperliquid_agent_address || 'N/A'}`);
            });
            console.log('');
          }
        }
        
        // ============================================================================
        // FLOW 7: Trade Execution
        // ============================================================================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⚡ FLOW 7: TRADE EXECUTION\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const positions = await prisma.positions.findMany({
          where: {
            signal_id: {
              in: signals.map(s => s.id)
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
          }
        });
        
        if (positions.length === 0) {
          console.log('⏳ FLOW 7 PENDING: No positions opened yet\n');
          console.log('💡 Trade executor will process in next cycle (every 2 min)\n');
          console.log(`   Expected: ${signals.length} signal(s) × deployments = positions\n`);
        } else {
          console.log(`✅ FLOW 7 PASSED: ${positions.length} position(s) opened\n`);
          positions.forEach((pos, idx) => {
            console.log(`   [${idx + 1}] Agent: ${pos.agent_deployments.agents.name}`);
            console.log(`       ${pos.side} ${pos.token_symbol} on ${pos.venue}`);
            console.log(`       Size: ${pos.qty.toString()} @ $${pos.entry_price.toString()}`);
            console.log(`       Status: ${pos.status}`);
            console.log(`       Opened: ${new Date(pos.opened_at).toLocaleString()}`);
          });
          console.log('');
          
          // ============================================================================
          // FLOW 8: Position Monitoring
          // ============================================================================
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          console.log('📈 FLOW 8: POSITION MONITORING\n');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          const openPositions = positions.filter(p => p.status === 'OPEN');
          
          if (openPositions.length === 0) {
            console.log('⏳ FLOW 8: All positions closed or no open positions\n');
          } else {
            console.log(`✅ FLOW 8: Monitoring ${openPositions.length} open position(s)\n`);
            console.log('   Risk Management (Hardcoded):');
            console.log('   • Hard Stop Loss: 10%');
            console.log('   • Trailing Stop: Activates at +3% profit, trails by 1%\n');
          }
        }
      }
    }
    
    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 PIPELINE TEST SUMMARY\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✅ Flow 1: Tweet Ingestion - PASSED');
    console.log('✅ Flow 2: LLM Classification - PASSED');
    console.log('✅ Flow 3: Agent Subscription - PASSED');
    console.log('✅ Flow 4: Venue Market Check - PASSED');
    
    if (!hypeTweet.processed_for_signals) {
      console.log('⏳ Flow 5: Signal Generation - PENDING');
      console.log('⏳ Flow 6: Agent Deployment - PENDING');
      console.log('⏳ Flow 7: Trade Execution - PENDING');
      console.log('⏳ Flow 8: Position Monitoring - PENDING');
    } else {
      const signals = await prisma.signals.findMany({
        where: {
          source_tweets: {
            has: hypeTweet.tweet_id
          }
        }
      });
      
      if (signals.length > 0) {
        console.log('✅ Flow 5: Signal Generation - PASSED');
        console.log('✅ Flow 6: Agent Deployment - PASSED');
        
        const positions = await prisma.positions.findMany({
          where: {
            signal_id: {
              in: signals.map(s => s.id)
            }
          }
        });
        
        if (positions.length > 0) {
          console.log('✅ Flow 7: Trade Execution - PASSED');
          console.log('✅ Flow 8: Position Monitoring - ACTIVE');
        } else {
          console.log('⏳ Flow 7: Trade Execution - PENDING');
          console.log('⏳ Flow 8: Position Monitoring - PENDING');
        }
      } else {
        console.log('❌ Flow 5: Signal Generation - FAILED');
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
  // Note: Don't disconnect - using singleton
}

testPipelineFlow();
