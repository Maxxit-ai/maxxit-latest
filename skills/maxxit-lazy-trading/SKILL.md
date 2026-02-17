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
- User wants to discover available trading symbols
- User wants to get market data or LunarCrush metrics for analysis
- User wants a whole market snapshot for the trading purpose
- User wants to compare altcoin rankings (AltRank) across different tokens
- User wants to identify high-sentiment trading opportunities
- User wants to know social volume trends for crypto assets
- User wants to open a new trading position (long/short)
- User wants to close an existing position
- User wants to set or modify take profit levels
- User wants to set or modify stop loss levels
- User wants to fetch current token/market prices
- User mentions "lazy trade", "perps", "perpetuals", or "futures trading"
- User wants to automate their trading workflow

---

## ⚠️ CRITICAL: API Parameter Rules (Read Before Calling ANY Endpoint)

> **NEVER assume, guess, or hallucinate values for API request parameters.** Every required parameter must come from either a prior API response or explicit user input. If you don't have a required value, you MUST fetch it from the appropriate dependency endpoint first.

### Parameter Dependency Graph

The following shows where each required parameter comes from. **Always resolve dependencies before calling an endpoint.**

| Parameter | Source | Endpoint to Fetch From |
|-----------|--------|------------------------|
| `userAddress` / `address` | `/club-details` response → `user_wallet` | `GET /club-details` |
| `agentAddress` | `/club-details` response → `ostium_agent_address` | `GET /club-details` |
| `tradeIndex` | `/open-position` response → `actualTradeIndex` **OR** `/positions` response → `tradeIndex` | `POST /open-position` or `POST /positions` |
| `pairIndex` | `/positions` response → `pairIndex` **OR** `/symbols` response → symbol `id` | `POST /positions` or `GET /symbols` |
| `entryPrice` | `/open-position` response → `entryPrice` **OR** `/positions` response → `entryPrice` | `POST /open-position` or `POST /positions` |
| `market` / `symbol` | User specifies the token **OR** `/symbols` response → `symbol` | User input or `GET /symbols` |
| `side` | User specifies `"long"` or `"short"` | User input (required) |
| `collateral` | User specifies the USDC amount | User input (required) |
| `leverage` | User specifies the multiplier | User input (required) |
| `takeProfitPercent` | User specifies (e.g., 0.30 = 30%) | User input (required) |
| `stopLossPercent` | User specifies (e.g., 0.10 = 10%) | User input (required) |

### Mandatory Workflow Rules

1. **Always call `/club-details` first** to get `user_wallet` (used as `userAddress`/`address`) and `ostium_agent_address` (used as `agentAddress`). Cache these for the session — they don't change.
2. **Never hardcode or guess wallet addresses.** They are unique per user and must come from `/club-details`.
3. **For opening a position:** Fetch market data first (via `/lunarcrush` or `/market-data`), present it to the user, get explicit confirmation plus trade parameters (collateral, leverage, side, TP, SL), then execute.
4. **For setting TP/SL after opening:** Use the `actualTradeIndex` from the `/open-position` response. If you don't have it (e.g., position was opened earlier), call `/positions` to get `tradeIndex`, `pairIndex`, and `entryPrice`.
5. **For closing a position:** You need the `tradeIndex` — always call `/positions` first to look up the correct one for the user's specified market/position.
6. **Ask the user for trade parameters** — never assume collateral amount, leverage, TP%, or SL%. Present defaults but let the user confirm or override.
7. **Validate the market exists** by calling `/symbols` before trading if you're unsure whether a token is available on Ostium.

### Pre-Flight Checklist (Run Mentally Before Every API Call)

```
✅ Do I have the user's wallet address? → If not, call /club-details
✅ Do I have the agent address? → If not, call /club-details
✅ Does this endpoint need a tradeIndex? → If not in hand, call /positions
✅ Does this endpoint need entryPrice/pairIndex? → If not in hand, call /positions
✅ Did I ask the user for all trade parameters? → collateral, leverage, side, TP%, SL%
✅ Is the market/symbol valid? → If unsure, call /symbols to verify
```

---

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

### Get Available Symbols

Retrieve all available trading symbols from the Ostium exchange. Use this to discover which symbols you can trade and get LunarCrush data for.

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/symbols" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Response:**
```json
{
  "success": true,
  "symbols": [
    {
      "id": 0,
      "symbol": "BTC/USD",
      "group": "crypto",
      "maxLeverage": 150
    },
    {
      "id": 1,
      "symbol": "ETH/USD",
      "group": "crypto",
      "maxLeverage": 100
    }
  ],
  "groupedSymbols": {
    "crypto": [
      { "id": 0, "symbol": "BTC/USD", "group": "crypto", "maxLeverage": 150 },
      { "id": 1, "symbol": "ETH/USD", "group": "crypto", "maxLeverage": 100 }
    ],
    "forex": [...]
  },
  "count": 45
}
```

### Get LunarCrush Market Data

Retrieve cached LunarCrush market metrics for a specific symbol. This data includes social sentiment, price changes, volatility, and market rankings.

> **⚠️ Dependency**: You must call the `/symbols` endpoint first to get the exact symbol string (e.g., `"BTC/USD"`). The symbol parameter requires an exact match.

```bash
# First, get available symbols
SYMBOL=$(curl -s -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/symbols" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" | jq -r '.symbols[0].symbol')

# Then, get LunarCrush data for that symbol
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/lunarcrush?symbol=${SYMBOL}" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Response:**
```json
{
  "success": true,
  "symbol": "BTC/USD",
  "lunarcrush": {
    "galaxy_score": 72.5,
    "alt_rank": 1,
    "social_volume_24h": 15234,
    "sentiment": 68.3,
    "percent_change_24h": 2.45,
    "volatility": 0.032,
    "price": "95000.12345678",
    "volume_24h": "45000000000.00000000",
    "market_cap": "1850000000000.00000000",
    "market_cap_rank": 1,
    "social_dominance": 45.2,
    "market_dominance": 52.1,
    "interactions_24h": 890000,
    "galaxy_score_previous": 70.1,
    "alt_rank_previous": 1
  },
  "updated_at": "2026-02-14T08:30:00.000Z"
}
```

**LunarCrush Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `galaxy_score` | Float | Overall coin quality score (0-100) combining social, market, and developer activity |
| `alt_rank` | Int | Rank among all cryptocurrencies (lower is better, 1 = best) |
| `social_volume_24h` | Float | Social media mentions in last 24 hours |
| `sentiment` | Float | Market sentiment score (0-100, 50 is neutral, >50 is bullish) |
| `percent_change_24h` | Float | Price change percentage in last 24 hours |
| `volatility` | Float | Price volatility score (0-1, <0.02 stable, 0.02-0.05 normal, >0.05 risky) |
| `price` | String | Current price in USD (decimal string for precision) |
| `volume_24h` | String | Trading volume in last 24 hours (decimal string) |
| `market_cap` | String | Market capitalization (decimal string) |
| `market_cap_rank` | Int | Rank by market cap (lower is better) |
| `social_dominance` | Float | Social volume relative to total market |
| `market_dominance` | Float | Market cap relative to total market |
| `interactions_24h` | Float | Social media interactions in last 24 hours |
| `galaxy_score_previous` | Float | Previous galaxy score (for trend analysis) |
| `alt_rank_previous` | Int | Previous alt rank (for trend analysis) |

**Data Freshness:**
- LunarCrush data is cached and updated periodically by a background worker
- Check the `updated_at` field to see when the data was last refreshed
- Data is typically refreshed every few hours

### Get Account Balance

Retrieve USDC and ETH balance for the user's Ostium wallet address.

> **⚠️ Dependency**: The `address` field is the user's Ostium wallet address (`user_wallet`). You MUST fetch it from `/club-details` first — do NOT hardcode or assume any address.

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

Get all open positions for the user's Ostium trading account. **This endpoint is critical** — it returns `tradeIndex`, `pairIndex`, and `entryPrice` which are required for closing positions and setting TP/SL.

> **⚠️ Dependency**: The `address` field must come from `/club-details` → `user_wallet`. NEVER guess it.
>
> **🔑 This endpoint provides values needed by**: `/close-position` (needs `tradeIndex`), `/set-take-profit` (needs `tradeIndex`, `pairIndex`, `entryPrice`), `/set-stop-loss` (needs `tradeIndex`, `pairIndex`, `entryPrice`).

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/positions" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{"address": "0x..."}"
```

**Request Body:**
```json
{
  "address": "0x..."  // REQUIRED — from /club-details → user_wallet. NEVER guess this.
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
      "tradeIndex": 2,
      "pairIndex": "0",
      "notionalUsd": 1000.0,
      "totalFees": 2.50,
      "stopLossPrice": 85500.0,
      "takeProfitPrice": 0.0
    }
  ],
  "totalPositions": 1
}
```

> **Key fields to extract from each position:**
> - `tradeIndex` — needed for `/close-position`, `/set-take-profit`, `/set-stop-loss`
> - `pairIndex` — needed for `/set-take-profit`, `/set-stop-loss`
> - `entryPrice` — needed for `/set-take-profit`, `/set-stop-loss`
> - `side` — needed for `/set-take-profit`, `/set-stop-loss`
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

> **⚠️ Dependencies — ALL must be resolved BEFORE calling this endpoint:**
> 1. `agentAddress` → from `/club-details` → `ostium_agent_address` (NEVER guess)
> 2. `userAddress` → from `/club-details` → `user_wallet` (NEVER guess)
> 3. `market` → validate via `/symbols` endpoint if unsure the token exists
> 4. `side`, `collateral`, `leverage` → **ASK the user explicitly**, do not assume
>
> **📊 Recommended Pre-Trade Flow:**
> 1. Call `/lunarcrush?symbol=TOKEN/USD` or `/market-data` to get market conditions
> 2. Present the market data to the user (price, sentiment, volatility)
> 3. Ask the user: "Do you want to proceed? Specify: collateral (USDC), leverage, long/short"
> 4. Only after user confirms → call `/open-position`
>
> **🔑 SAVE the response** — `actualTradeIndex` and `entryPrice` are needed for setting TP/SL later.

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
  "agentAddress": "0x...",      // REQUIRED — from /club-details → ostium_agent_address. NEVER guess.
  "userAddress": "0x...",       // REQUIRED — from /club-details → user_wallet. NEVER guess.
  "market": "BTC",              // REQUIRED — Token symbol. Validate via /symbols if unsure.
  "side": "long",               // REQUIRED — "long" or "short". ASK the user.
  "collateral": 100,            // REQUIRED — Collateral in USDC. ASK the user.
  "leverage": 10,               // Optional (default: 10). ASK the user.
  "deploymentId": "uuid...",    // Optional — associated deployment ID
  "signalId": "uuid...",        // Optional — associated signal ID
  "isTestnet": false            // Optional (default: false)
}
```

**Response (IMPORTANT — save these values):**
```json
{
  "success": true,
  "orderId": "order_123",
  "tradeId": "trade_abc",
  "transactionHash": "0x...",
  "txHash": "0x...",
  "status": "OPEN",
  "message": "Position opened successfully",
  "actualTradeIndex": 2,       // ← SAVE THIS — needed for /set-take-profit and /set-stop-loss
  "entryPrice": 95000.0         // ← SAVE THIS — needed for /set-take-profit and /set-stop-loss
}
```

### Close Position

Close an existing perpetual futures position on Ostium.

> **⚠️ Dependencies — resolve BEFORE calling this endpoint:**
> 1. `agentAddress` → from `/club-details` → `ostium_agent_address`
> 2. `userAddress` → from `/club-details` → `user_wallet`
> 3. `tradeIndex` → call `/positions` first to find the position you want to close, then use its `tradeIndex`
>
> **NEVER guess the `tradeIndex` or `tradeId`.** Always fetch from `/positions` endpoint.

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
  "agentAddress": "0x...",      // REQUIRED — from /club-details → ostium_agent_address. NEVER guess.
  "userAddress": "0x...",       // REQUIRED — from /club-details → user_wallet. NEVER guess.
  "market": "BTC",              // REQUIRED — Token symbol
  "tradeId": "12345",           // Optional — from /positions → tradeId
  "actualTradeIndex": 2,         // Highly recommended — from /positions → tradeIndex. NEVER guess.
  "isTestnet": false            // Optional (default: false)
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

> **⚠️ Dependencies — you need ALL of these before calling:**
> 1. `agentAddress` → from `/club-details` → `ostium_agent_address`
> 2. `userAddress` → from `/club-details` → `user_wallet`
> 3. `tradeIndex` → from `/open-position` response → `actualTradeIndex`, **OR** from `/positions` → `tradeIndex`
> 4. `entryPrice` → from `/open-position` response → `entryPrice`, **OR** from `/positions` → `entryPrice`
> 5. `pairIndex` → from `/positions` → `pairIndex`, **OR** from `/symbols` → symbol `id`
> 6. `takeProfitPercent` → **ASK the user** (default: 0.30 = 30%)
> 7. `side` → from `/positions` → `side` ("long" or "short")
>
> **If you just opened a position:** Use `actualTradeIndex` and `entryPrice` from the `/open-position` response.
> **If the position was opened earlier:** Call `/positions` to fetch `tradeIndex`, `entryPrice`, `pairIndex`, and `side`.

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
  "agentAddress": "0x...",        // REQUIRED — from /club-details. NEVER guess.
  "userAddress": "0x...",         // REQUIRED — from /club-details. NEVER guess.
  "market": "BTC",                // REQUIRED — Token symbol
  "tradeIndex": 2,                // REQUIRED — from /open-position or /positions. NEVER guess.
  "takeProfitPercent": 0.30,       // Optional (default: 0.30 = 30%). ASK the user.
  "entryPrice": 90000,             // REQUIRED — from /open-position or /positions. NEVER guess.
  "pairIndex": 0,                  // REQUIRED — from /positions or /symbols. NEVER guess.
  "side": "long",                  // Optional (default: "long") — from /positions.
  "isTestnet": false              // Optional (default: false)
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

> **⚠️ Dependencies — identical to Set Take Profit. You need ALL of these before calling:**
> 1. `agentAddress` → from `/club-details` → `ostium_agent_address`
> 2. `userAddress` → from `/club-details` → `user_wallet`
> 3. `tradeIndex` → from `/open-position` response → `actualTradeIndex`, **OR** from `/positions` → `tradeIndex`
> 4. `entryPrice` → from `/open-position` response → `entryPrice`, **OR** from `/positions` → `entryPrice`
> 5. `pairIndex` → from `/positions` → `pairIndex`, **OR** from `/symbols` → symbol `id`
> 6. `stopLossPercent` → **ASK the user** (default: 0.10 = 10%)
> 7. `side` → from `/positions` → `side` ("long" or "short")
>
> **If you just opened a position:** Use `actualTradeIndex` and `entryPrice` from the `/open-position` response.
> **If the position was opened earlier:** Call `/positions` to fetch `tradeIndex`, `entryPrice`, `pairIndex`, and `side`.

```bash
# Same dependency resolution as Set Take Profit (see above for full example)
# Step 1: Get addresses from /club-details
# Step 2: Get position details from /positions
# Step 3: Set stop loss with user-specified stopLossPercent

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
    "pairIndex": 0,
    "side": "long"
  }'
```

**Request Body:**
```json
{
  "agentAddress": "0x...",        // REQUIRED — from /club-details. NEVER guess.
  "userAddress": "0x...",         // REQUIRED — from /club-details. NEVER guess.
  "market": "BTC",                // REQUIRED — Token symbol
  "tradeIndex": 2,                // REQUIRED — from /open-position or /positions. NEVER guess.
  "stopLossPercent": 0.10,         // Optional (default: 0.10 = 10%). ASK the user.
  "entryPrice": 90000,             // REQUIRED — from /open-position or /positions. NEVER guess.
  "pairIndex": 0,                  // REQUIRED — from /positions or /symbols. NEVER guess.
  "side": "long",                  // Optional (default: "long") — from /positions.
  "isTestnet": false              // Optional (default: false)
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

### Get All Market Data

Retrieve the complete market snapshot from Ostium, including all symbols and their full LunarCrush metrics. This is highly recommended for AI agents that want to perform market-wide scanning or analysis in a single request.

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/market-data" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 0,
      "symbol": "BTC/USD",
      "group": "crypto",
      "maxLeverage": 150,
      "metrics": {
        "galaxy_score": 72.5,
        "alt_rank": 1,
        "social_volume_24h": 15234,
        "sentiment": 68.3,
        "percent_change_24h": 2.45,
        "volatility": 0.032,
        "price": "95000.12345678",
        "volume_24h": "45000000000.00000000",
        "market_cap": "1850000000000.00000000",
        "market_cap_rank": 1,
        "social_dominance": 45.2,
        "market_dominance": 52.1,
        "interactions_24h": 890000,
        "galaxy_score_previous": 70.1,
        "alt_rank_previous": 1
      },
      "updated_at": "2026-02-14T08:30:00.000Z"
    },
    ...
  ],
  "count": 45
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

---

## Complete Workflow Examples

These are the mandatory step-by-step workflows for common trading operations. **Follow these exactly.**

### Workflow 1: Opening a New Position (Full Flow)

```
Step 1: GET /club-details
   → Extract: user_wallet (→ userAddress), ostium_agent_address (→ agentAddress)
   → Cache these for the session

Step 2: GET /symbols
   → Verify the user's requested token is available on Ostium
   → Extract exact symbol string and maxLeverage

Step 3: GET /lunarcrush?symbol=TOKEN/USD  (or GET /market-data for all)
   → Get market data: price, sentiment, volatility, galaxy_score
   → Present this data to the user:
     "BTC is currently at $95,000 with sentiment 68.3 (bullish) and volatility 0.032 (normal).
      Galaxy Score: 72.5/100. Do you want to proceed?"

Step 4: ASK the user for trade parameters
   → "Please confirm: collateral (USDC), leverage, long or short?"
   → "Would you like to set TP and SL? If so, what percentages?"
   → Wait for explicit user confirmation before proceeding

Step 5: POST /open-position
   → Use agentAddress and userAddress from Step 1
   → Use market, side, collateral, leverage from Step 4
   → SAVE the response: actualTradeIndex and entryPrice

Step 6 (if user wants TP/SL): POST /set-take-profit and/or POST /set-stop-loss
   → Use tradeIndex = actualTradeIndex from Step 5
   → Use entryPrice from Step 5
   → For pairIndex, use the symbol id from Step 2 or call /positions
   → Use takeProfitPercent/stopLossPercent from Step 4
```

### Workflow 2: Closing an Existing Position

```
Step 1: GET /club-details
   → Extract: user_wallet, ostium_agent_address

Step 2: POST /positions (address = user_wallet from Step 1)
   → List all open positions
   → Present them to the user if multiple: "You have 3 open positions: BTC long, ETH short, SOL long. Which one do you want to close?"
   → Extract the tradeIndex for the position to close

Step 3: POST /close-position
   → Use agentAddress and userAddress from Step 1
   → Use market and actualTradeIndex from Step 2
   → Show the user the closePnl from the response
```

### Workflow 3: Setting TP/SL on an Existing Position

```
Step 1: GET /club-details
   → Extract: user_wallet, ostium_agent_address

Step 2: POST /positions (address = user_wallet from Step 1)
   → Find the target position
   → Extract: tradeIndex, entryPrice, pairIndex, side

Step 3: ASK the user
   → "Position: BTC long at $95,000. Current TP: none, SL: $85,500."
   → "What TP% and SL% would you like to set?"

Step 4: POST /set-take-profit and/or POST /set-stop-loss
   → Use ALL values from Steps 1-3 — NEVER guess any of them
```

### Workflow 4: Checking Portfolio & Market Overview

```
Step 1: GET /club-details
   → Extract: user_wallet

Step 2: POST /balance (address = user_wallet)
   → Show the user their USDC and ETH balances

Step 3: POST /positions (address = user_wallet)
   → Show all open positions with PnL details

Step 4 (optional): GET /market-data
   → Show market conditions for tokens they hold
```

---

## Aster DEX (BNB Chain) Endpoints

> Aster DEX is a perpetual futures exchange on BNB Chain. Use Aster endpoints when the user wants to trade on BNB Chain. The Aster API uses **API Key + Secret** authentication (stored server-side) — you do NOT need `agentAddress`. You only need `userAddress` from `/club-details`.

### Venue Selection

| Venue | Chain | Symbol Format | Auth Required | When to Use |
|-------|-------|--------------|---------------|-------------|
| **Ostium** | Arbitrum | `BTC`, `ETH` | `agentAddress` + `userAddress` | Default for most trades |
| **Aster** | BNB Chain | `BTCUSDT`, `ETHUSDT` | `userAddress` only | When user specifies BNB Chain or Aster |

**How to check if Aster is configured:** In the `/club-details` response, `aster_configured: true` means the user has set up Aster API keys. If `false`, direct them to set up Aster at maxxit.ai/openclaw.

### Aster Symbols

Aster uses Binance-style symbol format: `BTCUSDT`, `ETHUSDT`, etc. The API auto-appends `USDT` if you pass just `BTC`.

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/symbols" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Response:**
```json
{
  "success": true,
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "pricePrecision": 2,
      "quantityPrecision": 3,
      "contractType": "PERPETUAL",
      "status": "TRADING"
    }
  ],
  "count": 50
}
```

### Aster Price

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/price?token=BTC" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

**Response:**
```json
{
  "success": true,
  "token": "BTC",
  "symbol": "BTCUSDT",
  "price": 95000.50
}
```

### Aster Market Data

```bash
curl -L -X GET "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/market-data?symbol=BTC" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}"
```

### Aster Balance

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/balance" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x..."
  }'
```

**Request Body:**
```json
{
  "userAddress": "0x..."    // REQUIRED — from /club-details → user_wallet. NEVER guess.
}
```

**Response:**
```json
{
  "success": true,
  "balance": 1000.50,
  "availableBalance": 800.25,
  "unrealizedProfit": 50.10
}
```

### Aster Positions

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/positions" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x..."
  }'
```

**Response:**
```json
{
  "success": true,
  "positions": [
    {
      "symbol": "BTCUSDT",
      "positionAmt": 0.01,
      "entryPrice": 95000.0,
      "markPrice": 96000.0,
      "unrealizedProfit": 10.0,
      "liquidationPrice": 80000.0,
      "leverage": 10,
      "side": "long"
    }
  ],
  "count": 1
}
```

### Aster Open Position

**Option A — Specify size in base asset (e.g. BTC):**
```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/open-position" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x...",
    "symbol": "BTC",
    "side": "long",
    "quantity": 0.01,
    "leverage": 10
  }'
```

**Option B — Specify size in USDT (collateral):**
```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/open-position" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x...",
    "symbol": "BTC",
    "side": "long",
    "collateral": 100,
    "leverage": 10
  }'
```

**Request Body (provide EITHER `quantity` OR `collateral`):**
```json
{
  "userAddress": "0x...",     // REQUIRED — from /club-details → user_wallet
  "symbol": "BTC",           // REQUIRED — Token name or full symbol (BTCUSDT)
  "side": "long",            // REQUIRED — "long" or "short". ASK the user.
  "quantity": 0.01,          // Option A — Position size in base asset (e.g. 0.01 BTC)
  "collateral": 100,         // Option B — Position size in USDT (e.g. 100 USDT)
  "leverage": 10,            // Optional — Leverage multiplier. ASK the user.
  "type": "MARKET",          // Optional — "MARKET" (default) or "LIMIT"
  "price": 95000             // Required only for LIMIT orders
}
```

> ⚠️ **IMPORTANT:** Provide EITHER `quantity` (base asset, e.g. 0.01 BTC) OR `collateral` (USDT amount, e.g. 100 USDT), NOT both. If the user says "trade $100 of BTC", use `collateral` — the server auto-fetches the current price and converts to the correct quantity. If the user says "buy 0.01 BTC", use `quantity`.

**Response (IMPORTANT — save these values):**
```json
{
  "success": true,
  "orderId": 12345678,
  "symbol": "BTCUSDT",
  "side": "BUY",
  "status": "FILLED",
  "avgPrice": "95000.50",
  "executedQty": "0.010",
  "message": "Position opened: long BTCUSDT"
}
```

### Aster Close Position

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/close-position" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x...",
    "symbol": "BTC"
  }'
```

**Request Body:**
```json
{
  "userAddress": "0x...",    // REQUIRED
  "symbol": "BTC",          // REQUIRED
  "quantity": 0.005         // Optional — omit to close full position
}
```

### Aster Set Take Profit

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/set-take-profit" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x...",
    "symbol": "BTC",
    "takeProfitPercent": 0.30,
    "entryPrice": 95000,
    "side": "long"
  }'
```

**Request Body (two options):**
```json
{
  "userAddress": "0x...",
  "symbol": "BTC",
  "stopPrice": 123500          // Option A: exact trigger price
}
```
```json
{
  "userAddress": "0x...",
  "symbol": "BTC",
  "takeProfitPercent": 0.30,   // Option B: percentage (0.30 = 30%)
  "entryPrice": 95000,
  "side": "long"
}
```

### Aster Set Stop Loss

Same pattern as take profit:

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/set-stop-loss" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x...",
    "symbol": "BTC",
    "stopLossPercent": 0.10,
    "entryPrice": 95000,
    "side": "long"
  }'
```

### Aster Change Leverage

```bash
curl -L -X POST "${MAXXIT_API_URL}/api/lazy-trading/programmatic/aster/change-leverage" \
  -H "X-API-KEY: ${MAXXIT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x...",
    "symbol": "BTC",
    "leverage": 20
  }'
```

### Aster Parameter Dependency Graph

| Parameter | Source | How to Get |
|-----------|--------|-----------|
| `userAddress` | `/club-details` → `user_wallet` | `GET /club-details` |
| `aster_configured` | `/club-details` → `aster_configured` | `GET /club-details` (must be `true`) |
| `symbol` | User specifies token | User input (auto-resolved: `BTC` → `BTCUSDT`) |
| `side` | User specifies `"long"` or `"short"` | User input (required) |
| `quantity` | User specifies or calculated | User input or `collateral * leverage / price` |
| `leverage` | User specifies | User input |
| `entryPrice` | `/aster/positions` → `entryPrice` | From position data |
| `stopPrice` | User specifies or calculated from percent | User input or calculated |

### Aster Workflow: Open Position on BNB Chain

```
Step 1: GET /club-details
   → Extract: user_wallet
   → Check: aster_configured == true (if false, tell user to set up Aster)

Step 2: GET /aster/symbols
   → Verify the token is available on Aster

Step 3: GET /aster/price?token=BTC
   → Get current price, present to user

Step 4: ASK the user for trade parameters
   → "How much BTC do you want to trade? (or specify USDC collateral)"
   → "Leverage? Long or short?"
   → Calculate quantity if user gives collateral: quantity = collateral * leverage / price

Step 5: POST /aster/open-position
   → Use userAddress from Step 1
   → Use symbol, side, quantity, leverage from Step 4
   → SAVE orderId and avgPrice from response

Step 6 (if user wants TP/SL): POST /aster/set-take-profit and/or POST /aster/set-stop-loss
   → Use entryPrice = avgPrice from Step 5
   → Use side from Step 4
   → Use takeProfitPercent/stopLossPercent from user
```

### Aster Workflow: Close Position

```
Step 1: GET /club-details → Extract user_wallet

Step 2: POST /aster/positions (userAddress = user_wallet)
   → Show positions to user, let them pick which to close

Step 3: POST /aster/close-position
   → Pass userAddress and symbol
   → Omit quantity to close full position
```

---

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
| 400 | Missing or invalid message / parameters |
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

