import { Header } from '@components/Header';
import FooterSection from '@components/home/FooterSection';
import { XCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function PaymentCancel() {
    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono">
            <Header />
            <main className="max-w-3xl mx-auto px-6 py-20 text-center">
                <div className="relative mb-8 inline-block">
                    <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
                    <XCircle className="h-24 w-24 text-red-500 relative" />
                </div>

                <h1 className="text-4xl md:text-5xl font-display uppercase tracking-tight mb-4">
                    PAYMENT <span className="text-red-500">CANCELLED</span>
                </h1>

                <p className="text-[var(--text-secondary)] mb-12 max-w-lg mx-auto leading-relaxed">
                    The payment process was cancelled or interrupted. No charges were made, and no credits were added to your account.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link href="/pricing" className="flex-1 sm:flex-none">
                        <button className="w-full sm:w-64 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold tracking-widest hover:bg-[var(--accent-dim)] transition-all flex items-center justify-center gap-2 group">
                            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                            RETURN TO PRICING
                        </button>
                    </Link>
                    <Link href="/dashboard" className="flex-1 sm:flex-none">
                        <button className="w-full sm:w-64 py-4 border border-[var(--border)] text-[var(--text-primary)] font-bold tracking-widest hover:bg-[var(--bg-elevated)] transition-all">
                            GO TO DASHBOARD
                        </button>
                    </Link>
                </div>
            </main>
            <FooterSection />
        </div>
    );
}
