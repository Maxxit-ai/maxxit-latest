#!/bin/bash
# Test Ostium Open Position Endpoint
# Usage: ./test-ostium-open-position.sh

# Configuration
OSTIUM_SERVICE_URL="${OSTIUM_SERVICE_URL:-http://localhost:5002}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🧪 Testing Ostium Open Position Endpoint"
echo "========================================"
echo ""

# Example 1: Using agentAddress (recommended - looks up key from database)
echo -e "${YELLOW}Example 1: Open LONG position on ADA with TP/SL${NC}"
echo "Command:"
cat << 'EOF'
curl -X POST http://localhost:5002/open-position \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0xYourAgentAddress",
    "userAddress": "0xYourUserAddress",
    "market": "ADA",
    "side": "long",
    "collateral": 50,
    "leverage": 10,
    "stopLossPercent": 0.10,
    "takeProfitPercent": 0.50
  }'
EOF
echo ""
echo "Expected Response:"
cat << 'EOF'
{
  "success": true,
  "orderId": "12345",
  "tradeId": "12345",
  "transactionHash": "0xabc...",
  "status": "pending",
  "message": "Order created, waiting for keeper to fill position",
  "actualTradeIndex": 0,
  "tpSlSet": true,
  "tpSlError": null,
  "result": {
    "market": "ADA",
    "side": "long",
    "collateral": 50,
    "leverage": 10,
    "actualTradeIndex": 0,
    "tpSlConfigured": true
  }
}
EOF
echo ""
echo "---"
echo ""

# Example 2: Using privateKey (legacy - direct key)
echo -e "${YELLOW}Example 2: Open SHORT position on BTC (legacy method)${NC}"
echo "Command:"
cat << 'EOF'
curl -X POST http://localhost:5002/open-position \
  -H "Content-Type: application/json" \
  -d '{
    "privateKey": "0xYourPrivateKey",
    "market": "BTC",
    "side": "short",
    "size": 100,
    "leverage": 5,
    "useDelegation": true,
    "userAddress": "0xYourUserAddress",
    "stopLossPercent": 0.10,
    "takeProfitPercent": 0.50
  }'
EOF
echo ""
echo "---"
echo ""

# Example 3: Without TP/SL (position monitor will handle risk)
echo -e "${YELLOW}Example 3: Open position WITHOUT TP/SL${NC}"
echo "Command:"
cat << 'EOF'
curl -X POST http://localhost:5002/open-position \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0xYourAgentAddress",
    "userAddress": "0xYourUserAddress",
    "market": "ETH",
    "side": "long",
    "collateral": 200,
    "leverage": 3
  }'
EOF
echo ""
echo "---"
echo ""

# Example 4: Get available markets first
echo -e "${YELLOW}Example 4: Check available markets first${NC}"
echo "Command:"
echo "curl http://localhost:5002/available-markets"
echo ""
echo "---"
echo ""

# Example 5: Check service health
echo -e "${YELLOW}Example 5: Check service health${NC}"
echo "Command:"
echo "curl http://localhost:5002/health"
echo ""
echo "---"
echo ""

# Interactive test (if you want to run it)
echo -e "${GREEN}Would you like to run a test trade? (requires env vars)${NC}"
echo "Required environment variables:"
echo "  - AGENT_ADDRESS"
echo "  - USER_ADDRESS"
echo ""
read -p "Run test? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    if [ -z "$AGENT_ADDRESS" ] || [ -z "$USER_ADDRESS" ]; then
        echo -e "${RED}❌ Missing required environment variables${NC}"
        echo "Set them first:"
        echo "  export AGENT_ADDRESS='0x...'"
        echo "  export USER_ADDRESS='0x...'"
        exit 1
    fi
    
    echo -e "${GREEN}🚀 Opening test position...${NC}"
    
    curl -X POST "$OSTIUM_SERVICE_URL/open-position" \
      -H "Content-Type: application/json" \
      -d "{
        \"agentAddress\": \"$AGENT_ADDRESS\",
        \"userAddress\": \"$USER_ADDRESS\",
        \"market\": \"ADA\",
        \"side\": \"long\",
        \"collateral\": 20,
        \"leverage\": 10,
        \"stopLossPercent\": 0.10,
        \"takeProfitPercent\": 0.50
      }" | jq '.'
    
    echo ""
    echo -e "${GREEN}✅ Test complete${NC}"
else
    echo "Test skipped"
fi

echo ""
echo "📚 Parameter Reference:"
echo "======================="
echo ""
echo "Required Parameters:"
echo "  - agentAddress: Agent's wallet address (OR privateKey)"
echo "  - userAddress: User's wallet address (for delegation)"
echo "  - market: Token symbol (BTC, ETH, ADA, SOL, etc.)"
echo "  - side: 'long' or 'short'"
echo "  - collateral: USDC amount (OR size)"
echo ""
echo "Optional Parameters:"
echo "  - leverage: Multiplier (default: 10)"
echo "  - stopLossPercent: SL percentage (e.g., 0.10 = 10%)"
echo "  - takeProfitPercent: TP percentage (e.g., 0.50 = 50%)"
echo ""
echo "Legacy Format (alternative):"
echo "  - privateKey: Private key (instead of agentAddress)"
echo "  - useDelegation: true/false"
echo "  - size: USDC amount (instead of collateral)"
echo ""

