"use client";

import { useState } from "react";
import { ExternalLink, TrendingUp, TrendingDown, Activity, Award, Target, Flame, Clock } from "lucide-react";
import Link from "next/link";

export interface Trader {
    id: string;
    rank: number;
    walletAddress: string;
    totalVolume: string;
    totalClosedVolume: string;
    totalPnl: string;
    totalProfitTrades: number;
    totalLossTrades: number;
    totalTrades: number;
    lastActiveAt: string;
    edgeScore: number;
    consistencyScore: number;
    stakeScore: number;
    freshnessScore: number;
    impactFactor: number;
}

function formatPnl(pnl: string): { formatted: string; isPositive: boolean } {
    const value = parseFloat(pnl);
    // Convert from raw units (assuming 6 decimals for USDC-like values)
    const usdValue = value / 1e6;
    const isPositive = usdValue >= 0;
    const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.abs(usdValue));
    return { formatted: isPositive ? `+${formatted}` : `-${formatted}`, isPositive };
}

function formatVolume(volume: string): string {
    const value = parseFloat(volume) / 1e6;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
}

function getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}

function ScoreBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
    const percentage = Math.min(value * 100, 100);

    return (
        <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                        {label}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-primary)]">
                        {(value * 100).toFixed(0)}%
                    </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden bg-[var(--bg-elevated)]">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                            width: `${percentage}%`,
                            background: `linear-gradient(90deg, var(--accent), #FFC371)`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export function TraderCard({ trader }: { trader: Trader }) {
    const [hovered, setHovered] = useState(false);
    const { formatted: pnlFormatted, isPositive: isPnlPositive } = formatPnl(trader.totalPnl);
    const winRate = trader.totalTrades > 0
        ? ((trader.totalProfitTrades / trader.totalTrades) * 100).toFixed(1)
        : "0";
    const truncatedAddress = `${trader.walletAddress.slice(0, 6)}...${trader.walletAddress.slice(-4)}`;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`p-5 rounded-2xl transition-all duration-200 border-box ${hovered ? 'hover-lift' : ''}`}
            style={{
                background: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: `1px solid ${hovered ? 'var(--accent)' : 'var(--border)'}`,
                boxShadow: hovered
                    ? "0 25px 60px rgba(0, 255, 136, 0.1)"
                    : "0 1px 0 rgba(255,255,255,0.03)",
            }}
        >
            {/* Header Row */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg font-display ${trader.rank <= 3
                                ? 'bg-gradient-to-br from-green-700 to-green-600 text-[var(--bg-deep)]'
                                : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)]'
                            }`}
                    >
                        {trader.rank}
                    </div>
                    <div>
                        <Link
                            href={`https://arbiscan.io/address/${trader.walletAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 group"
                        >
                            <span className="font-mono text-sm font-medium group-hover:underline text-[var(--text-primary)] glitch-hover">
                                {truncatedAddress}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity text-accent" />
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                            <span className="text-xs text-[var(--text-muted)]">
                                {getRelativeTime(trader.lastActiveAt)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Impact Factor Badge */}
                <div className="px-3 py-1.5 rounded-lg bg-[var(--accent-glow)] border border-[var(--accent)]">
                    <div className="text-[10px] uppercase tracking-wide mb-0.5 text-[var(--text-muted)]">
                        Impact
                    </div>
                    <div className="text-lg font-bold text-accent font-display">
                        {trader.impactFactor.toFixed(1)}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                {/* PnL */}
                <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                    <div className="flex items-center gap-1 mb-1">
                        {isPnlPositive ? (
                            <TrendingUp className="w-3 h-3 text-accent" />
                        ) : (
                            <TrendingDown className="w-3 h-3 text-[var(--danger)]" />
                        )}
                        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            PnL
                        </span>
                    </div>
                    <div
                        className={`text-sm font-bold font-display ${isPnlPositive ? 'text-accent' : 'text-[var(--danger)]'
                            }`}
                    >
                        {pnlFormatted}
                    </div>
                </div>

                {/* Win Rate */}
                <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                    <div className="text-[10px] uppercase tracking-wide mb-1 text-[var(--text-muted)]">
                        Win Rate
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)] font-display">
                        {winRate}%
                    </div>
                </div>

                {/* Trades */}
                <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                    <div className="text-[10px] uppercase tracking-wide mb-1 text-[var(--text-muted)]">
                        Trades
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-[var(--text-primary)] font-display">
                            {trader.totalTrades}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                            ({trader.totalProfitTrades}W / {trader.totalLossTrades}L)
                        </span>
                    </div>
                </div>
            </div>

            {/* Volume */}
            <div className="flex items-center justify-between mb-4 py-2 px-3 rounded-lg bg-[var(--bg-elevated)]">
                <span className="text-xs text-[var(--text-muted)]">Total Volume</span>
                <span className="text-sm font-semibold text-[var(--text-primary)] font-display">
                    {formatVolume(trader.totalVolume)}
                </span>
            </div>

            {/* Score Breakdown */}
            <div className="space-y-2.5">
                <div className="text-[10px] uppercase tracking-wide mb-2 text-[var(--text-muted)]">
                    Score Breakdown
                </div>
                <ScoreBar label="Edge" value={trader.edgeScore} icon={Target} />
                <ScoreBar label="Consistency" value={trader.consistencyScore} icon={Activity} />
                <ScoreBar label="Stake" value={trader.stakeScore} icon={Award} />
                <ScoreBar label="Freshness" value={trader.freshnessScore} icon={Flame} />
            </div>
        </div>
    );
}