import { Header } from '@components/Header';
import FooterSection from '@components/home/FooterSection';
import { CheckCircle2, ArrowRight, CreditCard, History } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export default function PaymentSuccess() {
    const router = useRouter();
    const { authenticated, user } = usePrivy();
    const [balance, setBalance] = useState<string | null>(null);

    useEffect(() => {
        if (authenticated && user?.wallet?.address) {
            fetchBalance();
        }
    }, [authenticated, user?.wallet?.address]);

    const fetchBalance = async () => {
        try {
            const res = await fetch(`/api/user/credits/balance?wallet=${user?.wallet?.address}`);
            const data = await res.json();
            if (data.balance) setBalance(data.balance);
        } catch (e) {
            console.error('Failed to fetch balance:', e);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono">
            <Header />
            <main className="max-w-3xl mx-auto px-6 py-20 text-center">
                <div className="relative mb-8 inline-block">
                    <div className="absolute inset-0 bg-[var(--accent)]/20 blur-2xl rounded-full" />
                    <CheckCircle2 className="h-24 w-24 text-[var(--accent)] relative" />
                </div>

                <h1 className="text-4xl md:text-5xl font-display uppercase tracking-tight mb-4">
                    PAYMENT <span className="text-[var(--accent)]">SUCCESSFUL</span>
                </h1>

                <p className="text-[var(--text-secondary)] mb-12 max-w-lg mx-auto leading-relaxed">
                    Your credits have been successfully minted and added to your account.
                    You can now use them to unlock signals and deploy agents.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                    <div className="p-6 border border-[var(--border)] bg-[var(--bg-surface)] text-left group hover:border-[var(--accent)] transition-colors">
                        <CreditCard className="h-6 w-6 text-[var(--accent)] mb-4" />
                        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mb-1">New Balance</p>
                        <p className="text-3xl font-display">{balance ? `${balance}` : 'Updating...'}</p>
                    </div>
                    <div className="p-6 border border-[var(--border)] bg-[var(--bg-surface)] text-left group hover:border-[var(--accent)] transition-colors">
                        <History className="h-6 w-6 text-[var(--accent)] mb-4" />
                        <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mb-1">Transaction</p>
                        <p className="text-sm font-bold uppercase truncate">Verified on-chain</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link href="/dashboard" className="flex-1 sm:flex-none">
                        <button className="w-full sm:w-64 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold tracking-widest hover:bg-[var(--accent-dim)] transition-all flex items-center justify-center gap-2 group">
                            GO TO DASHBOARD
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </Link>
                    <Link href="/credit-history" className="flex-1 sm:flex-none">
                        <button className="w-full sm:w-64 py-4 border border-[var(--border)] text-[var(--text-primary)] font-bold tracking-widest hover:bg-[var(--bg-elevated)] transition-all">
                            VIEW HISTORY
                        </button>
                    </Link>
                </div>
            </main>
            <FooterSection />
        </div>
    );
}
