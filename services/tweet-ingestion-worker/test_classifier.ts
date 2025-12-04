import dotenv from 'dotenv';
dotenv.config();

import { createLLMClassifier } from './src/lib/llm-classifier';

async function testClassifier() {
  try {
    const classifier = createLLMClassifier();
    
    if (!classifier) {
      console.log('❌ LLM Classifier could not be created (no API key)');
      return;
    }
    
    console.log('\n🧪 TESTING LLM CLASSIFIER WITH NEW TWEETS\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const testTweets = [
      {
        text: '$HYPE is gonna go up by 10%',
        id: '1989141535540277343'
      },
      {
        text: '@Arb is gonna go high maybe by 10%',
        id: '1989135555159027926'
      }
    ];
    
    for (const tweet of testTweets) {
      console.log(`\n📝 Tweet: "${tweet.text}"`);
      console.log(`   ID: ${tweet.id}`);
      console.log('   Processing...\n');
      
      const result = await classifier.classifyTweet(tweet.text);
      
      console.log(`   ✅ Result:`);
      console.log(`      Is Signal: ${result.isSignal ? '✅ YES' : '❌ NO'}`);
      console.log(`      Tokens: ${result.tokens.join(', ') || 'none'}`);
      console.log(`      Sentiment: ${result.sentiment}`);
      console.log(`      Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      console.log(`      Reasoning: ${result.reasoning}`);
      console.log('   ───────────────────────────────────────────────────────────');
    }
    
    console.log('\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

testClassifier();
