import { Header } from '@components/Header';
import FooterSection from '@components/home/FooterSection';
import { usePrivy } from '@privy-io/react-auth';
import {
    ArrowLeft,
    Download,
    CreditCard,
    ArrowUpRight,
    ArrowDownLeft,
    Search,
    ChevronLeft,
    ChevronRight,
    Plus,
    Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function CreditHistory() {
    const { authenticated, user } = usePrivy();
    const [filter, setFilter] = useState('ALL');
    const [history, setHistory] = useState<any[]>([]);
    const [balance, setBalance] = useState<string>('0');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ bought: '0', used: '0' });

    useEffect(() => {
        if (authenticated && user?.wallet?.address) {
            fetchData();
        } else if (!authenticated) {
            setLoading(false);
        }
    }, [authenticated, user?.wallet?.address]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const wallet = user?.wallet?.address;
            const [historyRes, balanceRes] = await Promise.all([
                fetch(`/api/user/credits/history?wallet=${wallet}`),
                fetch(`/api/user/credits/balance?wallet=${wallet}`)
            ]);

            const historyData = await historyRes.json();
            const balanceData = await balanceRes.json();

            const ledgerHistory = historyData.history || [];
            setHistory(ledgerHistory);
            setBalance(balanceData.balance || '0');

            // Calculate stats from history
            let bought = 0;
            let used = 0;
            ledgerHistory.forEach((entry: any) => {
                const amountVal = parseFloat(entry.amount);
                const amount = isNaN(amountVal) ? 0 : amountVal;

                if (amount > 0) bought += amount;
                else used += Math.abs(amount);
            });
            setStats({ bought: bought.toString(), used: used.toString() });

        } catch (e) {
            console.error('Failed to fetch credit history:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono">
            <Header />

            <main className="max-w-7xl mx-auto px-6 py-12">
                {/* Breadcrumbs & Actions */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                    <div className="space-y-2">
                        <Link href="/dashboard" className="inline-flex items-center gap-2 text-[var(--accent)] text-xs font-bold hover:gap-3 transition-all">
                            <ArrowLeft className="h-4 w-4" /> BACK TO DASHBOARD
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-display uppercase tracking-tight flex items-center gap-3">
                            CREDIT <span className="text-[var(--accent)]">HISTORY</span>
                        </h1>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 border border-[var(--border)] hover:border-[var(--accent)] transition-colors text-xs font-bold">
                            <Download className="h-4 w-4" /> EXPORT CSV
                        </button>
                        <Link href="/pricing" className="flex-1 md:flex-none">
                            <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent)] text-[var(--bg-deep)] hover:bg-[var(--accent-dim)] transition-colors text-xs font-bold">
                                <Plus className="h-4 w-4" /> TOP UP
                            </button>
                        </Link>
                    </div>
                </div>

                {/* Overview Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-6 relative overflow-hidden group">
                        <p className="data-label mb-1">TOTAL CREDITS BOUGHT</p>
                        <p className="text-3xl font-display">{parseFloat(stats.bought).toLocaleString()}</p>
                        <ArrowUpRight className="absolute top-4 right-4 h-5 w-5 text-green-400 opacity-20 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-6 relative overflow-hidden group">
                        <p className="data-label mb-1">TOTAL CREDITS USED</p>
                        <p className="text-3xl font-display">{parseFloat(stats.used).toLocaleString()}</p>
                        <ArrowDownLeft className="absolute top-4 right-4 h-5 w-5 text-red-400 opacity-20 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-6 relative overflow-hidden group border-b-2 border-b-[var(--accent)]">
                        <p className="data-label mb-1">CURRENT BALANCE</p>
                        <p className="text-3xl font-display text-[var(--accent)]">{parseFloat(balance).toLocaleString()}</p>
                        <CreditCard className="absolute top-4 right-4 h-5 w-5 text-[var(--accent)] opacity-20 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                {/* History Table Container */}
                <div className="border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden min-h-[400px]">
                    {/* Table Filters */}
                    <div className="border-b border-[var(--border)] p-4 bg-[var(--bg-deep)]/50 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex gap-2 w-full md:w-auto">
                            {['ALL', 'PURCHASE', 'USAGE'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-1.5 text-[10px] font-bold tracking-widest border transition-all ${filter === f
                                        ? 'bg-[var(--accent)] text-[var(--bg-deep)] border-[var(--accent)]'
                                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)]'
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="SEARCH TRANSACTIONS..."
                                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] pl-10 pr-4 py-2 text-[10px] focus:outline-none focus:border-[var(--accent)] transition-colors"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader2 className="h-8 w-8 text-[var(--accent)] animate-spin" />
                                <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">FETCHING LEDGER DATA...</p>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <p className="text-xs font-bold tracking-widest text-[var(--text-muted)] uppercase">NO TRANSACTIONS FOUND</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-[var(--border)] text-[var(--text-muted)] uppercase tracking-tighter">
                                    <tr>
                                        <th className="p-4 font-normal">TRANSACTION ID</th>
                                        <th className="p-4 font-normal">DATE</th>
                                        <th className="p-4 font-normal">PURPOSE</th>
                                        <th className="p-4 font-normal">TYPE</th>
                                        <th className="p-4 font-normal text-right">AMOUNT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]/50">
                                    {history
                                        .filter(item => {
                                            if (filter === 'ALL') return true;
                                            if (filter === 'PURCHASE') return parseFloat(item.amount) > 0;
                                            if (filter === 'USAGE') return parseFloat(item.amount) < 0;
                                            return true;
                                        })
                                        .map((item, i) => {
                                            const amount = parseFloat(item.amount);
                                            return (
                                                <tr key={i} className="hover:bg-[var(--bg-elevated)]/30 transition-colors group">
                                                    <td className="p-4 font-mono text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors text-[10px]">{item.reference_id ? item.reference_id.slice(0, 16) + '...' : item.id.slice(0, 8)}</td>
                                                    <td className="p-4 text-[var(--text-secondary)]">{new Date(item.created_at).toLocaleDateString()}</td>
                                                    <td className="p-4">
                                                        <span className="font-bold">{item.purpose}</span>
                                                    </td>
                                                    <td className="p-4 text-[var(--text-muted)] uppercase text-[10px] tracking-wider">{item.entry_type}</td>
                                                    <td className={`p-4 text-right font-display text-base ${amount > 0 ? 'text-green-400' : 'text-[var(--text-primary)]'}`}>
                                                        {isNaN(amount) ? '0' : (amount > 0 ? `+${amount.toLocaleString()}` : amount.toLocaleString())}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    <div className="border-t border-[var(--border)] p-4 flex justify-between items-center text-[10px] font-bold text-[var(--text-muted)]">
                        <span>SHOWING {history.length} TRANSACTIONS</span>
                        <div className="flex gap-2">
                            <button className="p-2 border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 transition-colors" disabled>
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button className="p-2 border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 transition-colors" disabled>
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <FooterSection />
        </div>
    );
}
