#!/bin/bash

# Maxxit Trading System - Stop All Workers

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   Maxxit Trading System - Stopping All Workers               ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Change to project root
cd "$(dirname "$0")/.." || exit 1

# Stop workers by PID if available
if [ -f logs/tweet-worker.pid ]; then
  PID=$(cat logs/tweet-worker.pid)
  echo "🛑 Stopping Tweet Ingestion Worker (PID: $PID)..."
  kill $PID 2>/dev/null && echo "   ✅ Stopped" || echo "   ⚠️  Already stopped"
  rm logs/tweet-worker.pid
fi

if [ -f logs/signal-worker.pid ]; then
  PID=$(cat logs/signal-worker.pid)
  echo "🛑 Stopping Signal Generator Worker (PID: $PID)..."
  kill $PID 2>/dev/null && echo "   ✅ Stopped" || echo "   ⚠️  Already stopped"
  rm logs/signal-worker.pid
fi

if [ -f logs/executor-worker.pid ]; then
  PID=$(cat logs/executor-worker.pid)
  echo "🛑 Stopping Trade Executor Worker (PID: $PID)..."
  kill $PID 2>/dev/null && echo "   ✅ Stopped" || echo "   ⚠️  Already stopped"
  rm logs/executor-worker.pid
fi

if [ -f logs/monitor-worker.pid ]; then
  PID=$(cat logs/monitor-worker.pid)
  echo "🛑 Stopping Position Monitor Worker (PID: $PID)..."
  kill $PID 2>/dev/null && echo "   ✅ Stopped" || echo "   ⚠️  Already stopped"
  rm logs/monitor-worker.pid
fi

# Fallback: kill by process name
echo ""
echo "🧹 Cleaning up any remaining workers..."
pkill -f "tweet-ingestion-worker.ts" && echo "   ✅ Cleaned tweet ingestion"
pkill -f "signal-generator.ts" && echo "   ✅ Cleaned signal generator"
pkill -f "trade-executor-worker.ts" && echo "   ✅ Cleaned trade executor"
pkill -f "position-monitor-hyperliquid.ts" && echo "   ✅ Cleaned position monitor"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ All Workers Stopped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

