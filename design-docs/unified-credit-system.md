# Maxxit Unified Credit System

## The Problem: Fragmented Payments

Today, Maxxit users juggle **five separate payment rails** to use the platform:

| Rail | What it covers | How user pays |
|------|---------------|---------------|
| **Trading Credits** | Agent trades on Ostium/Aster | Stripe or USDC (pricing page) |
| **OpenClaw Plan** | EC2 server + LLM budget ($2 or $20/mo) | Stripe subscription ($29/$49) |
| **LLM Top-ups** | Extra AI usage beyond plan budget | Stripe one-time payment |
| **Alpha Marketplace** | Buying trading signals from other agents | On-chain USDC + ETH for gas |
| **ZK Proof Generation** | Proving trader performance for alpha listings | Hidden — Maxxit subsidizes |

This creates friction at every step. A user who wants to run an OpenClaw bot, buy alpha signals, and trade on Ostium must maintain a Stripe subscription, fund a separate agent wallet with USDC, hold ETH for gas fees, and manually top up LLM credits when they run out. ZK proof costs are invisible — Maxxit absorbs them with no revenue.

---

## The Solution: One Balance, Everything Included

**$1 = 1 Credit.** Buy credits once. Use them for everything — server time, AI, gas, agent payments, and proof generation. The platform handles all internal complexity.

```
User buys 100 credits ($100)
         │
         ├── Server runtime    → credits deducted per hour
         ├── LLM usage         → credits deducted per token
         ├── Gas fees           → credits deducted per transaction
         ├── Alpha purchases    → credits transferred to seller (minus platform fee)
         └── ZK proof generation → credits deducted per proof
```

Users never need to hold ETH, fund a separate wallet, or worry about which balance covers what. One number, one dashboard, one top-up action.

### Key Rules

- **1-year expiry**: Credits are valid for 12 months from purchase date.
- **80% sellback**: Users can sell unused credits back at any time for 80% of face value ($10 in credits = $8 refund).
- **Turn off to save**: Server charges stop the moment a user pauses their OpenClaw instance. No idle cost.
- **Transparent pricing**: Every deduction shows real cost + margin. No hidden fees.

---

## Economics: Cost Structure and Margins

### Margin by Component

| Component | Real Cost to Maxxit | Margin | Credit Cost to User | Rationale |
|-----------|-------------------|--------|--------------------|-----------| 
| **Server (EC2 t3.small)** | $0.021/hr (~$15/mo 24/7) | **40%** | $0.029/hr (~$21/mo) | Managed infrastructure: AMI, security, updates, monitoring |
| **LLM — GPT-4o-mini** | $0.15/1M input tokens | **20%** | $0.18/1M tokens | Key management + usage tracking |
| **LLM — GPT-5-mini** | $0.05/1M input tokens | **20%** | $0.06/1M tokens | Key management + usage tracking |
| **LLM — GPT-4o** | $2.50/1M tokens (blended) | **20%** | $3.00/1M tokens | Key management + usage tracking |
| **LLM — ZAI GLM 4.7** | $0 (free model) | Flat fee | 0.5 credits/1M tokens | Routing and proxy overhead |
| **Gas (Arbitrum)** | $0.01–0.05/tx | **30%** | $0.013–0.065/tx | Key custody, RPC costs, risk |
| **ZK Proof (Succinct Network)** | $1–5/proof | **30%** | $1.30–6.50/proof | Proving infrastructure + submission |
| **ZK Proof (self-hosted)** | $0.10–1.00/proof | **30%** | $0.13–1.30/proof | Amortized prover server cost |
| **On-chain proof submission** | $0.01–0.10 gas | **30%** | $0.013–0.13/tx | TraderRegistry contract call |
| **Alpha Marketplace** | $0 (pass-through) | **20% commission** | 20% of sale price | Marketplace facilitation |

### Monthly Scenario: $100 Credit Purchase

**User profile:** Runs OpenClaw 24/7, moderate LLM usage, active alpha seller (3 proofs/month), buys 5 signals, 10 on-chain transactions.

| Expense | Credits Used | Real Cost | Platform Margin |
|---------|-------------|-----------|-----------------|
| EC2 server (24/7) | 21.0 | $15.00 | $6.00 (40%) |
| LLM — 2M tokens GPT-4o-mini | 1.8 | $1.50 | $0.30 (20%) |
| 3 ZK proofs (Succinct Network) | 7.8 | $6.00 | $1.80 (30%) |
| 3 on-chain proof submissions | 0.1 | $0.10 | $0.03 (30%) |
| 5 alpha purchases @ 5 USDC each | 30.0 | $25.00 | $5.00 (20%) |
| 10 gas transactions | 0.6 | $0.50 | $0.10 (30%) |
| **Total consumed** | **61.3** | **$48.10** | **$13.23** |
| **Remaining credits** | **38.7** | | |

If the user sells back the remaining 38.7 credits at 80%: refund = $30.96.

**Net platform revenue: $100 − $48.10 − $30.96 = $20.94**

If credits expire unused instead: **Net platform revenue: $100 − $48.10 = $51.90**

### Revenue at Scale

Assumptions: average user runs server 18hr/day, moderate LLM, 2 alpha purchases/month, 1 ZK proof/month, 10 gas txs. ~40% of credits go unused; 60% of unused credits are sold back at 80%.

| Metric | 100 users | 500 users | 1,000 users |
|--------|----------|----------|------------|
| Credit sales/month | $10,000 | $50,000 | $100,000 |
| AWS EC2 cost | $1,125 | $5,625 | $11,250 |
| OpenAI cost | $150 | $750 | $1,500 |
| ZK proving cost | $200 | $1,000 | $2,000 |
| Gas + on-chain cost | $15 | $75 | $150 |
| Alpha pass-through | $1,000 | $5,000 | $10,000 |
| **Total real cost** | **$2,490** | **$12,450** | **$24,900** |
| **Gross margin (before sellback)** | **$7,510 (75%)** | **$37,550** | **$75,100** |
| **After sellback refunds** | **~$5,400** | **~$27,000** | **~$54,000** |

---

## Why This Is Better

| | Current System | Unified Credits |
|--|---------------|----------------|
| **User experience** | 5 separate balances, wallets, and payment flows | 1 credit balance, 1 top-up action |
| **Alpha marketplace revenue** | $0 — on-chain payments bypass platform | 20% commission on every sale |
| **ZK proof revenue** | $0 — Maxxit subsidizes all proving costs | 30% margin, fully transparent |
| **LLM revenue** | $0 — 1:1 passthrough on top-ups | 20% margin on all usage |
| **Server revenue** | Embedded in plan, opaque | 40% margin, pay-per-hour, transparent |
| **Expired credits** | N/A | 100% profit on unused balance |
| **Sellback haircut** | N/A | 20% retained on every refund |
| **Gas management** | User manages ETH + USDC separately | Platform sponsors, deducts credits |
| **Predictability** | Variable costs across multiple systems | One number: credit balance |
