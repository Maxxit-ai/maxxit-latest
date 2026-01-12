"use client";

import { TraderCard, Trader } from "./TraderCard";
import { Users, AlertCircle } from "lucide-react";

interface TraderListProps {
    traders: Trader[];
    isLoading: boolean;
    error: string | null;
}

function TraderSkeleton() {
    return (
        <div className="p-5 rounded-2xl animate-pulse bg-[var(--bg-surface)] border border-[var(--border)]">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)]" />
                    <div>
                        <div className="h-4 w-24 rounded mb-2 bg-[var(--bg-elevated)]" />
                        <div className="h-3 w-16 rounded bg-[var(--bg-elevated)]" />
                    </div>
                </div>
                <div className="w-16 h-14 rounded-lg bg-[var(--bg-elevated)]" />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-[var(--bg-elevated)]" />
                ))}
            </div>
            <div className="h-8 rounded-lg mb-4 bg-[var(--bg-elevated)]" />
            <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-4 rounded bg-[var(--bg-elevated)]" />
                ))}
            </div>
        </div>
    );
}

export function TraderList({ traders, isLoading, error }: TraderListProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <TraderSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]">
                <AlertCircle className="w-12 h-12 mb-4 text-[var(--danger)]" />
                <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)] font-display">
                    Failed to Load Traders
                </h3>
                <p className="text-sm text-center max-w-md text-[var(--text-muted)]">
                    {error}
                </p>
            </div>
        );
    }

    if (traders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]">
                <Users className="w-12 h-12 mb-4 text-[var(--text-muted)]" />
                <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)] font-display">
                    No Traders Found
                </h3>
                <p className="text-sm text-center max-w-md text-[var(--text-muted)]">
                    There are no top traders to display at this time.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {traders.map((trader) => (
                <TraderCard key={trader.id} trader={trader} />
            ))}
        </div>
    );
}