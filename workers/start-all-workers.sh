#!/bin/bash

# Maxxit Trading System - Start All Workers
# This script starts all background services required for the trading system

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   Maxxit Trading System - Starting All Workers               ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Change to project root
cd "$(dirname "$0")/.." || exit 1

# Kill existing workers if any
echo "🧹 Cleaning up existing workers..."
pkill -f "tweet-ingestion-worker.ts" 2>/dev/null
pkill -f "signal-generator.ts" 2>/dev/null
pkill -f "trade-executor-worker.ts" 2>/dev/null
pkill -f "position-monitor-hyperliquid.ts" 2>/dev/null
pkill -f "position-monitor-ostium.ts" 2>/dev/null
pkill -f "position-monitor-combined.ts" 2>/dev/null
sleep 2

# Create logs directory if it doesn't exist
mkdir -p logs

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Workers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Tweet Ingestion Worker (LLM Filtering - every 5 min)
echo "🔄 Starting Tweet Ingestion Worker (LLM Filtering)..."
npx tsx workers/tweet-ingestion-worker.ts > logs/tweet-ingestion.log 2>&1 &
TWEET_WORKER_PID=$!
echo "   ✅ PID: $TWEET_WORKER_PID (logs/tweet-ingestion.log)"

sleep 2

# 2. Signal Generator Worker (every 1 min)
echo "📊 Starting Signal Generator Worker..."
npx tsx workers/signal-generator.ts > logs/signal-generator.log 2>&1 &
SIGNAL_WORKER_PID=$!
echo "   ✅ PID: $SIGNAL_WORKER_PID (logs/signal-generator.log)"

sleep 2

# 3. Trade Executor Worker (every 30 sec)
echo "💰 Starting Trade Executor Worker..."
npx tsx workers/trade-executor-worker.ts > logs/trade-executor.log 2>&1 &
EXECUTOR_WORKER_PID=$!
echo "   ✅ PID: $EXECUTOR_WORKER_PID (logs/trade-executor.log)"

sleep 2

# 4. Combined Position Monitor Worker (Sequential: Hyperliquid → Ostium)
echo "📈 Starting Combined Position Monitor Worker (Sequential)..."
npx tsx workers/position-monitor-combined.ts > logs/position-monitor.log 2>&1 &
MONITOR_WORKER_PID=$!
echo "   ✅ PID: $MONITOR_WORKER_PID (logs/position-monitor.log)"
echo "   ℹ️  Runs Hyperliquid then Ostium sequentially (no race conditions)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ All Workers Started Successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Worker PIDs:"
echo "  Tweet Ingestion: $TWEET_WORKER_PID"
echo "  Signal Generator: $SIGNAL_WORKER_PID"
echo "  Trade Executor: $EXECUTOR_WORKER_PID"
echo "  Position Monitor (Combined): $MONITOR_WORKER_PID"
echo ""
echo "Monitor logs:"
echo "  tail -f logs/*.log"
echo ""
echo "Stop all workers:"
echo "  ./workers/stop-all-workers.sh"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Save PIDs for later stopping
echo "$TWEET_WORKER_PID" > logs/tweet-worker.pid
echo "$SIGNAL_WORKER_PID" > logs/signal-worker.pid
echo "$EXECUTOR_WORKER_PID" > logs/executor-worker.pid
echo "$MONITOR_WORKER_PID" > logs/monitor-worker.pid

echo "Workers are running in the background. Press Ctrl+C to return to shell."
echo "Workers will continue running after you exit."

