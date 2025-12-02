#!/bin/bash
# Test Ostium $5k position (minimum per support)
# Usage: PLATFORM_WALLET_KEY=0x... ./scripts/test-5k-position.sh

echo "🧪 Testing Ostium $5k Position"
echo ""

if [ -z "$PLATFORM_WALLET_KEY" ] && [ -z "$EXECUTOR_PRIVATE_KEY" ]; then
    echo "❌ Error: Private key not set"
    echo ""
    echo "Please set one of these environment variables:"
    echo "  export PLATFORM_WALLET_KEY='0x...'"
    echo "  export EXECUTOR_PRIVATE_KEY='0x...'"
    echo ""
    exit 1
fi

echo "✅ Private key found"
echo ""

# Run the test
OSTIUM_SERVICE_URL=https://maxxit-1.onrender.com \
npx tsx scripts/test-ostium-open-close.ts

