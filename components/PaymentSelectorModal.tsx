import React from 'react';
import { X, CreditCard, Wallet, Zap, Shield, ArrowRight } from 'lucide-react';

interface PaymentSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    tier: {
        name: string;
        price: string;
        credits: string;
    } | null;
    onSelectPayment: (method: 'stripe' | 'web3') => void;
}

export function PaymentSelectorModal({
    isOpen,
    onClose,
    tier,
    onSelectPayment
}: PaymentSelectorModalProps) {
    if (!isOpen || !tier) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[var(--bg-deep)]/80 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-elevated)]/50">
                    <div>
                        <p className="text-[var(--accent)] text-[10px] font-bold tracking-widest uppercase mb-1">SELECT PAYMENT METHOD</p>
                        <h2 className="text-xl font-display uppercase tracking-tight">Checkout: {tier.name}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Main Content */}
                <div className="p-8 space-y-6">
                    <div className="flex justify-between items-center p-4 bg-[var(--bg-deep)]/50 border border-[var(--border)] group">
                        <div>
                            <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">Total Due</p>
                            <p className="text-2xl font-display">{tier.price}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold mb-1">Credits Assigned</p>
                            <p className="text-[var(--accent)] font-bold text-lg">{tier.credits}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {/* Stripe Option */}
                        <button
                            onClick={() => onSelectPayment('stripe')}
                            className="flex items-center gap-6 p-6 border border-[var(--border)] hover:border-[var(--accent)] bg-[var(--bg-elevated)]/30 hover:bg-[var(--accent)]/5 transition-all group text-left relative overflow-hidden"
                        >
                            <div className="p-3 bg-[var(--bg-deep)] border border-[var(--border)] group-hover:border-[var(--accent)]/50 transition-colors">
                                <CreditCard className="h-6 w-6 text-[var(--accent)]" />
                            </div>
                            <div className="flex-grow">
                                <h3 className="font-bold text-sm tracking-wide group-hover:text-[var(--accent)] transition-colors">CREDIT / DEBIT CARD</h3>
                                <p className="text-[var(--text-muted)] text-xs mt-1">Pay with Fiat via Secure Stripe Gateway</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-all group-hover:translate-x-1" />

                            {/* Decorative line */}
                            <div className="absolute top-0 left-0 w-[2px] h-full bg-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>

                        {/* Web3 Option */}
                        <button
                            onClick={() => onSelectPayment('web3')}
                            className="flex items-center gap-6 p-6 border border-[var(--border)] hover:border-[var(--accent)] bg-[var(--bg-elevated)]/30 hover:bg-[var(--accent)]/5 transition-all group text-left relative overflow-hidden"
                        >
                            <div className="p-3 bg-[var(--bg-deep)] border border-[var(--border)] group-hover:border-[var(--accent)]/50 transition-colors">
                                <Wallet className="h-6 w-6 text-[var(--accent)]" />
                            </div>
                            <div className="flex-grow">
                                <h3 className="font-bold text-sm tracking-wide group-hover:text-[var(--accent)] transition-colors">WEB3 / CRYPTO</h3>
                                <p className="text-[var(--text-muted)] text-xs mt-1">Pay with USDC/USDT on Arbitrum</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-all group-hover:translate-x-1" />

                            {/* Decorative line */}
                            <div className="absolute top-0 left-0 w-[2px] h-full bg-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[var(--border)] bg-[var(--bg-elevated)]/20 flex items-center justify-center gap-2">
                    <Shield className="h-4 w-4 text-[var(--text-muted)]" />
                    <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-widest">Secure encrypted transactions</p>
                </div>
            </div>

            <style jsx>{`
                .animate-in {
                    animation: animate-in 0.3s ease-out;
                }
                @keyframes animate-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
