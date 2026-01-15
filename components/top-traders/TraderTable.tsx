"use client";

import { useState, useMemo } from "react";
import { Trader, TraderCard } from "./TraderCard";
import { ExternalLink, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import Link from "next/link";

const TRADERS_PER_PAGE = 30;

type SortColumn = "rank" | "wallet" | "pnl" | "winRate" | "trades" | "volume" | "impact" | "lastActive";
type SortDirection = "asc" | "desc";

function formatPnl(pnl: string): { formatted: string; isPositive: boolean } {
    const value = parseFloat(pnl);
    const usdValue = value / 1e6;
    const isPositive = usdValue >= 0;
    const absValue = Math.abs(usdValue);

    let formatted: string;
    if (absValue >= 1e9) {
        formatted = `${(absValue / 1e9).toFixed(2)}B`;
    } else if (absValue >= 1e6) {
        formatted = `${(absValue / 1e6).toFixed(2)}M`;
    } else if (absValue >= 1e3) {
        formatted = `${(absValue / 1e3).toFixed(2)}K`;
    } else {
        formatted = absValue.toFixed(0);
    }

    return { formatted: isPositive ? `+$${formatted}` : `-$${formatted}`, isPositive };
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
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
}

interface TraderTableProps {
    traders: Trader[];
    isLoading: boolean;
    error: string | null;
}

function TableSkeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
                <div
                    key={i}
                    className="h-14 rounded-lg animate-pulse bg-[var(--bg-elevated)]"
                />
            ))}
        </div>
    );
}

function SortIcon({ column, currentColumn, direction }: { column: SortColumn; currentColumn: SortColumn | null; direction: SortDirection }) {
    if (currentColumn !== column) {
        return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
    }
    return direction === "asc"
        ? <ChevronUp className="w-3.5 h-3.5 text-accent" />
        : <ChevronDown className="w-3.5 h-3.5 text-accent" />;
}

function SortableHeader({
    column,
    label,
    currentColumn,
    direction,
    onSort,
    align = "left"
}: {
    column: SortColumn;
    label: string;
    currentColumn: SortColumn | null;
    direction: SortDirection;
    onSort: (column: SortColumn) => void;
    align?: "left" | "right";
}) {
    return (
        <th
            onClick={() => onSort(column)}
            className={`px-4 py-3 text-${align} text-xs font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors hover:bg-opacity-80 ${currentColumn === column ? 'text-accent' : 'text-[var(--text-muted)]'
                }`}
        >
            <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
                <span>{label}</span>
                <SortIcon column={column} currentColumn={currentColumn} direction={direction} />
            </div>
        </th>
    );
}

function Pagination({
    currentPage,
    totalPages,
    onPageChange,
}: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}) {
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const delta = 2;

        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === totalPages ||
                (i >= currentPage - delta && i <= currentPage + delta)
            ) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== "...") {
                pages.push("...");
            }
        }

        return pages;
    };

    return (
        <div className="flex items-center justify-center gap-1 sm:gap-2 mt-6">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 sm:p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] hover-lift"
            >
                <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>

            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto max-w-[200px] sm:max-w-none">
                {getPageNumbers().map((page, idx) =>
                    typeof page === "number" ? (
                        <button
                            key={idx}
                            onClick={() => onPageChange(page)}
                            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all border whitespace-nowrap ${page === currentPage
                                    ? 'bg-accent text-[var(--bg-deep)] border-accent'
                                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border)] hover-lift'
                                }`}
                        >
                            {page}
                        </button>
                    ) : (
                        <span key={idx} className="px-1 sm:px-2 text-[var(--text-muted)] text-xs sm:text-sm">
                            {page}
                        </span>
                    )
                )}
            </div>

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 sm:p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] hover-lift"
            >
                <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
        </div>
    );
}

export function TraderTable({ traders, isLoading, error }: TraderTableProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(column);
            setSortDirection("desc");
        }
        setCurrentPage(1); // Reset to first page on sort
    };

    const sortedTraders = useMemo(() => {
        if (!sortColumn) return traders;

        return [...traders].sort((a, b) => {
            let aValue: number;
            let bValue: number;

            switch (sortColumn) {
                case "rank":
                    aValue = a.rank;
                    bValue = b.rank;
                    break;
                case "wallet":
                    return sortDirection === "asc"
                        ? a.walletAddress.localeCompare(b.walletAddress)
                        : b.walletAddress.localeCompare(a.walletAddress);
                case "pnl":
                    aValue = parseFloat(a.totalPnl);
                    bValue = parseFloat(b.totalPnl);
                    break;
                case "winRate":
                    aValue = a.totalTrades > 0 ? a.totalProfitTrades / a.totalTrades : 0;
                    bValue = b.totalTrades > 0 ? b.totalProfitTrades / b.totalTrades : 0;
                    break;
                case "trades":
                    aValue = a.totalTrades;
                    bValue = b.totalTrades;
                    break;
                case "volume":
                    aValue = parseFloat(a.totalVolume);
                    bValue = parseFloat(b.totalVolume);
                    break;
                case "impact":
                    aValue = a.impactFactor;
                    bValue = b.impactFactor;
                    break;
                case "lastActive":
                    aValue = new Date(a.lastActiveAt).getTime();
                    bValue = new Date(b.lastActiveAt).getTime();
                    break;
                default:
                    return 0;
            }

            return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        });
    }, [traders, sortColumn, sortDirection]);

    const totalPages = Math.ceil(sortedTraders.length / TRADERS_PER_PAGE);
    const startIndex = (currentPage - 1) * TRADERS_PER_PAGE;
    const paginatedTraders = sortedTraders.slice(startIndex, startIndex + TRADERS_PER_PAGE);

    if (isLoading) {
        return (
            <div className="rounded-xl overflow-hidden bg-[var(--bg-surface)] border border-[var(--border)]">
                <div className="p-4">
                    <TableSkeleton />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                <p className="text-lg text-[var(--text-primary)]">Failed to load traders</p>
                <p className="text-sm text-[var(--text-muted)]">{error}</p>
            </div>
        );
    }

    if (traders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                <p className="text-lg text-[var(--text-primary)]">No traders found</p>
            </div>
        );
    }

    return (
        <div>
            <div className="rounded-xl overflow-hidden bg-[var(--bg-surface)] border border-[var(--border)]">
                {/* Unified Scrollable Table for All Screen Sizes */}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                        <thead>
                            <tr className="bg-[var(--bg-elevated)]">
                                <SortableHeader column="rank" label="Rank" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader column="wallet" label="Wallet" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                                <SortableHeader column="pnl" label="PnL" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader column="winRate" label="Win Rate" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader column="trades" label="Trades" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader column="volume" label="Volume" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader column="impact" label="Impact" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} align="right" />
                                <SortableHeader column="lastActive" label="Last Active" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} align="right" />
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedTraders.map((trader) => {
                                const { formatted: pnlFormatted, isPositive } = formatPnl(trader.totalPnl);
                                const winRate = trader.totalTrades > 0
                                    ? ((trader.totalProfitTrades / trader.totalTrades) * 100).toFixed(1)
                                    : "0";
                                const truncatedAddress = `${trader.walletAddress.slice(0, 6)}...${trader.walletAddress.slice(-4)}`;

                                return (
                                    <tr
                                        key={trader.id}
                                        className="transition-colors border-t border-[var(--border)] hover:bg-[var(--bg-elevated)]"
                                    >
                                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                                            <div
                                                className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm font-display ${trader.rank <= 3
                                                        ? 'bg-gradient-to-br from-green-700 to-green-600 text-[var(--bg-deep)]'
                                                        : 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                                                    }`}
                                            >
                                                {trader.rank}
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                                            <Link
                                                href={`https://arbiscan.io/address/${trader.walletAddress}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 sm:gap-1.5 group"
                                            >
                                                <span className="font-mono text-xs sm:text-sm group-hover:underline text-[var(--text-primary)] glitch-hover">
                                                    {truncatedAddress}
                                                </span>
                                                <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-50 group-hover:opacity-100 transition-opacity text-accent" />
                                            </Link>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {isPositive ? (
                                                    <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent" />
                                                ) : (
                                                    <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[var(--danger)]" />
                                                )}
                                                <span
                                                    className={`text-xs sm:text-sm font-semibold font-display ${isPositive ? 'text-accent' : 'text-[var(--danger)]'
                                                        }`}
                                                >
                                                    {pnlFormatted}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                            <span className="text-xs sm:text-sm text-[var(--text-primary)]">
                                                {winRate}%
                                            </span>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs sm:text-sm text-[var(--text-primary)]">
                                                    {trader.totalTrades}
                                                </span>
                                                <span className="text-[10px] sm:text-xs text-[var(--text-muted)] whitespace-nowrap">
                                                    {trader.totalProfitTrades}W/{trader.totalLossTrades}L
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                            <span className="text-xs sm:text-sm text-[var(--text-primary)]">
                                                {formatVolume(trader.totalVolume)}
                                            </span>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                            <span className="text-xs sm:text-sm font-bold text-accent font-display">
                                                {trader.impactFactor.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[var(--text-muted)]" />
                                                <span className="text-[10px] sm:text-xs text-[var(--text-muted)] whitespace-nowrap">
                                                    {getRelativeTime(trader.lastActiveAt)}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
                <p className="text-xs sm:text-sm text-[var(--text-muted)] text-center sm:text-left">
                    Showing {startIndex + 1}-{Math.min(startIndex + TRADERS_PER_PAGE, sortedTraders.length)} of {sortedTraders.length} traders
                </p>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>
        </div>
    );
}