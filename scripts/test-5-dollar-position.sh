#!/bin/bash
# Quick test: Try opening $5 position to see actual minimum

echo "🧪 Testing $5 Minimum Position on Ostium"
echo ""

if [ -z "$PLATFORM_WALLET_KEY" ] && [ -z "$EXECUTOR_PRIVATE_KEY" ]; then
    echo "⚠️  Private key not set, will test the error response"
    echo ""
    
    # Test with a dummy key to see the validation error
    DUMMY_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
    
    echo "📡 Calling Ostium service with $5 position..."
    echo ""
    
    curl -X POST https://maxxit-1.onrender.com/open-position \
      -H "Content-Type: application/json" \
      -d '{
        "privateKey": "'$DUMMY_KEY'",
        "market": "BTC",
        "size": 5,
        "side": "long",
        "leverage": 3,
        "useDelegation": false
      }' | jq '.'
    
    echo ""
    echo "This will show if $5 is below minimum (BelowMinLevPos error)"
    exit 0
fi

echo "✅ Private key found, running full test..."
echo ""

# Use the actual key
OSTIUM_SERVICE_URL=https://maxxit-1.onrender.com \
npx tsx scripts/test-ostium-open-close.ts

