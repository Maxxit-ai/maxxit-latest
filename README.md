# Maxxit 0G

> Portfolio-aware perpetual-futures trading agent using **0G Compute** for trade decisions and **0G Storage** for verifiable alpha delivery.

**Live App:** [https://openclaw.maxxit.ai/](https://openclaw.maxxit.ai/) · **OpenClaw Skill:** [clawhub.ai/abhi152003/maxxit-0g](https://clawhub.ai/abhi152003/maxxit-0g)

---

## Overview

Maxxit 0G:

1. Pulls live portfolio and market context for a user.
2. Calls **0G Compute** for a portfolio-aware trade decision: should trade, side, confidence, and reasoning.
3. Executes the trade on Ostium, Aster, or Avantis perpetuals after explicit user confirmation.
4. Optionally publishes the executed trade as paid alpha, with the alpha payload stored on **0G Storage** and a `rootHash` returned to every buyer for independent verification.

The OpenClaw skill in [`skills/maxxit-0g/`](skills/maxxit-0g/) is the production agent interface. It ships with the repo and drives the full workflow.

Agent identity is wallet-based, and portable alpha payloads are stored through 0G Storage so the agent's outputs can be verified outside Maxxit's application database.

---

## Why 0G Is Necessary

| Problem | 0G usage |
|---|---|
| Trade decisions should be auditable | **0G Compute** broker returns a `verified` flag through `broker.inference.processResponse` |
| Paid alpha needs content integrity | **0G Storage** stores the alpha payload and returns a `rootHash` |
| Agent outputs should be portable | Alpha payloads are content-addressed instead of only living in Maxxit's database |

---

## 0G Integration

### 0G Compute

The agent uses 0G Compute for trade decisions:

1. Resolve the user's lazy-trading deployment + portfolio context.
2. Run market research (`/api/lazy-trading/research`).
3. Send `{ deploymentId, tokenSymbol, marketResearchSummary }` to `/alpha/0g-decision`.
4. Call 0G Compute via `@0glabs/0g-serving-broker`.
5. Return `{ shouldTrade, side, confidence, reasoning, modelUsed, verified }`.
6. Ask for confirmation before executing a trade.

Key files:

- [`pages/api/lazy-trading/programmatic/alpha/0g-decision.ts`](pages/api/lazy-trading/programmatic/alpha/0g-decision.ts)
- [`lib/zg-compute.ts`](lib/zg-compute.ts)
- [`0g-backend/src/compute.ts`](0g-backend/src/compute.ts) - broker init, `getRequestHeaders`, `processResponse`
- [`0g-backend/src/server.ts`](0g-backend/src/server.ts)

### 0G Storage

When a producer flags a trade as alpha, the alpha payload is uploaded to 0G Storage via `@0gfoundation/0g-ts-sdk` (`Indexer.upload(MemData)`). The listing returns `ogStorage.rootHash` and `ogStorage.txHash`. Buyers receive the `rootHash` with their purchase receipt and can use it to verify the payload.

Key files:

- [`pages/api/lazy-trading/programmatic/alpha/flag.ts`](pages/api/lazy-trading/programmatic/alpha/flag.ts)
- [`pages/api/lazy-trading/programmatic/alpha/listings.ts`](pages/api/lazy-trading/programmatic/alpha/listings.ts)
- [`pages/api/lazy-trading/programmatic/alpha/verify.ts`](pages/api/lazy-trading/programmatic/alpha/verify.ts)
- [`lib/zg-storage.ts`](lib/zg-storage.ts), [`lib/alpha-content-hash.ts`](lib/alpha-content-hash.ts)
- [`0g-backend/src/storage.ts`](0g-backend/src/storage.ts) - `uploadAlphaContent`, `downloadAlphaContent`

### SDKs Used

- `@0glabs/0g-serving-broker` - 0G Compute broker
- `@0gfoundation/0g-ts-sdk` - 0G Storage indexer client

### On-chain Activity

No custom contracts were deployed. Maxxit 0G interacts directly with the **0G Galileo Storage flow contract**.

- Example storage upload tx: [`0xac0df9...f913bb50`](https://chainscan-galileo.0g.ai/tx/0xac0df963661261997c039813553101730406fbd8a5557404df8414e1f913bb50)
- Network: 0G Galileo testnet (`evmrpc-testnet.0g.ai`, chain id `16602`)
- Indexer: `indexer-storage-testnet-turbo.0g.ai`

---

## Architecture

```txt
User via OpenClaw / Maxxit UI
  |
  v
skills/maxxit-0g
  - workflow and routing rules
  - strategy runners
  |
  v
Maxxit Lazy Trading API
  |
  +-- market research
  |
  +-- decision call
  |     |
  |     v
  |   0g-backend /compute
  |     |
  |     v
  |   0G Compute
  |
  +-- trade execution
  |     |
  |     v
  |   Ostium / Aster / Avantis
  |
  +-- alpha listing
        |
        v
      0g-backend /storage
        |
        v
      0G Storage rootHash
```

The `0g-backend` is an Express bridge that owns the 0G wallet and exposes `/compute` and `/storage` endpoints to the main Next.js app. 0G keys do not live in the user-facing process.

---

## Supported Trading Venues

- **Ostium** perpetuals (Arbitrum)
- **Aster DEX** perpetuals (BNB Chain)
- **Avantis DEX** perpetuals (Base)
- **Maxxit Alpha Marketplace** for buying/selling trade signals (x402 USDC settlement)

---

## Setup

### 1. Main app

```bash
npm install
cp .env.example .env
npm run dev
```

Required env:

```bash
NEON_REST_URL=
NEON_REST_TOKEN=
ZG_BACKEND_URL=http://localhost:8787
ZG_BACKEND_AUTH_TOKEN=change-me
```

### 2. 0G backend bridge

```bash
cd 0g-backend
npm install
cp .env.example .env
npm run dev
```

Required env:

```bash
PORT=8787
ZG_BACKEND_AUTH_TOKEN=change-me
ZG_WALLET_PRIVATE_KEY=
ZG_COMPUTE_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_COMPUTE_PROVIDER_ADDRESS=
ZG_STORAGE_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_STORAGE_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
```

### 3. OpenClaw skill

```bash
npx clawhub@latest install maxxit-0g
export MAXXIT_API_KEY="lt_your_api_key_here"
export MAXXIT_API_URL="https://maxxit.ai"
```

The skill source is in [`skills/maxxit-0g/`](skills/maxxit-0g/) and includes 7 standalone Python strategy runners (EMA, RSI/Bollinger, Donchian/ADX, taker-flow, mean-reversion, breakout, VWAP).

Example prompts:

```txt
Should I trade BTC?
What does 0G think about ETH?
Make a portfolio-aware decision for SOL.
Open the trade and list it as alpha on 0G storage.
Run the VWAP strategy on BTC/USD using Avantis.
```

---

## Verifying Purchased Alpha

After a buyer completes the x402 purchase flow, they get a receipt containing `ogStorage.rootHash`. They can re-fetch and verify the payload:

```bash
# Verify the purchased alpha payload.
curl -L "https://maxxit.ai/api/lazy-trading/programmatic/alpha/verify" \
  -H "X-API-KEY: $MAXXIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "listingId": "<id>", "content": <alpha object from purchase> }'
```

If the payload does not match the listing, `verified` returns `false`.

---

## Repository Layout

```
maxxit-latest/
pages/api/lazy-trading/programmatic/   Trading and alpha endpoints
  alpha/
    0g-decision.ts                      0G Compute entry point
    flag.ts                             Listing and 0G Storage upload
    verify.ts                           rootHash verification
lib/
  zg-compute.ts                         Compute client wrapper
  zg-storage.ts                         Storage client wrapper
  alpha-content-hash.ts                 Canonical hashing
0g-backend/                             Express bridge that owns the 0G wallet
  src/{compute.ts, storage.ts, server.ts}
skills/maxxit-0g/                       OpenClaw agent
  SKILL.md
  *-strategy.py                         Strategy runners
docs/0G_INTEGRATION_PLAN.md
```