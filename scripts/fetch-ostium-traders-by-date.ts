#!/usr/bin/env npx tsx
/**
 * Fetch Ostium Traders by Date Range → CSV
 *
 * Queries Ostium's subgraph for ALL trades within a date window,
 * finds unique trader wallets, fetches their overall stats from the
 * `users` entity, and writes a CSV sorted by PnL descending.
 *
 * Default range: 1 Jan 2026 – 16 Feb 2026
 *
 * Usage:
 *   npx tsx scripts/fetch-ostium-traders-by-date.ts
 *   npx tsx scripts/fetch-ostium-traders-by-date.ts --from 2026-01-01 --to 2026-02-16
 *   npx tsx scripts/fetch-ostium-traders-by-date.ts --output my-file.csv
 */

import * as fs from "fs";
import * as path from "path";

const SUBGRAPH_URL =
    "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

const PAGE_SIZE = 1000;

// Default date range
const DEFAULT_FROM = "2026-01-01";
const DEFAULT_TO = "2026-02-16";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubgraphTrade {
    id: string;
    trader: string;
    isBuy: boolean;
    collateral: string;
    leverage: string;
    timestamp: string;
    pair: { from: string; to: string };
}

/** Per-trader activity collected from trades in the date range */
interface TraderActivity {
    tradesInRange: number;
    totalCollateral: number;
    totalVolume: number;
    firstTradeTs: number;
    lastTradeTs: number;
    pairs: Set<string>;
}

/** User-level stats from the `users` subgraph entity (lifetime) */
interface SubgraphUser {
    id: string;
    totalVolume: string;
    totalOpenVolume: string;
    totalClosedVolume: string;
    totalPnL: string;
    totalProfitTrades: string;
    totalLossTrades: string;
}

interface TraderRow {
    wallet_address: string;
    total_pnl: number;
    total_volume: number;
    total_closed_volume: number;
    total_profit_trades: number;
    total_loss_trades: number;
    total_trades_lifetime: number;
    win_rate_pct: number;
    trades_in_range: number;
    volume_in_range: number;
    first_trade_in_range: string;
    last_trade_in_range: string;
    pairs_traded: string;
}

// ── CLI args ───────────────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (flag: string, fallback: string) => {
        const idx = args.indexOf(flag);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
    };

    const fromDate = get("--from", DEFAULT_FROM);
    const toDate = get("--to", DEFAULT_TO);
    const output = get("--output", `ostium_traders_${fromDate}_to_${toDate}.csv`);

    const fromTs = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
    const toTs = Math.floor(new Date(`${toDate}T23:59:59Z`).getTime() / 1000);

    if (isNaN(fromTs) || isNaN(toTs)) {
        console.error("❌ Invalid date format. Use YYYY-MM-DD");
        process.exit(1);
    }

    return { fromDate, toDate, fromTs, toTs, output };
}

// ── Step 1: Fetch trades in range (for unique wallets + activity) ──────────────

async function fetchTradesInRange(
    fromTs: number,
    toTs: number
): Promise<SubgraphTrade[]> {
    const allTrades: SubgraphTrade[] = [];
    let lastId = "";
    let hasMore = true;
    let page = 0;

    console.log("📡 Step 1: Fetching trades in date range...");

    while (hasMore) {
        const query = `
      query GetTradesInRange($first: Int!, $since: BigInt!, $until: BigInt!${lastId ? ", $lastId: String!" : ""}) {
        trades(
          where: {
            timestamp_gte: $since
            timestamp_lte: $until
            ${lastId ? "id_gt: $lastId" : ""}
          }
          orderBy: id
          orderDirection: asc
          first: $first
        ) {
          id
          trader
          isBuy
          collateral
          leverage
          timestamp
          pair { from to }
        }
      }
    `;

        const variables: Record<string, any> = {
            first: PAGE_SIZE,
            since: fromTs.toString(),
            until: toTs.toString(),
        };
        if (lastId) variables.lastId = lastId;

        const res = await fetch(SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        });

        if (!res.ok) {
            throw new Error(`Subgraph request failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as {
            data?: { trades: SubgraphTrade[] };
            errors?: any[];
        };

        if (json.errors) {
            throw new Error(`Subgraph errors: ${JSON.stringify(json.errors)}`);
        }

        const trades = json.data?.trades ?? [];
        allTrades.push(...trades);
        page++;

        console.log(
            `   page ${page}: ${trades.length} trades (total: ${allTrades.length})`
        );

        if (trades.length < PAGE_SIZE) {
            hasMore = false;
        } else {
            lastId = trades[trades.length - 1].id;
            await new Promise((r) => setTimeout(r, 150));
        }
    }

    console.log(`✅ Total trades in range: ${allTrades.length}\n`);
    return allTrades;
}

// ── Step 2: Aggregate per-wallet activity from trades ──────────────────────────

function buildTraderActivity(trades: SubgraphTrade[]): Map<string, TraderActivity> {
    const map = new Map<string, TraderActivity>();

    for (const t of trades) {
        const wallet = t.trader.toLowerCase();
        let act = map.get(wallet);
        if (!act) {
            act = {
                tradesInRange: 0,
                totalCollateral: 0,
                totalVolume: 0,
                firstTradeTs: Infinity,
                lastTradeTs: 0,
                pairs: new Set(),
            };
            map.set(wallet, act);
        }

        const collateral = Number(t.collateral) / 1e6;
        const leverage = Number(t.leverage) / 100;
        const ts = parseInt(t.timestamp);

        act.tradesInRange++;
        act.totalCollateral += collateral;
        act.totalVolume += collateral * leverage;
        if (ts < act.firstTradeTs) act.firstTradeTs = ts;
        if (ts > act.lastTradeTs) act.lastTradeTs = ts;
        if (t.pair?.from) act.pairs.add(t.pair.from);
    }

    return map;
}

// ── Step 3: Fetch user stats from the `users` entity ───────────────────────────

async function fetchUserStats(wallets: string[]): Promise<Map<string, SubgraphUser>> {
    const map = new Map<string, SubgraphUser>();
    const BATCH = 100; // subgraph `where: { id_in: [...] }` batch size

    console.log(`📡 Step 2: Fetching user stats for ${wallets.length} traders...`);

    for (let i = 0; i < wallets.length; i += BATCH) {
        const batch = wallets.slice(i, i + BATCH);

        const query = `
      query GetUsers($ids: [String!]!) {
        users(where: { id_in: $ids }, first: ${BATCH}) {
          id
          totalVolume
          totalOpenVolume
          totalClosedVolume
          totalPnL
          totalProfitTrades
          totalLossTrades
        }
      }
    `;

        const res = await fetch(SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables: { ids: batch } }),
        });

        if (!res.ok) {
            console.warn(`   ⚠️  Batch ${Math.floor(i / BATCH) + 1} failed: ${res.status}`);
            continue;
        }

        const json = (await res.json()) as {
            data?: { users: SubgraphUser[] };
            errors?: any[];
        };

        if (json.errors) {
            console.warn(`   ⚠️  Batch errors:`, json.errors);
            continue;
        }

        const users = json.data?.users ?? [];
        for (const u of users) map.set(u.id.toLowerCase(), u);

        console.log(
            `   batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(wallets.length / BATCH)}: ` +
            `fetched ${users.length} users (total: ${map.size})`
        );

        await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`✅ User stats fetched: ${map.size}\n`);
    return map;
}

// ── Merge activity + user stats → rows ─────────────────────────────────────────

function buildRows(
    activity: Map<string, TraderActivity>,
    userStats: Map<string, SubgraphUser>
): TraderRow[] {
    const rows: TraderRow[] = [];

    for (const [wallet, act] of activity) {
        const u = userStats.get(wallet);
        if (!u) continue; // shouldn't happen

        const totalPnl = Number(BigInt(u.totalPnL)) / 1e6;
        const totalVolume = Number(BigInt(u.totalVolume)) / 1e6;
        const totalClosedVolume = Number(BigInt(u.totalClosedVolume || u.totalVolume)) / 1e6;
        const profitTrades = parseInt(u.totalProfitTrades, 10);
        const lossTrades = parseInt(u.totalLossTrades, 10);
        const totalTrades = profitTrades + lossTrades;
        const winRate = totalTrades > 0 ? (profitTrades / totalTrades) * 100 : 0;

        rows.push({
            wallet_address: wallet,
            total_pnl: totalPnl,
            total_volume: totalVolume,
            total_closed_volume: totalClosedVolume,
            total_profit_trades: profitTrades,
            total_loss_trades: lossTrades,
            total_trades_lifetime: totalTrades,
            win_rate_pct: parseFloat(winRate.toFixed(2)),
            trades_in_range: act.tradesInRange,
            volume_in_range: act.totalVolume,
            first_trade_in_range: new Date(act.firstTradeTs * 1000).toISOString().slice(0, 10),
            last_trade_in_range: new Date(act.lastTradeTs * 1000).toISOString().slice(0, 10),
            pairs_traded: Array.from(act.pairs).sort().join("|"),
        });
    }

    return rows.sort((a, b) => b.total_pnl - a.total_pnl);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatUsd(value: number): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";

    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
    return `${sign}$${abs.toFixed(2)}`;
}

// ── CSV writer ─────────────────────────────────────────────────────────────────

function writeCsv(rows: TraderRow[], filePath: string): void {
    const headers = [
        "rank",
        "wallet_address",
        "total_pnl",
        "total_volume",
        "total_closed_volume",
        "profit_trades",
        "loss_trades",
        "total_trades_lifetime",
        "win_rate",
        "trades_in_range",
        "volume_in_range",
        "first_trade_in_range",
        "last_trade_in_range",
        "pairs_traded",
    ];

    const lines = [headers.join(",")];

    rows.forEach((row, idx) => {
        lines.push(
            [
                idx + 1,
                row.wallet_address,
                formatUsd(row.total_pnl),
                formatUsd(row.total_volume),
                formatUsd(row.total_closed_volume),
                row.total_profit_trades,
                row.total_loss_trades,
                row.total_trades_lifetime,
                `${row.win_rate_pct}%`,
                row.trades_in_range,
                formatUsd(row.volume_in_range),
                row.first_trade_in_range,
                row.last_trade_in_range,
                `"${row.pairs_traded}"`,
            ].join(",")
        );
    });

    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
    const { fromDate, toDate, fromTs, toTs, output } = parseArgs();
    const outputPath = path.resolve(process.cwd(), output);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📥 OSTIUM TRADERS BY DATE RANGE → CSV");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  📅 Range: ${fromDate}  →  ${toDate}`);
    console.log(`  ⏱  Timestamps: ${fromTs}  →  ${toTs}\n`);

    const trades = await fetchTradesInRange(fromTs, toTs);

    if (trades.length === 0) {
        console.log("⚠️  No trades found in this date range.");
        return;
    }

    // Step 2: Aggregate activity per wallet from the trades
    const activity = buildTraderActivity(trades);
    const wallets = Array.from(activity.keys());

    // Step 3: Fetch lifetime user stats for each unique wallet
    const userStats = await fetchUserStats(wallets);

    // Step 4: Merge and build final rows
    const rows = buildRows(activity, userStats);
    writeCsv(rows, outputPath);

    // Print top 15 summary
    console.log("🏆 Top 15 Traders by PnL (lifetime):");
    console.log("─────────────────────────────────────────────────────────────");
    rows.slice(0, 15).forEach((r, i) => {
        console.log(
            `  ${(i + 1).toString().padStart(3)}. ${r.wallet_address.slice(0, 12)}...  ` +
            `PnL: ${formatUsd(r.total_pnl).padStart(10)}  ` +
            `Trades(range): ${r.trades_in_range.toString().padStart(4)}  ` +
            `WR: ${r.win_rate_pct.toString().padStart(5)}%`
        );
    });

    console.log(`\n✅ CSV saved to: ${outputPath}`);
    console.log(`   Unique traders: ${rows.length}`);
    console.log(`   Total trades in range: ${trades.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});
