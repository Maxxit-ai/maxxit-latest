# Maxxit Microservices

This directory contains all microservices for the Maxxit platform, broken down into independent, deployable units.

---

## 📦 Services Overview

### API Services (REST)

| Service | Port | Description | Status |
|---------|------|-------------|--------|
| **agent-api** | 4001 | Agent CRUD operations, routing stats | ✅ Ready |
| **deployment-api** | 4002 | Deployment management (Hyperliquid, Ostium) | 🚧 Setup |
| **signal-api** | 4003 | Signal generation and retrieval | 🚧 Setup |

### Workers (Background Jobs)

| Service | Port | Interval | Description | Status |
|---------|------|----------|-------------|--------|
| **trade-executor-worker** | 5001 | 30s | Executes trades based on signals | 🚧 Setup |
| **position-monitor-worker** | 5002 | 60s | Monitors open positions | 🚧 Setup |
| **tweet-ingestion-worker** | 5003 | 5m | Fetches tweets from X accounts | 🚧 Setup |
| **metrics-updater-worker** | 5004 | 1h | Updates APR and Sharpe ratios | 🚧 Setup |
| **research-signal-worker** | 5005 | 2m | Generates signals from research institutes | 🚧 Setup |

---

## 🚀 Quick Start

### 1. Install Dependencies for All Services

From the repository root:

```bash
npm run install:all-services
```

Or manually for each service:

```bash
cd services/agent-api && npm install
cd services/deployment-api && npm install
cd services/signal-api && npm install
cd services/trade-executor-worker && npm install
cd services/position-monitor-worker && npm install
cd services/tweet-ingestion-worker && npm install
cd services/metrics-updater-worker && npm install
cd services/research-signal-worker && npm install
```

### 2. Set Up Environment Variables

Each service needs a `.env` file (copy from `.env.example`):

```bash
# For API services
cd services/agent-api
cp .env.example .env
# Edit .env with your values

# Repeat for all services
```

### 3. Run Services Locally

#### Run All Services (Requires multiple terminals)

```bash
# Terminal 1 - Agent API
cd services/agent-api && npm run dev

# Terminal 2 - Deployment API
cd services/deployment-api && npm run dev

# Terminal 3 - Signal API
cd services/signal-api && npm run dev

# Terminal 4 - Trade Executor
cd services/trade-executor-worker && npm run dev

# Terminal 5 - Position Monitor
cd services/position-monitor-worker && npm run dev

# Terminal 6 - Tweet Ingestion
cd services/tweet-ingestion-worker && npm run dev

# Terminal 7 - Metrics Updater
cd services/metrics-updater-worker && npm run dev

# Terminal 8 - Research Signal Worker
cd services/research-signal-worker && npm run dev
```

#### Run a Single Service

```bash
cd services/agent-api
npm run dev
```

---

## 🏗️ Service Architecture

```
services/
├── agent-api/                # Agent CRUD operations
│   ├── src/
│   │   ├── routes/          # Express routes
│   │   │   ├── agents.ts
│   │   │   ├── agent-accounts.ts
│   │   │   └── routing-stats.ts
│   │   └── server.ts        # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── deployment-api/           # Deployment management
│   ├── src/
│   │   ├── routes/
│   │   │   ├── deployments.ts
│   │   │   ├── hyperliquid.ts
│   │   │   └── ostium.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
│
├── signal-api/               # Signal operations
│   ├── src/
│   │   ├── routes/
│   │   │   └── signals.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
│
├── trade-executor-worker/    # Trade execution
│   ├── src/
│   │   └── worker.ts
│   ├── package.json
│   └── tsconfig.json
│
├── position-monitor-worker/  # Position monitoring
│   ├── src/
│   │   └── worker.ts
│   ├── package.json
│   └── tsconfig.json
│
├── tweet-ingestion-worker/   # Tweet ingestion
│   ├── src/
│   │   └── worker.ts
│   ├── package.json
│   └── tsconfig.json
│
├── metrics-updater-worker/   # Metrics updates
│   ├── src/
│   │   └── worker.ts
│   ├── package.json
│   └── tsconfig.json
│
├── research-signal-worker/   # Research signals
│   ├── src/
│   │   └── worker.ts
│   ├── package.json
│   └── tsconfig.json
│
└── shared/                   # Shared utilities
    ├── lib/                 # Shared libraries
    ├── types/               # Shared TypeScript types
    └── prisma/              # Database schema
```

---

## 🔧 Development

### Building Services

```bash
cd services/<service-name>
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Running Built Services

```bash
cd services/<service-name>
npm start
```

---

## 🚢 Deployment

### Railway Deployment

Each service is deployed as a separate Railway service:

1. **Create Railway Project**
   ```bash
   railway login
   railway init
   ```

2. **Deploy Each Service**
   
   For each service directory:
   ```bash
   cd services/agent-api
   railway up
   ```

3. **Configure Environment Variables**
   
   In Railway dashboard:
   - Add `DATABASE_URL`
   - Add service-specific variables
   - Add Python service URLs (Hyperliquid, Ostium, X API Proxy)

4. **Set Custom Start Command** (if needed)
   
   In Railway settings:
   ```
   npm run build && npm start
   ```

### Environment Variables Reference

#### Common Variables (All Services)
```env
DATABASE_URL=postgresql://...
NODE_ENV=production
LOG_LEVEL=info
```

#### API Services
```env
PORT=4001  # or 4002, 4003
CORS_ORIGIN=https://your-frontend.vercel.app
```

#### Workers
```env
PORT=5001  # or 5002, 5003, 5004, 5005
WORKER_INTERVAL=60000  # milliseconds

# External Services
HYPERLIQUID_SERVICE_URL=https://hyperliquid-service.onrender.com
OSTIUM_SERVICE_URL=https://maxxit-1.onrender.com
X_API_PROXY_URL=https://maxxit.onrender.com
```

---

## 📊 Health Checks

All services expose a `/health` endpoint:

```bash
# Agent API
curl https://agent-api.railway.app/health

# Trade Executor Worker
curl https://trade-executor.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "agent-api",
  "port": 4001,
  "timestamp": "2025-11-13T16:00:00.000Z"
}
```

---

## 🔍 Monitoring

### Logs

View logs in Railway dashboard or via CLI:

```bash
railway logs --service agent-api
```

### Metrics

- **Uptime**: Railway dashboard
- **Response Times**: Application logs
- **Error Rates**: Application logs + Railway metrics

---

## 🧪 Testing

### Unit Tests

```bash
cd services/<service-name>
npm test
```

### Integration Tests

Test complete flows:
1. Create agent via Agent API
2. Deploy agent via Deployment API
3. Generate signal via Signal API
4. Execute trade via Trade Executor Worker
5. Monitor position via Position Monitor Worker

---

## 📚 Related Documentation

- [MICROSERVICES_ARCHITECTURE.md](../MICROSERVICES_ARCHITECTURE.md) - Architecture overview
- [MICROSERVICES_MIGRATION.md](../MICROSERVICES_MIGRATION.md) - Migration guide
- [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) - Deployment instructions

---

## 🆘 Troubleshooting

### Service won't start
- Check `DATABASE_URL` is set
- Verify all dependencies are installed (`npm install`)
- Check port isn't already in use

### Worker not processing tasks
- Verify database connection
- Check `WORKER_INTERVAL` environment variable
- Review worker logs for errors

### API returns 500 errors
- Check database connectivity
- Verify external service URLs (Hyperliquid, Ostium, X API Proxy)
- Review API logs

---

## 🤝 Contributing

1. Make changes to the specific service
2. Test locally
3. Build and verify
4. Deploy to Railway staging environment
5. Test in staging
6. Deploy to production

---

## 📝 License

MIT

