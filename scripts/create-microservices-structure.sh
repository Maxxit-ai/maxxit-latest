#!/bin/bash

echo "🏗️  Creating Microservices Structure..."
echo ""

# Create main services directory
mkdir -p services

# Create API Services
echo "[1/9] Creating Agent API Service..."
mkdir -p services/agent-api/src/{routes,controllers,middleware}
mkdir -p services/agent-api/src

echo "[2/9] Creating Deployment API Service..."
mkdir -p services/deployment-api/src/{routes,controllers,middleware}

echo "[3/9] Creating Signal API Service..."
mkdir -p services/signal-api/src/{routes,controllers,middleware}

# Create Workers
echo "[4/9] Creating Trade Executor Worker..."
mkdir -p services/trade-executor-worker/src

echo "[5/9] Creating Position Monitor Worker..."
mkdir -p services/position-monitor-worker/src

echo "[6/9] Creating Tweet Ingestion Worker..."
mkdir -p services/tweet-ingestion-worker/src

echo "[7/9] Creating Metrics Updater Worker..."
mkdir -p services/metrics-updater-worker/src

echo "[8/9] Creating Research Signal Worker..."
mkdir -p services/research-signal-worker/src

# Create Shared Directory
echo "[9/9] Creating Shared Libraries..."
mkdir -p services/shared/{lib,types,prisma}

echo ""
echo "✅ Microservices structure created!"
echo ""
echo "📦 Created services:"
echo "  • services/agent-api/"
echo "  • services/deployment-api/"
echo "  • services/signal-api/"
echo "  • services/trade-executor-worker/"
echo "  • services/position-monitor-worker/"
echo "  • services/tweet-ingestion-worker/"
echo "  • services/metrics-updater-worker/"
echo "  • services/research-signal-worker/"
echo "  • services/shared/"
echo ""
echo "🚀 Next steps:"
echo "  1. Run: npm run setup:microservices"
echo "  2. Configure environment variables for each service"
echo "  3. Test services locally"
echo "  4. Deploy to Railway/Vercel"

