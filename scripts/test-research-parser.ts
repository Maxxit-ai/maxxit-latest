/**
 * Test Research Signal Parser
 * Quick test to verify the LLM parser works correctly
 * 
 * Run: npx tsx scripts/test-research-parser.ts
 */

import { testSignalParser } from '../lib/research-signal-parser';

async function runTest() {
  console.log('🧪 Testing Research Signal Parser\n');
  console.log('This will call the LLM to parse sample trading signals...\n');

  await testSignalParser();

  console.log('\n✅ Test complete!');
}

runTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

