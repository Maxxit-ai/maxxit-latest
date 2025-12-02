#!/bin/bash
# Find the actual minimum position size on Ostium

echo "🔍 Finding Actual Minimum Position Size on Ostium"
echo ""

DUMMY_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
TEST_SIZES=(5 10 50 100 500 1000 1500 5000)

for size in "${TEST_SIZES[@]}"; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Testing: \$$size USD"
    echo ""
    
    response=$(curl -s -X POST https://maxxit-1.onrender.com/open-position \
      -H "Content-Type: application/json" \
      -d '{
        "privateKey": "'$DUMMY_KEY'",
        "market": "BTC",
        "size": '$size',
        "side": "long",
        "leverage": 3,
        "useDelegation": false
      }')
    
    # Check for BelowMinLevPos error
    if echo "$response" | grep -q "BelowMinLevPos"; then
        echo "❌ BELOW MINIMUM - Size: \$$size"
        echo "   Error: BelowMinLevPos()"
    elif echo "$response" | grep -q "insufficient funds"; then
        echo "✅ ABOVE MINIMUM - Size: \$$size"
        echo "   (Got past validation, failed on gas)"
    elif echo "$response" | grep -q "success.*true"; then
        echo "✅ SUCCESS - Size: \$$size"
    else
        echo "⚠️  Unknown response for \$$size"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    fi
    
    echo ""
    sleep 1
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Complete"

