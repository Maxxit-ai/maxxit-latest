# Alpha Marketplace -- Design Document

**Branch:** `openclaw`  
**Network:** Arbitrum Sepolia (testnet)  
**Date:** 2026-02-21  
**Status:** Ready for team review

---

## 1. What This Is

A set of API endpoints added to the existing `maxxit-lazy-trading` OpenClaw skill that let trading agents:

- **Produce alpha:** Generate a ZK proof of their Ostium trading performance, then flag individual positions as purchasable "alpha signals" with a price.
- **Consume alpha:** Discover proven agents (by pseudonymous commitment, not wallet), browse available alpha listings, pay for the full trade content, verify it, and execute it on their own Ostium account.

The core idea: an agent proves its track record trustlessly (ZK proof of on-chain Ostium data), then sells individual trade signals to other agents. Consumers never learn the producer's wallet address -- they only see a `commitment` (a hash of the address + salt).

---

## 2. Why This Exists

The existing copy-trading flow (`/copy-traders` + `/copy-trader-trades`) is **free and identity-revealing**: anyone can see a trader's wallet and all their trades. The Alpha Marketplace adds:

1. **Privacy** -- Producer wallet is hidden behind a `commitment = sha256(ostium_address + salt)`.
2. **Monetization** -- Producers set a per-signal USDC price; consumers pay via x402 (HTTP 402 payment protocol).
3. **Trustlessness** -- Performance metrics (PnL, win rate, trade count) are ZK-verified from on-chain Ostium data, not self-reported.
4. **Conviction signals** -- Each alpha includes `leverage` and `positionPct` (what % of portfolio is in this trade), so consumers can gauge how confident the producer is.

---

## 3. Architecture Overview

```
PRODUCER FLOW                           CONSUMER FLOW
=============                           =============

1. POST /alpha/generate-proof           1. GET /alpha/agents
   - Creates commitment if needed          - See commitments + verified metrics
   - Inserts proof_records (PENDING)       - winRate, totalPnl, tradeCount
                                        
2. [Proof worker picks up job]          2. GET /alpha/listings
   - Brevis generates ZK proof             - See listing price + agent metrics
   - Updates proof_records (VERIFIED)      - Trade content NOT shown
                                        
3. POST /open-position (normal trade)   3. GET /alpha/purchase/:listingId
                                           - First call: 402 (payment required)
4. POST /alpha/flag                        - With payment: full alpha content
   - Computes conviction (positionPct)     
   - Stores in alpha_listings           4. POST /alpha/verify
   - Hashes content for integrity          - Confirm content hash matches
                                        
                                        5. POST /alpha/execute
                                           - Open same trade on own account
```

---

## 4. Database Changes

### 4.1 New Enum: `proof_status_t`

| Value | Meaning |
|-------|---------|
| `PENDING` | Record created, waiting for proof worker |
| `PROVING` | Brevis is generating the proof |
| `VERIFIED` | Proof verified, metrics populated |
| `FAILED` | Proof generation failed |

### 4.2 New Model: `proof_records`

Tracks one ZK proof request per agent.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | |
| `agent_id` | UUID (FK agents) | Which agent requested this proof |
| `commitment` | String | `sha256(ostium_address + salt)` |
| `brevis_request_id` | String? | Brevis job ID (set by proof worker) |
| `status` | proof_status_t | Lifecycle state |
| `total_pnl` | Decimal? | ZK-proven total PnL (set when VERIFIED) |
| `trade_count` | Int? | ZK-proven trade count |
| `win_count` | Int? | ZK-proven winning trades |
| `total_collateral` | Decimal? | ZK-proven total collateral deployed |
| `start_block` | BigInt? | Arbitrum block range start |
| `end_block` | BigInt? | Arbitrum block range end |
| `proof_timestamp` | DateTime? | When the proof was generated |
| `verified_at` | DateTime? | When proof was verified on-chain |
| `tx_hash` | String? | Verification transaction hash |
| `created_at` | DateTime | Record creation time |

Indexes: `agent_id`, `commitment`, `status`.

### 4.3 New Model: `alpha_listings`

One row per alpha signal listed for sale.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Also serves as the `listingId` in API |
| `agent_id` | UUID (FK agents) | Producer agent |
| `position_id` | UUID? (FK positions) | Source position being sold |
| `commitment` | String | Producer's pseudonymous identity |
| `on_chain_listing_id` | String? | Future: ID from AlphaMarket.sol |
| `token` | String | e.g. "BTC", "ETH" |
| `side` | String | "LONG" or "SHORT" |
| `leverage` | Int | Leverage used (conviction signal) |
| `position_pct` | Int | Basis points of portfolio (2500 = 25%) |
| `price_usdc` | Decimal | USDC price for this alpha |
| `content_hash` | String | `sha256(JSON.stringify(alpha_content))` |
| `alpha_content` | JSON | Full trade details (encrypted at rest) |
| `active` | Boolean | Whether listing is purchasable |
| `created_at` | DateTime | |

Indexes: `agent_id`, `commitment`, `[active, created_at]`.

### 4.4 Modified Model: `agents`

| New Column | Type | Purpose |
|------------|------|---------|
| `commitment` | String? (unique) | `sha256(ostium_address + salt)` |
| `salt_encrypted` | String? | Salt used to generate commitment |
| `salt_iv` | String? | Encryption IV (reserved for AES encryption) |
| `salt_tag` | String? | Encryption tag (reserved for AES encryption) |
| `alpha_default_price` | Decimal? | Default price for new alpha listings |

New relations: `proof_records[]`, `alpha_listings[]`.

### 4.5 Modified Model: `positions`

New relation: `alpha_listings[]`.

---

## 5. API Endpoints -- Detailed Design

All endpoints are under `/api/lazy-trading/programmatic/alpha/`.  
All use the same `resolveLazyTradingApiKey()` auth as existing endpoints.  
All return `{ success: bool, ... }` and `network: "arbitrum-sepolia"`.

### 5.1 GET `/alpha/agents` -- Discover verified agents

**Intent:** Let consumers browse agents who have ZK-proven performance. Never reveals wallet addresses.

**Logic:**
1. Query `proof_records` where status = VERIFIED, distinct by commitment, ordered by verified_at DESC.
2. Compute winRate = `(win_count / trade_count) * 100`.
3. Apply `minWinRate` and `minTrades` filters.
4. For each agent, count active alpha_listings.
5. Return list.

**Query params:** `minWinRate` (float), `minTrades` (int), `limit` (int, default 20, max 100).

**Potential issues to verify:**
- The `distinct: ["commitment"]` Prisma query returns the first row per commitment. Since we `orderBy: verified_at desc`, this gives the latest proof per agent. Confirm Prisma behavior matches this intent.
- `take: limit * 2` is used as a buffer before post-filtering by winRate. If many agents have low winRate, the result set could be smaller than `limit`. This is an acceptable trade-off vs. a raw SQL window function.

---

### 5.2 GET `/alpha/listings` -- Browse alpha metadata

**Intent:** Show what alphas are available and their price. Trade content (token, side, leverage) is NOT returned -- that's paid.

**Logic:**
1. Query `alpha_listings` where active = true, with optional commitment and maxPrice filters.
2. For each unique commitment, fetch the latest VERIFIED proof_record to attach agent metrics.
3. Return listings with metadata + agent metrics.

**Query params:** `commitment` (string), `maxPrice` (float), `limit` (int, default 20, max 100).

**Potential issues to verify:**
- `maxPrice` filter uses `price_usdc: { lte: maxPrice }`. Since `price_usdc` is Decimal and `maxPrice` is a float, Prisma should handle the comparison correctly, but worth testing with edge cases like `0.001`.

---

### 5.3 GET `/alpha/purchase/[listingId]` -- Pay and get alpha content

**Intent:** x402 payment gate. First call returns 402 with payment details. After payment (or testnet bypass), returns the full alpha content.

**Logic:**
1. Look up listing by ID.
2. Check `active` status (410 if inactive).
3. Check headers: `x-payment` (real x402 proof) or `x-payment-verified: true` (testnet bypass).
4. If no payment: return 402 with price, USDC contract, chain ID, payTo address.
5. If payment present: return full `alpha_content` JSON.

**402 response headers:** `X-Payment-Required`, `X-Payment-Network`, `X-Payment-Amount`, `X-Payment-Asset`, `X-Payment-Receiver`.

**Potential issues to verify:**
- **BUG (known, testnet-only):** The `x-payment` header is checked for presence but NOT validated. On testnet this is intentional (pass `X-Payment-Verified: true`). On mainnet, this MUST be replaced with actual x402 signature verification before deployment.
- **BUG (minor):** If `listing.agents` is null (orphaned listing), `payTo` will be empty string in the 402 response. Consider failing with 500 instead.
- **Security:** Any authenticated user can purchase any listing. There's no rate limiting on purchases. Consider adding rate limiting before mainnet.

---

### 5.4 POST `/alpha/verify` -- Verify content hash

**Intent:** Let consumers verify that the alpha content they received matches the stored hash. Trustless integrity check.

**Logic:**
1. Take `listingId` and `content` from body.
2. Compute `sha256(JSON.stringify(content))`.
3. Compare with `listing.content_hash`.
4. Return `verified: true/false`.

**Potential issues to verify:**
- **BUG (critical for verification):** The verify endpoint computes `sha256(JSON.stringify(content))` but the flag endpoint also computes `sha256(JSON.stringify(alphaContent))`. If the consumer passes the `alpha` object from the purchase response directly, `JSON.stringify` must produce the exact same string. JavaScript `JSON.stringify` is deterministic for the same object structure, but if the content went through any serialization/deserialization cycle (e.g., Prisma stores it as JSONB, which may reorder keys), the hash could differ. **Recommendation:** Test this end-to-end: flag a position, purchase it, then verify. If JSONB reorders keys, the hash will not match.
- **Mitigation:** The flag endpoint stores `alpha_content` as the original object. The purchase endpoint returns `listing.alpha_content`. If Prisma/Postgres preserves insertion order for JSONB (PostgreSQL does for top-level keys), this should work. But it's fragile and should be tested.

---

### 5.5 POST `/alpha/execute` -- Execute purchased alpha

**Intent:** Let consumers execute a purchased alpha on Ostium using their own account.

**Logic:**
1. Extract `token` and `side` from `alphaContent`.
2. Use consumer's `agentAddress` and `userAddress` (from `/club-details`).
3. Consumer chooses their own `collateral`.
4. Optional `leverageOverride` (defaults to alpha's leverage, then 10).
5. Proxy to Ostium service `/open-position` with `isTestnet: true`.

**Potential issues to verify:**
- **Hardcoded `isTestnet: true`:** This endpoint always trades on testnet. Before mainnet launch, this must become configurable or removed.
- **No validation of agentAddress/userAddress ownership:** The endpoint trusts the caller to provide their own addresses. A malicious user could pass another user's `agentAddress`. However, the Ostium service itself validates the agent's signing authority, so this should fail at the Ostium layer. Still worth documenting.
- **No logging of alpha-sourced trades:** The execute endpoint doesn't record which listing the trade came from. Consider adding `source: "alpha"` or linking to the listing ID in the positions table for analytics.

---

### 5.6 POST `/alpha/generate-proof` -- Queue ZK proof

**Intent:** Producer triggers ZK proof of their Ostium trading performance. Idempotent.

**Logic:**
1. Find the caller's Ostium agent by `creator_wallet`.
2. If a proof is already PENDING or PROVING, return it (idempotent).
3. If agent has no `commitment`, generate one: `sha256(ostium_agent_address + random_salt)`, store salt on agent.
4. Create a `proof_records` row with status PENDING.
5. Return proofId and commitment.

**Potential issues to verify:**
- **Salt storage:** The salt is stored in `salt_encrypted` as plain hex. The field name says "encrypted" but it is NOT encrypted in this implementation. **Before mainnet:** encrypt using AES-256-GCM with `salt_iv` and `salt_tag` fields. For testnet this is acceptable.
- **No actual proof generation:** This endpoint only creates a DB record. It relies on a separate `proof-generation-worker` (not yet built) to poll for PENDING records and submit them to Brevis. Until that worker exists, proofs will stay PENDING forever.
- **Race condition:** Two simultaneous calls could both pass the "no existing PENDING/PROVING" check and create duplicate records. The window is small (milliseconds) and the consequence is minor (two PENDING records). Could be fixed with a DB unique constraint or advisory lock if needed.

---

### 5.7 GET `/alpha/my-proof` -- Check own proof status

**Intent:** Producer checks their latest proof status and metrics.

**Logic:**
1. Find the caller's Ostium agent.
2. Fetch the latest `proof_records` row (by created_at DESC).
3. If VERIFIED, include metrics (totalPnl, winRate, etc.).
4. If not VERIFIED, include status only.

**Potential issues to verify:**
- None significant. This is a straightforward read endpoint.

---

### 5.8 POST `/alpha/flag` -- Flag position as alpha

**Intent:** Producer flags an open position as a purchasable alpha signal.

**Logic:**
1. Verify producer has a `commitment` and at least one VERIFIED proof.
2. Look up the position; verify ownership (deployment's `user_wallet` matches API key's `user_wallet`).
3. Verify position is OPEN.
4. Compute leverage: `leverageOverride || signal.llm_leverage || 10`.
5. Compute `positionPct`: this position's notional / total portfolio notional (basis points).
6. Build `alphaContent` JSON: `{ token, side, leverage, positionPct, entryPrice, collateralUsdc, venue, timestamp }`.
7. Compute `content_hash = sha256(JSON.stringify(alphaContent))`.
8. Insert `alpha_listings` row.

**Potential issues to verify:**
- **Conviction calculation uses `llm_leverage`:** The positions table doesn't store leverage directly. It falls back to `signals.llm_leverage` (the leverage the LLM decided on). If the signal is null or llm_leverage is null, it defaults to 10. This is an approximation -- the actual on-chain leverage may differ if it was overridden during execution. **Recommendation:** If precision matters, read leverage from the Ostium subgraph instead.
- **Same position can be flagged multiple times:** There's no unique constraint on `(position_id)` in alpha_listings. A producer could create multiple listings for the same position at different prices. Decide if this is intended behavior or a bug.
- **No price validation:** `priceUsdc` can be 0 or negative. Add a `priceUsdc > 0` check.
- **No on-chain posting:** The `on_chain_listing_id` is always null. The AlphaMarket.sol contract is not yet deployed, so listings are DB-only. This is expected for testnet.

---

## 6. Data Flow Diagram

```
                    PRODUCER                                     CONSUMER
                    ========                                     ========

  [Trades on Ostium]                              [Has API key + USDC]
        |                                                |
        v                                                v
  POST /generate-proof                            GET /alpha/agents
        |                                           "64% win rate, 87 trades"
        v                                                |
  proof_records (PENDING)                                v
        |                                         GET /alpha/listings
  [proof-generation-worker]                         "3 alphas, $0.50 each"
  [reads Ostium on-chain data]                           |
  [generates Brevis ZK proof]                            v
  [updates proof_records → VERIFIED]              GET /alpha/purchase/:id
        |                                           → 402 (pay $0.50 USDC)
        v                                           → [pay via x402]
  POST /alpha/flag                                  → 200 { token: BTC,
    position_id + priceUsdc                              side: LONG,
        |                                                leverage: 15,
        v                                                positionPct: 2500 }
  alpha_listings (active)                                |
        |                                                v
        +------ content_hash -------→            POST /alpha/verify
                                                   "verified: true"
                                                         |
                                                         v
                                                  POST /alpha/execute
                                                    → Ostium /open-position
                                                    → BTC LONG on own account
```

---

## 7. Security Considerations

| Area | Current State | Mainnet Requirement |
|------|--------------|---------------------|
| **x402 payment** | Testnet bypass via `X-Payment-Verified: true` header | Must verify actual USDC payment on-chain or via x402 SDK |
| **Salt encryption** | Salt stored as plain hex in `salt_encrypted` | Encrypt with AES-256-GCM using `salt_iv` and `salt_tag` |
| **Rate limiting** | None on alpha endpoints | Add per-key rate limits, especially on `/purchase` and `/execute` |
| **Commitment uniqueness** | sha256(address + salt) with random 32-byte salt | Sufficient entropy; no changes needed |
| **Position ownership** | Checked via `deployment.user_wallet === apiKey.user_wallet` | Adequate |
| **Content integrity** | sha256 hash stored at creation, verifiable by consumer | Adequate; consider keccak256 for Solidity compatibility |

---

## 8. Known Gaps (Not Bugs -- Intentionally Deferred)

| Gap | Why Deferred | When to Build |
|-----|-------------|---------------|
| **Proof-generation worker** | Complex Brevis integration; endpoints are ready | Before mainnet launch |
| **AlphaMarket.sol contract** | On-chain posting of listings and metrics | Before mainnet launch |
| **Real x402 payment verification** | Requires @x402/server integration | Before mainnet launch |
| **Salt AES encryption** | Low risk on testnet | Before mainnet launch |
| **Deactivate listing on position close** | Listings stay active even after position closes | Next iteration |
| **Purchase tracking / analytics** | No record of who bought what | Next iteration |

---

## 9. Bugs to Fix

| # | Severity | File | Line(s) | Description | Fix |
|---|----------|------|---------|-------------|-----|
| 1 | **High** | `purchase/[listingId].ts` | 64-68 | `x-payment` header is checked for presence but not validated. Anyone can pass a fake header. | For testnet: OK (use `X-Payment-Verified` bypass). For mainnet: integrate `@x402/server` to verify USDC payment proof. |
| 2 | **Medium** | `verify.ts` | 53-59 | Content hash comparison depends on `JSON.stringify` producing identical output after Postgres JSONB round-trip. JSONB may reorder keys. | Test end-to-end. If hash mismatch occurs, store `alpha_content` as a text column instead of JSON, or store the pre-stringified version alongside the hash. |
| 3 | **Medium** | `generate-proof.ts` | 79-97 | Salt stored as plaintext in `salt_encrypted`. Field name is misleading. | Rename to `salt_hex` for testnet clarity, or implement AES-256-GCM encryption before mainnet. |
| 4 | **Low** | `flag.ts` | 31 | No validation that `priceUsdc > 0`. Could create free or negative-price listings. | Add: `if (priceUsdc <= 0) return 400`. |
| 5 | **Low** | `flag.ts` | 161-175 | Same position can be flagged as alpha multiple times (no unique constraint). | Decide: if intended, document it. If not, add a check for existing active listing on the same position_id. |
| 6 | **Low** | `execute.ts` | 67 | `isTestnet: true` is hardcoded. Will break on mainnet. | Make configurable via env var (`OSTIUM_IS_TESTNET`) or derive from deployment config. |
| 7 | **Low** | `purchase/[listingId].ts` | 69 | If `listing.agents` is null (orphaned record), `payTo` is empty string. Consumer gets a 402 with no payment address. | Return 500 "Listing has no associated agent" if payTo is falsy. |
| 8 | **Info** | `agents.ts` | 50 | `take: limit * 2` is a heuristic buffer for post-filter. With many low-winRate agents, results could be fewer than requested `limit`. | Acceptable for now. Could switch to raw SQL with window functions if precision matters. |

---

## 10. Testing Checklist

### Database
- [ ] Run `npx prisma migrate dev` -- confirm migration succeeds with no errors.
- [ ] Confirm `proof_records` and `alpha_listings` tables are created.
- [ ] Confirm `agents` table has new columns: `commitment`, `salt_encrypted`, `salt_iv`, `salt_tag`, `alpha_default_price`.
- [ ] Confirm `positions` -> `alpha_listings` relation works (cascade behavior).

### Producer Flow
- [ ] Call `POST /alpha/generate-proof` -- should return proofId + PENDING status.
- [ ] Call again -- should return same proofId (idempotent).
- [ ] Manually update proof_records row to VERIFIED with test metrics.
- [ ] Call `GET /alpha/my-proof` -- should show metrics.
- [ ] Open a position via `/open-position`.
- [ ] Call `POST /alpha/flag` with position ID and price -- should return listingId + conviction.
- [ ] Call `/alpha/flag` with same position -- confirm behavior (currently allows duplicates).
- [ ] Call `/alpha/flag` without a verified proof -- should return 400.
- [ ] Call `/alpha/flag` with a CLOSED position -- should return 400.
- [ ] Call `/alpha/flag` with another user's position -- should return 403.

### Consumer Flow
- [ ] Call `GET /alpha/agents` -- should show the producer's commitment + metrics.
- [ ] Call `GET /alpha/agents?minWinRate=99` -- should filter out most agents.
- [ ] Call `GET /alpha/listings` -- should show the listing with price (no trade content).
- [ ] Call `GET /alpha/listings?maxPrice=0.01` -- should filter if price is higher.
- [ ] Call `GET /alpha/purchase/{listingId}` without payment header -- should return 402.
- [ ] Call with `X-Payment-Verified: true` -- should return full alpha content.
- [ ] Call `POST /alpha/verify` with the returned content -- should return `verified: true`.
- [ ] Modify one field in content and verify again -- should return `verified: false`.
- [ ] Call `POST /alpha/execute` with alpha content + own addresses -- should open position on Ostium testnet.

### Edge Cases
- [ ] Call any endpoint with invalid/missing API key -- should return 401.
- [ ] Call POST endpoints with GET and vice versa -- should return 405.
- [ ] Call `/alpha/purchase/nonexistent-uuid` -- should return 404.
- [ ] Call `/alpha/flag` with `priceUsdc: 0` -- currently succeeds (see Bug #4).
- [ ] Call `/alpha/generate-proof` for a wallet with no Ostium agent -- should return 404.

---

## 11. File Inventory

### New Files (9)
```
pages/api/lazy-trading/programmatic/alpha/agents.ts
pages/api/lazy-trading/programmatic/alpha/listings.ts
pages/api/lazy-trading/programmatic/alpha/purchase/[listingId].ts
pages/api/lazy-trading/programmatic/alpha/verify.ts
pages/api/lazy-trading/programmatic/alpha/execute.ts
pages/api/lazy-trading/programmatic/alpha/generate-proof.ts
pages/api/lazy-trading/programmatic/alpha/my-proof.ts
pages/api/lazy-trading/programmatic/alpha/flag.ts
docs/ALPHA_MARKETPLACE_DESIGN.md          (this file)
```

### Modified Files (3)
```
prisma/schema.prisma                      (added enum, 2 models, agent/position fields)
skills/maxxit-lazy-trading/SKILL.md       (added Alpha Marketplace section + workflows)
skills/maxxit-lazy-trading/README.md      (added Alpha Marketplace venue)
```

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Commitment** | `sha256(ostium_agent_address + salt)` -- pseudonymous agent identity that hides the wallet |
| **Alpha** | A paid trading signal containing token, side, leverage, position%, entry price |
| **Conviction** | How much skin the producer has: `positionPct` (% of portfolio) + `leverage` |
| **x402** | HTTP payment protocol: server returns 402 + payment details, client pays and retries |
| **Brevis** | ZK coprocessor that reads on-chain data and generates verifiable proofs |
| **Content hash** | `sha256(JSON.stringify(alphaContent))` -- integrity check for purchased alpha |
| **positionPct** | Basis points (0-10000): position notional / total portfolio notional * 10000 |
