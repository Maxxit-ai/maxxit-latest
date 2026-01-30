import { useEffect, useState } from 'react';
import { Gift, CreditCard, TrendingUp, X, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface WelcomeBonusModalProps {
    isOpen: boolean;
    onClose: () => void;
    credits: number;
    trades: number;
}

/**
 * WelcomeBonusModal - Displays a celebratory popup when new users receive their login bonus
 */
export function WelcomeBonusModal({ isOpen, onClose, credits, trades }: WelcomeBonusModalProps) {
    const [isAnimated, setIsAnimated] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Trigger animation after modal opens
            setTimeout(() => setIsAnimated(true), 100);
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        } else {
            setIsAnimated(false);
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className={`relative w-full max-w-md bg-[var(--bg-surface)] border border-[var(--accent)]/50 
          transform transition-all duration-500 ease-out
          ${isAnimated ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
            >
                {/* Glow effect */}
                <div className="absolute -inset-px bg-gradient-to-r from-[var(--accent)]/20 via-transparent to-[var(--accent)]/20 blur-sm" />

                {/* Content container */}
                <div className="relative bg-[var(--bg-surface)]">
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] 
              hover:bg-[var(--bg-elevated)] transition-colors z-10"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Header with icon */}
                    <div className="pt-8 pb-4 px-6 text-center border-b border-[var(--border)]">
                        <div className={`inline-flex items-center justify-center w-16 h-16 mb-4 
              bg-[var(--accent)]/10 border border-[var(--accent)]/30
              transition-transform duration-700 ${isAnimated ? 'rotate-0' : '-rotate-12'}`}>
                            <Gift className={`h-8 w-8 text-[var(--accent)] transition-transform duration-500
                ${isAnimated ? 'scale-100' : 'scale-50'}`} />
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 text-yellow-400 animate-pulse" />
                            <h2 className="text-xl font-display text-[var(--accent)]">WELCOME BONUS!</h2>
                            <Sparkles className="h-4 w-4 text-yellow-400 animate-pulse" />
                        </div>

                        <p className="text-sm text-[var(--text-secondary)]">
                            You've received a special welcome gift to get started
                        </p>
                    </div>

                    {/* Bonus Items */}
                    <div className="p-6 space-y-4">
                        {/* Credits */}
                        <div className={`flex items-center gap-4 p-4 bg-[var(--bg-deep)] border border-[var(--border)]
              hover:border-[var(--accent)]/30 transition-all duration-500
              ${isAnimated ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'}`}
                            style={{ transitionDelay: '200ms' }}
                        >
                            <div className="p-2 bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                                <CreditCard className="h-5 w-5 text-[var(--accent)]" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Credits</p>
                                <p className="text-2xl font-display text-[var(--text-primary)]">{credits}</p>
                            </div>
                            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 font-bold">
                                +{credits}
                            </span>
                        </div>

                        {/* Trades */}
                        <div className={`flex items-center gap-4 p-4 bg-[var(--bg-deep)] border border-[var(--border)]
              hover:border-[var(--accent)]/30 transition-all duration-500
              ${isAnimated ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
                            style={{ transitionDelay: '400ms' }}
                        >
                            <div className="p-2 bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                                <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Free Trades</p>
                                <p className="text-2xl font-display text-[var(--text-primary)]">{trades}</p>
                            </div>
                            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 font-bold">
                                +{trades}
                            </span>
                        </div>

                        {/* Info text */}
                        <p className="text-xs text-[var(--text-muted)] text-center pt-2">
                            Use credits to subscribe to alpha sources and trades to execute positions
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="p-6 pt-0 space-y-3">
                        <Link href="/creator" className="block">
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm
                  hover:bg-[var(--accent-dim)] transition-colors tracking-wider"
                            >
                                START TRADING NOW
                            </button>
                        </Link>

                        <button
                            onClick={onClose}
                            className="w-full py-2.5 border border-[var(--border)] text-[var(--text-secondary)] text-sm
                hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] transition-colors"
                        >
                            EXPLORE DASHBOARD
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
