#!/usr/bin/env npx ts-node
/**
 * Fetch ALL Ostium Traders → CSV
 *
 * Queries Ostium's production subgraph, paginates through every user,
 * sorts them by total PnL (descending), and writes to a CSV file.
 *
 * Impact-factor columns are intentionally excluded.
 *
 * Usage:
 *   npx ts-node scripts/fetch-ostium-traders.ts
 *   npx ts-node scripts/fetch-ostium-traders.ts --output my-traders.csv
 */

import * as fs from "fs";
import * as path from "path";

const SUBGRAPH_URL =
    "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

const PAGE_SIZE = 1000; // max allowed by The Graph

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubgraphUser {
    id: string; // wallet address
    totalVolume: string;
    totalOpenVolume: string;
    totalClosedVolume: string;
    totalPnL: string;
    totalProfitTrades: string;
    totalLossTrades: string;
}

interface TraderRow {
    wallet_address: string;
    total_pnl_usd: number;
    total_volume_usd: number;
    total_closed_volume_usd: number;
    total_open_volume_usd: number;
    total_profit_trades: number;
    total_loss_trades: number;
    total_trades: number;
    win_rate_pct: number;
    roi_pct: number;
}

// ── Subgraph fetch with pagination ─────────────────────────────────────────────

async function fetchAllUsers(): Promise<SubgraphUser[]> {
    const allUsers: SubgraphUser[] = [];
    let skip = 0;
    let hasMore = true;

    console.log("📡 Fetching traders from Ostium subgraph...");

    while (hasMore) {
        const query = `
      query GetUsers($first: Int!, $skip: Int!) {
        users(
          orderBy: totalPnL,
          orderDirection: desc,
          first: $first,
          skip: $skip
        ) {
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
            body: JSON.stringify({ query, variables: { first: PAGE_SIZE, skip } }),
        });

        if (!res.ok) {
            throw new Error(`Subgraph request failed: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as {
            data?: { users: SubgraphUser[] };
            errors?: any[];
        };

        if (json.errors) {
            throw new Error(`Subgraph errors: ${JSON.stringify(json.errors)}`);
        }

        const users = json.data?.users ?? [];
        allUsers.push(...users);

        console.log(`   fetched ${allUsers.length} traders so far (batch: ${users.length})...`);

        if (users.length < PAGE_SIZE) {
            hasMore = false;
        } else {
            skip += PAGE_SIZE;
            // small delay to be polite to the subgraph
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    console.log(`✅ Total traders fetched: ${allUsers.length}\n`);
    return allUsers;
}

// ── Transform & sort ───────────────────────────────────────────────────────────

function toTraderRows(users: SubgraphUser[]): TraderRow[] {
    return users
        .map((u) => {
            const totalVolume = Number(BigInt(u.totalVolume)) / 1e6;
            const totalClosedVolume = Number(BigInt(u.totalClosedVolume || u.totalVolume)) / 1e6;
            const totalOpenVolume = Number(BigInt(u.totalOpenVolume || "0")) / 1e6;
            const totalPnl = Number(BigInt(u.totalPnL)) / 1e6;
            const profitTrades = parseInt(u.totalProfitTrades, 10);
            const lossTrades = parseInt(u.totalLossTrades, 10);
            const totalTrades = profitTrades + lossTrades;
            const winRate = totalTrades > 0 ? (profitTrades / totalTrades) * 100 : 0;
            const roi = totalClosedVolume > 0 ? (totalPnl / totalClosedVolume) * 100 : 0;

            return {
                wallet_address: u.id,
                total_pnl_usd: totalPnl,
                total_volume_usd: totalVolume,
                total_closed_volume_usd: totalClosedVolume,
                total_open_volume_usd: totalOpenVolume,
                total_profit_trades: profitTrades,
                total_loss_trades: lossTrades,
                total_trades: totalTrades,
                win_rate_pct: parseFloat(winRate.toFixed(2)),
                roi_pct: parseFloat(roi.toFixed(4)),
            };
        })
        .sort((a, b) => b.total_pnl_usd - a.total_pnl_usd);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

/**
 * Format a USD number into human-readable form:
 *   >= 1B  → "$1.23B"
 *   >= 1M  → "$3.80M"
 *   >= 1K  → "$45.6K"
 *   else   → "$123.45"
 * Negative values get a leading minus sign.
 */
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
        "total_pnl_usd",
        "total_volume_usd",
        "total_closed_volume_usd",
        "total_open_volume_usd",
        "total_profit_trades",
        "total_loss_trades",
        "total_trades",
        "win_rate_pct",
        "roi_pct",
    ];

    const lines = [headers.join(",")];

    rows.forEach((row, idx) => {
        lines.push(
            [
                idx + 1,
                row.wallet_address,
                formatUsd(row.total_pnl_usd),
                formatUsd(row.total_volume_usd),
                formatUsd(row.total_closed_volume_usd),
                formatUsd(row.total_open_volume_usd),
                row.total_profit_trades,
                row.total_loss_trades,
                row.total_trades,
                `${row.win_rate_pct}%`,
                `${row.roi_pct}%`,
            ].join(",")
        );
    });

    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
    // Parse --output flag
    const args = process.argv.slice(2);
    const outputIdx = args.indexOf("--output");
    const outputFile =
        outputIdx !== -1 && args[outputIdx + 1]
            ? args[outputIdx + 1]
            : `ostium_traders_${new Date().toISOString().slice(0, 10)}.csv`;

    const outputPath = path.resolve(process.cwd(), outputFile);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  📥 OSTIUM ALL TRADERS → CSV");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const users = await fetchAllUsers();
    const rows = toTraderRows(users);

    writeCsv(rows, outputPath);

    // Print top 10 summary
    console.log("🏆 Top 10 by PnL:");
    console.log("─────────────────────────────────────────────────────────");
    rows.slice(0, 10).forEach((r, i) => {
        console.log(
            `  ${(i + 1).toString().padStart(2)}. ${r.wallet_address.slice(0, 10)}...  ` +
            `PnL: $${r.total_pnl_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}  ` +
            `Trades: ${r.total_trades}  WR: ${r.win_rate_pct}%`
        );
    });

    console.log(`\n✅ CSV saved to: ${outputPath}`);
    console.log(`   Total rows: ${rows.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});
