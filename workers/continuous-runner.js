/**
 * Continuous Worker Runner for Railway
 * Runs all workers on scheduled intervals to keep the service alive
 */

const { spawn } = require('child_process');

// Environment variable-based intervals with defaults
const TWEET_INGESTION_INTERVAL = parseInt(process.env.TWEET_INGESTION_INTERVAL || '300000'); // 5 mins
const SIGNAL_GENERATION_INTERVAL = parseInt(process.env.SIGNAL_GENERATION_INTERVAL || '60000'); // 1 min
const RESEARCH_SIGNAL_INTERVAL = parseInt(process.env.RESEARCH_SIGNAL_INTERVAL || '120000'); // 2 mins
const TRADE_EXECUTION_INTERVAL = parseInt(process.env.TRADE_EXECUTION_INTERVAL || '30000'); // 30 sec
const POSITION_MONITOR_INTERVAL = parseInt(process.env.POSITION_MONITOR_INTERVAL || '60000'); // 1 min

const workers = [
  { name: 'Tweet Ingestion', script: 'workers/tweet-ingestion-worker.ts', interval: TWEET_INGESTION_INTERVAL },
  { name: 'Signal Generator', script: 'workers/signal-generator.ts', interval: SIGNAL_GENERATION_INTERVAL },
  { name: 'Research Signal Generator', script: 'workers/research-signal-generator.ts', interval: RESEARCH_SIGNAL_INTERVAL },
  { name: 'Trade Executor', script: 'workers/trade-executor-worker.ts', interval: TRADE_EXECUTION_INTERVAL },
  { name: 'Position Monitor (Combined)', script: 'workers/position-monitor-combined.ts', interval: POSITION_MONITOR_INTERVAL }
];

function runWorker(worker) {
  console.log(`[${new Date().toISOString()}] ▶️  Starting ${worker.name}...`);
  
  const proc = spawn('npx', ['tsx', worker.script], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  proc.on('exit', (code) => {
    if (code === 0) {
      console.log(`[${new Date().toISOString()}] ✅ ${worker.name} completed successfully`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ ${worker.name} exited with code ${code}`);
    }
  });

  proc.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] ❌ ${worker.name} error:`, err.message);
  });
}

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                                                               ║');
console.log('║        🔄 CONTINUOUS WORKER RUNNER - RAILWAY MODE            ║');
console.log('║                                                               ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('📋 Worker Schedule:');
workers.forEach(worker => {
  const intervalSeconds = worker.interval / 1000;
  const intervalMinutes = intervalSeconds / 60;
  const intervalDisplay = intervalSeconds < 60 
    ? `${intervalSeconds}s` 
    : `${intervalMinutes}m`;
  console.log(`  • ${worker.name}: every ${intervalDisplay}`);
});
console.log();

// Start each worker on its interval
workers.forEach(worker => {
  // Run immediately on startup
  console.log(`🚀 Starting ${worker.name} (first run)...`);
  runWorker(worker);
  
  // Then run on interval
  setInterval(() => {
    runWorker(worker);
  }, worker.interval);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ All workers started in continuous mode!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⏰ Workers will run automatically on their schedules');
console.log('🔄 Service will stay alive indefinitely');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down workers...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT received, shutting down workers...');
  process.exit(0);
});

// Keep process alive and log heartbeat every 5 minutes
setInterval(() => {
  console.log(`[${new Date().toISOString()}] 💓 Continuous runner heartbeat - service is alive`);
}, 300000); // 5 minutes

