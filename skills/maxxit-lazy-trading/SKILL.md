---
emoji: 📈
name: maxxit-lazy-trading
version: 1.1.0
author: Maxxit
description: Execute perpetual trades on Ostium via Maxxit's Lazy Trading API. Includes programmatic endpoints for opening/closing positions, managing risk, and fetching market data.
homepage: https://maxxit.ai
repository: https://github.com/Maxxit-ai/maxxit-latest
disableModelInvocation: true
requires:
  env:
    - MAXXIT_API_KEY
    - MAXXIT_API_URL
metadata:
  openclaw:
    requiredEnv:
      - MAXXIT_API_KEY
      - MAXXIT_API_URL
    bins:
      - curl
    primaryCredential: MAXXIT_API_KEY
---

# Maxxit Lazy Trading

Execute perpetual futures trades on Ostium protocol through Maxxit's Lazy Trading API. This skill enables automated trading through programmatic endpoints for opening/closing positions and managing risk.

## When to Use This Skill

- User wants to execute trades on Ostium
- User asks about their lazy trading account details
- User wants to check their USDC/ETH balance
- User wants to view their open positions or portfolio
- User wants to see their closed position history or PnL
- User wants to open a new trading position (long/short)
- User wants to close an existing position
- User wants to set or modify take profit levels
- User wants to set or modify stop loss levels
- User wants to fetch current token/market prices
- User mentions "lazy trade", "perps", "perpetuals", or "futures trading"
- User wants to automate their trading workflow

## Authentication

All requests require an API key with prefix `lt_`. Pass it via:
- Header: `X-API-KEY: lt_your_api_key`
- Or: `Authorization: Bearer lt_your_api_key`

## API Endpoints

### Get Account Details

Retrieve lazy trading account information including agent status, Telegram connection, and trading preferences.

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/club-details" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Response:**
```json
{
  "success": true,
  "user_wallet": "0x...",
  "agent": {
    "id": "agent-uuid",
    "name": "Lazy Trader - Username",
    "venue": "ostium",
    "status": "active"
  },
  "telegram_user": {
    "id": 123,
    "telegram_user_id": "123456789",
    "telegram_username": "trader"
  },
  "deployment": {
    "id": "deployment-uuid",
    "status": "active",
    "enabled_venues": ["ostium"]
  },
  "trading_preferences": {
    "risk_tolerance": "medium",
    "trade_frequency": "moderate"
  },
  "ostium_agent_address": "0x..."
}
```

### Get Account Balance

Retrieve USDC and ETH balance for the user's Ostium wallet address.

**Note:** The user's Ostium wallet address (`user_wallet`) can be fetched from the `/api/lazy-trading/programmatic/club-details` endpoint first.

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/balance" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{"address": "0x..."}"
```

**Response:**
```json
{
  "success": true,
  "address": "0x...",
  "usdcBalance": "1000.50",
  "ethBalance": "0.045"
}
```

### Get Portfolio Positions

Get all open positions for the user's Ostium trading account.

**Note:** The user's Ostium wallet address can be fetched from the `/api/lazy-trading/programmatic/club-details` endpoint.

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/positions" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{"address": "0x..."}"
```

**Request Body:**
```json
{
  "address": "0x..."  // User's Ostium wallet address (required)
}
```

**Response:**
```json
{
  "success": true,
  "positions": [
    {
      "market": "BTC",
      "marketFull": "BTC/USD",
      "side": "long",
      "collateral": 100.0,
      "entryPrice": 95000.0,
      "leverage": 10.0,
      "tradeId": "12345",
      "notionalUsd": 1000.0,
      "totalFees": 2.50,
      "stopLossPrice": 85500.0,
      "takeProfitPrice": 0.0
    }
  ],
  "totalPositions": 1
}
```

### Get Position History

Get raw trading history for an address (includes open, close, cancelled orders, etc.).

**Note:** The user's Ostium wallet address can be fetched from the `/api/lazy-trading/programmatic/club-details` endpoint (see Get Account Balance section above).

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/history" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"address": "0x...", "count": 50}'
```

**Request Body:**
```json
{
  "address": "0x...",  // User's Ostium wallet address (required)
  "count": 50           // Number of recent orders to retrieve (default: 50)
}
```

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "market": "ETH",
      "side": "long",
      "collateral": 50.0,
      "leverage": 5,
      "price": 3200.0,
      "pnlUsdc": 15.50,
      "profitPercent": 31.0,
      "totalProfitPercent": 31.0,
      "rolloverFee": 0.05,
      "fundingFee": 0.10,
      "executedAt": "2025-02-10T15:30:00Z",
      "tradeId": "trade_123"
    }
  ],
  "count": 25
}
```

### Open Position

Open a new perpetual futures position on Ostium.

**Note:** The `agentAddress` and `userAddress` can be fetched from `/api/lazy-trading/programmatic/club-details` endpoint (`ostium_agent_address` and `user_wallet` respectively).

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/open-position" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0x...",
    "userAddress": "0x...",
    "market": "BTC",
    "side": "long",
    "collateral": 100,
    "leverage": 10
  }'
```

**Request Body:**
```json
{
  "agentAddress": "0x...",      // Ostium agent address (required)
  "userAddress": "0x...",       // User's Ostium wallet address (required)
  "market": "BTC",              // Token symbol to trade (required)
  "side": "long",               // "long" or "short" (required)
  "collateral": 100,            // Collateral amount in USDC (required)
  "leverage": 10,               // Leverage multiplier (optional, default: 10)
  "deploymentId": "uuid...",    // Associated deployment ID (optional)
  "signalId": "uuid...",        // Associated signal ID (optional)
  "isTestnet": false            // Use testnet (optional, default: false)
}
```

**Response:**
```json
{
  "success": true,
  "orderId": "order_123",
  "tradeId": "trade_abc",
  "transactionHash": "0x...",
  "txHash": "0x...",
  "status": "OPEN",
  "message": "Position opened successfully",
  "actualTradeIndex": 2,
  "entryPrice": 95000.0
}
```

### Close Position

Close an existing perpetual futures position on Ostium.

**Note:** The `agentAddress` and `userAddress` can be fetched from `/api/lazy-trading/programmatic/club-details` endpoint.

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/close-position" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0x...",
    "userAddress": "0x...",
    "market": "BTC",
    "tradeId": "12345"
  }'
```

**Request Body:**
```json
{
  "agentAddress": "0x...",      // Ostium agent address (required)
  "userAddress": "0x...",       // User's Ostium wallet address (required)
  "market": "BTC",              // Token symbol (required)
  "tradeId": "12345",           // Trade ID to close (optional)
  "actualTradeIndex": 2,         // Trade index (optional)
  "isTestnet": false            // Use testnet (optional, default: false)
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "txHash": "0x...",
    "market": "BTC",
    "closePnl": 25.50
  },
  "closePnl": 25.50,
  "message": "Position closed successfully",
  "alreadyClosed": false
}
```

### Set Take Profit

Set or update take-profit level for an existing position on Ostium.

**Note:** The `agentAddress` and `userAddress` can be fetched from `/api/lazy-trading/programmatic/club-details` endpoint.

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/set-take-profit" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0x...",
    "userAddress": "0x...",
    "market": "BTC",
    "tradeIndex": 2,
    "takeProfitPercent": 0.30,
    "entryPrice": 90000,
    "pairIndex": 0
  }'
```

**Request Body:**
```json
{
  "agentAddress": "0x...",        // Ostium agent address (required)
  "userAddress": "0x...",         // User's Ostium wallet address (required)
  "market": "BTC",                // Token symbol (required)
  "tradeIndex": 2,                // Trade index (required)
  "takeProfitPercent": 0.30,       // Take profit as decimal (optional, default: 0.30)
  "entryPrice": 90000,             // Entry price (required)
  "pairIndex": 0,                  // Pair index (required)
  "side": "long",                  // "long" or "short" (optional, default: "long")
  "isTestnet": false              // Use testnet (optional, default: false)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Take profit set successfully",
  "tpPrice": 117000.0
}
```

### Set Stop Loss

Set or update stop-loss level for an existing position on Ostium.

**Note:** The `agentAddress` and `userAddress` can be fetched from `/api/lazy-trading/programmatic/club-details` endpoint.

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/set-stop-loss" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "0x...",
    "userAddress": "0x...",
    "market": "BTC",
    "tradeIndex": 2,
    "stopLossPercent": 0.10,
    "entryPrice": 90000,
    "pairIndex": 0
  }'
```

**Request Body:**
```json
{
  "agentAddress": "0x...",        // Ostium agent address (required)
  "userAddress": "0x...",         // User's Ostium wallet address (required)
  "market": "BTC",                // Token symbol (required)
  "tradeIndex": 2,                // Trade index (required)
  "stopLossPercent": 0.10,         // Stop loss as decimal (optional, default: 0.10)
  "entryPrice": 90000,             // Entry price (required)
  "pairIndex": 0,                  // Pair index (required)
  "side": "long",                  // "long" or "short" (optional, default: "long")
  "isTestnet": false              // Use testnet (optional, default: false)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Stop loss set successfully",
  "slPrice": 81000.0,
  "liquidationPrice": 85500.0,
  "adjusted": false
}
```

### Get Token Price

Fetch the current market price for a token from Ostium price feed.

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/price?token=BTC&isTestnet=false" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|-------|----------|-------------|
| `token` | string | Yes | Token symbol to fetch price for (e.g., BTC, ETH, SOL) |
| `isTestnet` | boolean | No | Use testnet price feed (default: false) |

**Response:**
```json
{
  "success": true,
  "token": "BTC",
  "price": 95000.0,
  "isMarketOpen": true,
  "isDayTradingClosed": false
}
```

## Signal Format Examples

The lazy trading system processes natural language trading signals. Here are examples:

### Opening Positions
- `"Long ETH with 5x leverage, entry at 3200"`
- `"Short BTC 10x, TP 60000, SL 68000"`
- `"Buy 100 USDC worth of ETH perpetual"`

### With Risk Management
- `"Long SOL 3x leverage, entry 150, take profit 180, stop loss 140"`
- `"Short AVAX 5x, risk 2% of portfolio"`

### Closing Positions
- `"Close ETH long position"`
- `"Take profit on BTC short"`

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MAXXIT_API_KEY` | Your lazy trading API key (starts with `lt_`) | `lt_abc123...` |
| `MAXXIT_API_URL` | Maxxit API base URL | `https://maxxit.ai` |

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| 401 | Invalid or missing API key |
| 404 | Lazy trader agent not found (complete setup first) |
| 400 | Missing or invalid message |
| 405 | Wrong HTTP method |
| 500 | Server error |

## Getting Started

1. **Set up Lazy Trading**: Visit https://maxxit.ai/lazy-trading to connect your wallet and configure your agent
2. **Generate API Key**: Go to your dashboard and create an API key
3. **Configure Environment**: Set `MAXXIT_API_KEY` and `MAXXIT_API_URL`
4. **Start Trading**: Use this skill to send signals!

## Security Notes

- Never share your API key
- API keys can be revoked and regenerated from the dashboard
- All trades execute on-chain with your delegated wallet permissions
