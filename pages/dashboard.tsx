import { Header } from '@components/Header';
import FooterSection from '@components/home/FooterSection';
import { usePrivy } from '@privy-io/react-auth';
import {
    TrendingUp,
    TrendingDown,
    Activity,
    Wallet,
    Zap,
    Shield,
    History,
    ArrowUpRight,
    LayoutDashboard,
    CreditCard,
    Plus,
    ChevronRight,
    Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Trade {
    id: string;
    tokenSymbol: string;
    side: string;
    status: string;
    entryPrice: string;
    currentPrice: string | null;
    unrealizedPnl: string | null;
    unrealizedPnlPercent: string | null;
    openedAt: string;
    agentName: string;
}

interface Deployment {
    id: string;
    agentId: string;
    agent: {
        name: string;
        venue: string;
    };
    status: string;
    sub_started_at?: string;
}

interface DashboardCache {
    trades: Trade[];
    deployments: Deployment[];
    summary: {
        totalTrades: number;
        openPositions: number;
        totalUnrealizedPnl: number;
        totalUnrealizedPnlPercent: number;
    };
    balance: { usdc: string; eth: string; credits: string } | null;
    timestamp: number;
    wallet: string;
}

// Global cache variable to persist data across client-side route changes
let globalDashboardCache: DashboardCache | null = null;
const CACHE_TTL = 60000; // 60 seconds cache duration

export default function Dashboard() {
    const { authenticated, user, login } = usePrivy();
    const [loading, setLoading] = useState(true);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [deployments, setDeployments] = useState<Deployment[]>([]);
    const [summary, setSummary] = useState({
        totalTrades: 0,
        openPositions: 0,
        totalUnrealizedPnl: 0,
        totalUnrealizedPnlPercent: 0
    });
    const [balance, setBalance] = useState<{ usdc: string; eth: string; credits: string } | null>(null);
    const [tradeQuota, setTradeQuota] = useState<{ trades_total: number; trades_used: number; remaining: number } | null>(null);

    useEffect(() => {
        if (authenticated && user?.wallet?.address) {
            // Check if we have valid cached data for this specific wallet
            const isCacheFresh = globalDashboardCache &&
                globalDashboardCache.wallet === user.wallet.address &&
                (Date.now() - globalDashboardCache.timestamp < CACHE_TTL);

            if (isCacheFresh && globalDashboardCache) {
                console.log("[Dashboard] Using fresh cached data");
                setTrades(globalDashboardCache.trades);
                setDeployments(globalDashboardCache.deployments);
                setSummary(globalDashboardCache.summary);
                setBalance(globalDashboardCache.balance);
                setLoading(false);
            } else {
                fetchDashboardData();
            }
        } else {
            setLoading(false);
        }
    }, [authenticated, user?.wallet?.address]);

    const fetchDashboardData = async () => {
        if (!user?.wallet?.address) return;

        // Only show loading if we have no data
        if (!trades.length && !deployments.length) {
            setLoading(true);
        }

        try {
            // Fetch Trades, Deployments, Credits, and Trade Quota in parallel
            const [tradesRes, deploymentsRes, creditsRes, quotaRes] = await Promise.all([
                fetch(`/api/trades/my-trades?userWallet=${user.wallet.address}&page=1&pageSize=5`),
                fetch(`/api/deployments?userWallet=${user.wallet.address}`),
                fetch(`/api/user/credits/balance?wallet=${user.wallet.address}`),
                fetch(`/api/user/trades/quota?wallet=${user.wallet.address}`),
            ]);

            const [tradesData, deploymentsData, creditsData, quotaData] = await Promise.all([
                tradesRes.json(),
                deploymentsRes.json(),
                creditsRes.json(),
                quotaRes.json(),
            ]);

            // Fetch Portfolio Balance
            let currentBalance = { usdc: '0', eth: '0' };
            try {
                const balanceRes = await fetch('/api/ostium/balance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: user.wallet.address })
                });
                if (balanceRes.ok) {
                    const balanceData = await balanceRes.json();
                    currentBalance = { usdc: balanceData.usdcBalance || '0', eth: balanceData.ethBalance || '0' };
                }
            } catch (e) {
                console.error("Failed to fetch balance:", e);
            }

            const finalBalance = {
                ...currentBalance,
                credits: creditsData.balance || '0'
            };

            const currentSummary = {
                totalTrades: tradesData.summary?.total || 0,
                openPositions: tradesData.summary?.open || 0,
                totalUnrealizedPnl: 0,
                totalUnrealizedPnlPercent: 0
            };

            if (tradesData.summary) {
                let totalPnl = 0;
                let count = 0;
                (tradesData.trades || []).forEach((t: Trade) => { // Use tradesData.trades here
                    if (t.status === 'OPEN' && t.unrealizedPnl) {
                        totalPnl += parseFloat(t.unrealizedPnl);
                        count++;
                    }
                });
                // Note: user specifically requested to keep these at 0 in previous edit, 
                // but for completeness of logic I'll respect the visual choice if they want to.
                // Re-applying the user's manual change from Step 154:
                currentSummary.totalUnrealizedPnl = 0;
                currentSummary.totalUnrealizedPnlPercent = 0;
            }

            setTrades(tradesData.trades || []);
            setDeployments(Array.isArray(deploymentsData) ? deploymentsData : (deploymentsData.deployments || []));
            setSummary(currentSummary); // Use the calculated currentSummary
            setBalance(finalBalance);
            setTradeQuota(quotaData);

            // Update cache
            globalDashboardCache = {
                trades: tradesData.trades || [],
                deployments: Array.isArray(deploymentsData) ? deploymentsData : (deploymentsData.deployments || []),
                summary: currentSummary, // Use the calculated currentSummary
                balance: finalBalance,
                timestamp: Date.now(),
                wallet: user.wallet.address
            };

        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (isoDate: string) => {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    if (!authenticated && !loading) {
        return (
            <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono">
                <Header />
                <main className="max-w-7xl mx-auto px-6 py-20 text-center">
                    <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-16 max-w-2xl mx-auto">
                        <LayoutDashboard className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-6" />
                        <h1 className="text-2xl font-display mb-4">ACCESS RESTRICTED</h1>
                        <p className="text-[var(--text-secondary)] mb-8">Please connect your wallet to view your personalized trading dashboard and portfolio analytics.</p>
                        <button
                            onClick={login}
                            className="px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                        >
                            CONNECT WALLET
                        </button>
                    </div>
                </main>
                <FooterSection />
            </div>
        );
    }

    const stats = [
        {
            label: "TOTAL PORTFOLIO",
            value: balance ? `$${(parseFloat(balance.usdc)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$ --",
            change: balance?.eth ? `${balance.eth} ETH` : "-- %",
            positive: true,
            icon: Wallet
        },
        {
            label: "ACTIVE AGENTS",
            value: deployments.length.toString(),
            change: "Running",
            positive: true,
            icon: Activity
        },
        {
            label: "CREDIT BALANCE",
            value: balance ? balance.credits.toLocaleString() : "--",
            change: "Buy more",
            positive: true,
            icon: CreditCard
        },
        {
            label: "24H PNL",
            value: summary.totalUnrealizedPnl !== 0
                ? `${summary.totalUnrealizedPnl >= 0 ? '+$' : '-$'}${Math.abs(summary.totalUnrealizedPnl).toFixed(2)}`
                : "$ --",
            change: summary.totalUnrealizedPnl !== 0 ? `${summary.totalUnrealizedPnl >= 0 ? '+' : ''}${summary.totalUnrealizedPnlPercent.toFixed(2)}%` : "-- %",
            positive: summary.totalUnrealizedPnl >= 0,
            icon: TrendingUp
        },
    ];

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono">
            <Header />

            <main className="max-w-7xl mx-auto px-6 py-12">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
                    <div>
                        <p className="data-label mb-2">PORTFOLIO OVERVIEW</p>
                        <h1 className="text-3xl md:text-4xl font-display flex items-center gap-3">
                            COMMAND CENTER <span className="text-[var(--accent)] text-xs border border-[var(--accent)] px-2 py-1 animate-pulse">LIVE</span>
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <Link href="/pricing">
                            <button className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] hover:border-[var(--accent)] transition-colors text-sm font-bold">
                                <Plus className="h-4 w-4" /> BUY CREDITS
                            </button>
                        </Link>
                        <Link href="/creator">
                            <button className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] hover:bg-[var(--accent-dim)] transition-colors text-sm font-bold">
                                <Zap className="h-4 w-4" /> DEPLOY AGENT
                            </button>
                        </Link>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    {stats.map((stat, i) => (
                        <div key={i} className="border-box p-6 bg-[var(--bg-surface)] hover:border-[var(--accent)]/50 transition-colors group relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 border border-[var(--border)] group-hover:border-[var(--accent)]/30">
                                    <stat.icon className="h-5 w-5 text-[var(--accent)]" />
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 ${stat.positive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {stat.change}
                                </span>
                            </div>
                            <p className="data-label mb-1">{stat.label}</p>
                            <p className="text-2xl font-display">{stat.value}</p>

                            {stat.label === "CREDIT BALANCE" && (
                                <Link href="/credit-history" className="absolute bottom-0 right-0 p-2 text-[10px] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] transition-all font-bold">
                                    VIEW HISTORY
                                </Link>
                            )}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content Area - Activity */}
                    <div className="lg:col-span-2 space-y-8">
                        <section className="border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden h-full">
                            <div className="border-b border-[var(--border)] p-4 flex justify-between items-center bg-[var(--bg-deep)]/50">
                                <h2 className="text-sm font-bold flex items-center gap-2">
                                    <History className="h-4 w-4 text-[var(--accent)]" /> RECENT ACTIVITY
                                </h2>
                                <Link href="/my-trades" className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] flex items-center gap-1 transition-colors">
                                    VIEW ALL <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-tighter">
                                        <tr>
                                            <th className="p-4 font-normal">AGENT</th>
                                            <th className="p-4 font-normal">ASSET</th>
                                            <th className="p-4 font-normal">SIDE</th>
                                            <th className="p-4 font-normal">PRICE</th>
                                            <th className="p-4 font-normal">TIME</th>
                                            <th className="p-4 font-normal text-right">STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]/50">
                                        {loading ? (
                                            [1, 2, 3, 4, 5].map((idx) => (
                                                <tr key={idx} className="animate-pulse">
                                                    <td className="p-4"><div className="h-4 w-20 bg-[var(--bg-elevated)]" /></td>
                                                    <td className="p-4"><div className="h-4 w-24 bg-[var(--bg-elevated)]" /></td>
                                                    <td className="p-4"><div className="h-4 w-12 bg-[var(--bg-elevated)]" /></td>
                                                    <td className="p-4"><div className="h-4 w-16 bg-[var(--bg-elevated)]" /></td>
                                                    <td className="p-4"><div className="h-4 w-16 bg-[var(--bg-elevated)]" /></td>
                                                    <td className="p-4 flex justify-end"><div className="h-4 w-16 bg-[var(--bg-elevated)]" /></td>
                                                </tr>
                                            ))
                                        ) : trades.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-12 text-center text-[var(--text-muted)]">
                                                    NO RECENT ACTIVITY FOUND
                                                </td>
                                            </tr>
                                        ) : (
                                            trades.map((trade) => (
                                                <tr key={trade.id} className="hover:bg-[var(--bg-elevated)]/30 transition-colors">
                                                    <td className="p-4 font-bold">{trade.agentName}</td>
                                                    <td className="p-4 text-[var(--text-secondary)]">{trade.tokenSymbol}</td>
                                                    <td className="p-4">
                                                        <span className={trade.side === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                                                            {trade.side}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 font-mono">${trade.entryPrice}</td>
                                                    <td className="p-4 text-[var(--text-muted)]">{formatDate(trade.openedAt)}</td>
                                                    <td className="p-4 text-right leading-none">
                                                        <span className={`text-[10px] border px-1.5 py-0.5 ${trade.status === 'OPEN' ? 'border-green-500/30 text-green-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                                                            {trade.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    {/* Sidebar - Quick Info */}
                    <div className="space-y-6">
                        <section className="border border-[var(--border)] bg-[var(--bg-surface)] p-6">
                            <h3 className="data-label mb-4">TRADE USAGE</h3>
                            <div className="flex items-end gap-2 mb-2">
                                <span className="text-2xl font-display text-[var(--accent)]">
                                    {tradeQuota ? `${tradeQuota.trades_used} / ${tradeQuota.trades_total}` : '-- / --'}
                                </span>
                                <span className="text-[var(--text-muted)] text-[10px] mb-1">USED</span>
                            </div>
                            <div className="h-2 bg-[var(--bg-deep)] border border-[var(--border)] overflow-hidden mb-6">
                                <div
                                    className="h-full bg-[var(--accent)] transition-all duration-500"
                                    style={{ width: tradeQuota && tradeQuota.trades_total > 0 ? `${(tradeQuota.trades_used / tradeQuota.trades_total) * 100}%` : '0%' }}
                                />
                            </div>
                            <Link href="/pricing">
                                <button className="w-full py-3 bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors text-[10px] font-bold tracking-widest uppercase">
                                    BUY MORE TRADES
                                </button>
                            </Link>
                        </section>

                        <section className="border border-[var(--border)] bg-[var(--bg-surface)] p-6 relative overflow-hidden">
                            <div className="relative z-10">
                                <h3 className="data-label mb-4">ACTIVE CLUBS</h3>
                                <div className="space-y-4">
                                    {loading ? (
                                        [1, 2, 3].map((idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-[var(--bg-deep)] border border-[var(--border)] animate-pulse">
                                                <div className="h-8 w-32 bg-[var(--bg-elevated)]" />
                                                <div className="h-4 w-12 bg-[var(--bg-elevated)]" />
                                            </div>
                                        ))
                                    ) : deployments.length === 0 ? (
                                        <div className="p-4 text-center border border-dashed border-[var(--border)] text-[var(--text-muted)] text-xs">
                                            NO ACTIVE CLUBS
                                        </div>
                                    ) : (
                                        deployments.slice(0, 5).map((deployment) => (
                                            <div key={deployment.id} className="flex items-center justify-between p-3 bg-[var(--bg-deep)] border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors cursor-pointer group">
                                                <div>
                                                    <p className="text-sm font-bold group-hover:text-[var(--accent)] transition-colors">{deployment.agent.name}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase font-mono">
                                                        {deployment.agent.venue} · {deployment.status}
                                                    </p>
                                                </div>
                                                <Activity className={`h-4 w-4 ${deployment.status === 'ACTIVE' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                                            </div>
                                        ))
                                    )}
                                </div>
                                <Link href="/my-deployments">
                                    <button className="w-full mt-6 py-3 border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] hover:border-[var(--accent)] transition-all text-[10px] font-bold tracking-widest uppercase">
                                        MANAGE ALL SUBSCRIPTIONS
                                    </button>
                                </Link>
                            </div>
                            <div className="absolute -bottom-8 -right-8 opacity-5 pointer-events-none">
                                <Shield className="h-32 w-32" />
                            </div>
                        </section>


                    </div>
                </div>
            </main>

            <FooterSection />
        </div>
    );
}
