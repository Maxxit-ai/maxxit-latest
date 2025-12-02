# Telegram Alpha Worker

Microservice that processes Telegram DM messages from alpha users and classifies them using LLM.

## Architecture

```
Telegram Webhook (pages/api/telegram/webhook.ts)
  ↓
Stores raw messages in telegram_posts (is_signal_candidate = null)
  ↓
Telegram Alpha Worker (this service)
  ↓
Classifies messages with LLM
  ↓
Updates telegram_posts (is_signal_candidate = true/false)
  ↓
Signal Generator Worker picks up classified messages
  ↓
Generates signals for agents
```

## Flow

1. **Webhook receives DM** → Stores in `telegram_posts` with `is_signal_candidate = null`
2. **Worker polls database** → Finds unprocessed messages (`is_signal_candidate IS NULL`)
3. **Worker classifies** → Uses LLM to determine if message is a signal
4. **Worker updates** → Sets `is_signal_candidate`, `extracted_tokens`, `confidence_score`, `signal_type`
5. **Signal Generator** → Picks up messages where `is_signal_candidate = true`

## Setup

### Environment Variables

```env
DATABASE_URL=postgresql://...
PORT=5006
WORKER_INTERVAL=120000  # 2 minutes (default)

# LLM API Key (one of):
PERPLEXITY_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### Installation

```bash
cd services/telegram-alpha-worker
npm install
npx prisma generate
npm run build
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

## Health Check

```bash
curl http://localhost:5006/health
```

Response:
```json
{
  "status": "ok",
  "service": "telegram-alpha-worker",
  "interval": 120000,
  "database": "connected",
  "isRunning": true,
  "timestamp": "2025-11-18T..."
}
```

## Processing Logic

1. **Finds unprocessed messages**:
   - `alpha_user_id IS NOT NULL` (from individual DMs)
   - `is_signal_candidate IS NULL` (not yet classified)
   - From active alpha users

2. **Pre-filters** (skips LLM):
   - Messages < 20 chars without tokens
   - Common chatter (gm, gn, hello, etc.)

3. **LLM Classification**:
   - Extracts tokens (BTC, ETH, etc.)
   - Determines sentiment (bullish/bearish)
   - Calculates confidence score

4. **Updates database**:
   - Sets `is_signal_candidate`
   - Sets `extracted_tokens`
   - Sets `confidence_score`
   - Sets `signal_type` (LONG/SHORT)

## Monitoring

Check logs for:
- Messages processed per run
- Signals detected
- Errors encountered

Example log output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📱 TELEGRAM ALPHA INGESTION WORKER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Found 5 unprocessed message(s) to classify

[@abhidavinci] Processing: "🚀 $BTC breaking out above $90k!..."
[@abhidavinci] ✅ Signal detected: BTC - bullish (confidence: 85%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PROCESSING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Messages Processed: 5
  Signals Detected: 3
  Errors: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Deployment

### Railway

Add to `railway.json` or deploy as separate service:

```json
{
  "services": {
    "telegram-alpha-worker": {
      "build": {
        "builder": "NIXPACKS"
      },
      "deploy": {
        "startCommand": "cd services/telegram-alpha-worker && npm start"
      }
    }
  }
}
```

### Docker

```dockerfile
FROM node:20
WORKDIR /app
COPY services/telegram-alpha-worker/package*.json ./
RUN npm install
COPY services/telegram-alpha-worker/ ./
RUN npm run build
CMD ["npm", "start"]
```

## Troubleshooting

### No messages being processed

1. Check if messages exist:
   ```sql
   SELECT COUNT(*) FROM telegram_posts 
   WHERE alpha_user_id IS NOT NULL 
   AND is_signal_candidate IS NULL;
   ```

2. Check if alpha users are active:
   ```sql
   SELECT * FROM telegram_alpha_users WHERE is_active = true;
   ```

### LLM classification failing

1. Check API key is set
2. Check API credits/quota
3. Check logs for specific error messages

### Messages stuck in queue

- Worker might be down
- Check health endpoint
- Restart worker service

