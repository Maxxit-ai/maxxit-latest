#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   🟣 RAILWAY - WORKERS ONLY MODE                             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

echo "📦 Installing Node.js dependencies..."
npm ci --legacy-peer-deps

echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "📁 Creating logs directory..."
mkdir -p logs

echo ""
echo "🔌 Twitter Proxy Configuration"
TWITTER_PROXY_URL="${TWITTER_PROXY_URL:-http://localhost:5002}"
echo "   Using proxy at: $TWITTER_PROXY_URL"
if [ "$TWITTER_PROXY_URL" != "http://localhost:5002" ]; then
    echo "   ✅ External proxy configured (Render service)"
else
    echo "   ⚠️  Using localhost - ensure proxy is running locally for development"
fi

echo ""
echo "🚀 Starting Workers..."
echo ""

echo ""
echo "Workers starting in continuous mode:"
echo "  ✅ Tweet Ingestion (every 5 mins)"
echo "  ✅ Signal Generator (every 1 min)"
echo "  ✅ Trade Executor (every 30 sec)"
echo "  ✅ Position Monitor (every 1 min)"
echo ""

# Start the continuous runner (runs all workers on scheduled intervals)
node workers/continuous-runner.js &
RUNNER_PID=$!
echo "Continuous Runner PID: $RUNNER_PID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All services started successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep the script running to prevent Railway from thinking it's done
wait

