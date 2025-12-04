#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║   🐦 Starting Twitter Proxy (GAME API)                       ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to services directory
cd "$(dirname "$0")"

# Check if GAME_API_KEY is set
if [ -z "$GAME_API_KEY" ]; then
    echo "⚠️  WARNING: GAME_API_KEY is not set!"
    echo "Please set it in your .env file"
    echo ""
fi

# Install dependencies if needed
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update requirements
echo "📦 Installing Python dependencies..."
pip install -q -r requirements-twitter.txt

# Start the proxy
echo ""
echo "🚀 Starting Twitter Proxy on port 5002..."
echo ""
python twitter-proxy.py

