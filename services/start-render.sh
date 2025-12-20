#!/bin/bash

# Start script for Render deployment
# This script starts the Hyperliquid Python service

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║     🚀 STARTING HYPERLIQUID SERVICE (RENDER)                 ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if running in Render environment
if [ -n "$RENDER" ]; then
    echo "✅ Running in Render environment"
    echo "   Service URL: $RENDER_EXTERNAL_URL"
else
    echo "⚠️  Not in Render environment (local testing)"
fi

echo ""
echo "Environment Configuration:"
echo "  HYPERLIQUID_TESTNET: ${HYPERLIQUID_TESTNET:-true}"
echo "  HYPERLIQUID_SERVICE_PORT: ${HYPERLIQUID_SERVICE_PORT:-5001}"
echo ""

# Install dependencies
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 Installing Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -f "requirements-hyperliquid.txt" ]; then
    echo "❌ Error: requirements-hyperliquid.txt not found"
    exit 1
fi

pip install -r requirements-hyperliquid.txt

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

echo ""
echo "✅ Dependencies installed"
echo ""

# Start the service
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Starting Hyperliquid Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -f "hyperliquid-service.py" ]; then
    echo "❌ Error: hyperliquid-service.py not found"
    exit 1
fi

echo "Starting Python service..."
echo ""

# Start the service
python3 hyperliquid-service.py

# If service exits, show error
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Error: Service exited with error"
    exit 1
fi

