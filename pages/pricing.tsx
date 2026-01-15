import { Header } from '@components/Header';
import FooterSection from '@components/home/FooterSection';
import { Check, Shield, Zap, Sparkles, Orbit } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import { PaymentSelectorModal } from '@components/PaymentSelectorModal';
import { Web3CheckoutModal } from '@components/Web3CheckoutModal';

const pricingTiers = [
    {
        name: "FREE",
        price: "$0",
        credits: "0 Credits",
        trades: 0,
        description: "Explorer plan for those starting their trading journey.",
        features: [
            "Access to basic agents",
            "Manual trading dashboard",
            "Standard support",
            "Public community access"
        ],
        accent: "var(--text-muted)",
        buttonText: "CURRENT PLAN",
        popular: false
    },
    {
        name: "STARTER",
        price: "$19",
        credits: "1,000 Credits",
        trades: 100,
        description: "Kickstart your automated trading with essential credits.",
        features: [
            "1,000 Trading Credits",
            "100 Trades Included",
            "Priority agent access",
            "Email support"
        ],
        accent: "var(--accent)",
        buttonText: "BUY CREDITS",
        popular: false
    },
    {
        name: "PRO",
        price: "$49",
        credits: "5,000 Credits",
        trades: 200,
        description: "The sweet spot for active traders seeking efficiency.",
        features: [
            "5,000 Trading Credits",
            "200 Trades Included",
            "Custom agent deployment",
            "Priority support"
        ],
        accent: "var(--accent)",
        buttonText: "BUY CREDITS",
        popular: true
    },
    {
        name: "WHALE",
        price: "$99",
        credits: "15,000 Credits",
        trades: 400,
        description: "Maximum power for serious institutional-grade trading.",
        features: [
            "15,000 Trading Credits",
            "400 Trades Included",
            "Dedicated account manager",
            "Custom API access"
        ],
        accent: "#ffaa00",
        buttonText: "BUY CREDITS",
        popular: false
    }
];

export default function Pricing() {
    const { login, authenticated, user } = usePrivy();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isWeb3ModalOpen, setIsWeb3ModalOpen] = useState(false);
    const [selectedTier, setSelectedTier] = useState<any>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    const handleBuyCredits = (tier: any) => {
        if (!authenticated) {
            login();
            return;
        }
        if (tier.name === "FREE") return;

        setSelectedTier(tier);
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSelection = async (method: 'stripe' | 'web3') => {
        if (method === 'stripe') {
            setIsRedirecting(true);
            try {
                const response = await fetch('/api/payments/stripe/create-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tierName: selectedTier.name,
                        userWallet: user?.wallet?.address
                    }),
                });

                const data = await response.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    console.error('Failed to create checkout session:', data.error);
                    alert('Failed to start Stripe checkout. Please try again.');
                }
            } catch (error) {
                console.error('Stripe error:', error);
                alert('An error occurred. Please try again.');
            } finally {
                setIsRedirecting(false);
                setIsPaymentModalOpen(false);
            }
        } else {
            setIsPaymentModalOpen(false);
            setIsWeb3ModalOpen(true);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] font-mono">
            <Header />

            <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-8 sm:py-12 md:py-20">
                <div className="text-center mb-8 sm:mb-12 md:mb-16 space-y-3 sm:space-y-4">
                    {isRedirecting && (
                        <div className="fixed inset-0 z-[110] bg-[var(--bg-deep)]/90 backdrop-blur-xl flex flex-center items-center justify-center flex-col gap-4 sm:gap-6 animate-in fade-in duration-500 px-4">
                            <div className="relative">
                                <Orbit className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-[var(--accent)] animate-spin-slow" />
                                <Zap className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-[var(--accent)] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-lg sm:text-xl md:text-2xl font-display uppercase tracking-widest text-[var(--accent)] mb-1 sm:mb-2">INITIALIZING SECURE GATEWAY</h2>
                                <p className="text-[var(--text-muted)] text-[10px] sm:text-xs tracking-[0.2em] font-bold">PREPARING ENCRYPTED SESSION · STACK: STRIPE</p>
                            </div>
                        </div>
                    )}
                    <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-0.5 sm:py-1 border border-[var(--accent)] text-[var(--accent)] text-[10px] sm:text-xs font-bold tracking-widest mb-3 sm:mb-4">
                        <Orbit className="h-3 w-3 sm:h-4 sm:w-4 animate-spin-slow" />
                        PROTOCOL FUEL
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-display uppercase tracking-tight px-2">
                        Power Your <span className="text-[var(--accent)]">Agents</span>
                    </h1>
                    <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-xs sm:text-sm md:text-base leading-relaxed px-2">
                        Credits are the lifeblood of the Maxxit ecosystem. Use them to deploy, maintain, and boost your automated trading agents across multiple venues.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
                    {pricingTiers.map((tier, index) => (
                        <div
                            key={index}
                            className={`relative border-box p-4 sm:p-6 md:p-8 flex flex-col h-full bg-[var(--bg-surface)] transition-all duration-300 hover:-translate-y-1 sm:hover:-translate-y-2 group ${tier.popular ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/30' : 'border-[var(--border)]'
                                }`}
                        >
                            {tier.popular && (
                                <div className="absolute -top-2 sm:-top-3 left-1/2 -translate-x-1/2 px-2 sm:px-3 py-0.5 sm:py-1 bg-[var(--accent)] text-[var(--bg-deep)] text-[9px] sm:text-[10px] font-bold tracking-tighter uppercase">
                                    MOST POPULAR
                                </div>
                            )}

                            <div className="mb-4 sm:mb-6 md:mb-8">
                                <p className="data-label mb-1.5 sm:mb-2 text-[10px] sm:text-xs" style={{ color: tier.accent }}>{tier.name}</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl sm:text-3xl md:text-4xl font-display">{tier.price}</span>
                                    <span className="text-[var(--text-muted)] text-[10px] sm:text-xs">ONE-TIME</span>
                                </div>
                                <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-[var(--bg-elevated)] border border-[var(--border)] group-hover:border-[var(--accent)]/30 transition-colors">
                                    <p className="text-[var(--accent)] font-bold text-lg sm:text-xl">{tier.credits}</p>
                                    <p className="text-[var(--text-muted)] text-[9px] sm:text-[10px] uppercase tracking-wider">Deposit into wallet</p>
                                </div>
                            </div>

                            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4 sm:mb-6 md:mb-8 leading-relaxed min-h-[3rem] sm:min-h-[3.5rem]">
                                {tier.description}
                            </p>

                            <ul className="space-y-2 sm:space-y-3 md:space-y-4 mb-6 sm:mb-8 md:mb-10 flex-grow">
                                {tier.features.map((feature, fIndex) => (
                                    <li key={fIndex} className="flex items-start gap-2 sm:gap-3 text-[10px] sm:text-xs text-[var(--text-secondary)]">
                                        <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--accent)] shrink-0 mt-0.5" />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <button
                                onClick={() => handleBuyCredits(tier)}
                                className={`w-full py-2.5 sm:py-3 md:py-4 text-xs sm:text-sm font-bold tracking-widest transition-all duration-300 ${tier.name === "FREE"
                                    ? 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'
                                    : 'bg-[var(--accent)] text-[var(--bg-deep)] hover:bg-[var(--accent-dim)] shadow-[0_0_20px_rgba(0,255,136,0.2)] hover:shadow-[0_0_30px_rgba(0,255,136,0.4)]'
                                    }`}
                            >
                                {authenticated ? (tier.name === "FREE" ? "CURRENT PLAN" : tier.buttonText) : "CONNECT WALLET"}
                            </button>
                        </div>
                    ))}
                </div>

                <PaymentSelectorModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    tier={selectedTier}
                    onSelectPayment={handlePaymentSelection}
                />

                <Web3CheckoutModal
                    isOpen={isWeb3ModalOpen}
                    onClose={() => setIsWeb3ModalOpen(false)}
                    tier={selectedTier}
                    userWallet={user?.wallet?.address}
                    onSuccess={(txHash) => {
                        console.log('Web3 Payment Success:', txHash);
                    }}
                />

                <section className="mt-16 sm:mt-24 md:mt-32 p-6 sm:p-8 md:p-12 bg-grid-pattern border border-[var(--border)] relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 md:gap-8">
                        <div className="max-w-xl text-center md:text-left">
                            <h2 className="text-xl sm:text-2xl font-display uppercase mb-2 sm:mb-3 md:mb-4">Enterprise Solutions</h2>
                            <p className="text-[var(--text-secondary)] text-xs sm:text-sm leading-relaxed">
                                Need more than 50,000 credits? Searching for custom agent architectures? Our enterprise team provides bespoke infrastructure for high-frequency trading groups.
                            </p>
                        </div>
                        <button className="w-full md:w-auto px-6 sm:px-8 py-2.5 sm:py-3 border border-[var(--text-primary)] hover:bg-[var(--text-primary)] hover:text-[var(--bg-deep)] transition-all font-bold text-xs sm:text-sm tracking-widest">
                            CONTACT SALES
                        </button>
                    </div>
                    <div className="absolute top-0 right-0 p-4 sm:p-6 md:p-8 opacity-10 pointer-events-none hidden md:block">
                        <Shield className="h-32 sm:h-48 md:h-64 w-32 sm:w-48 md:w-64" />
                    </div>
                </section>
            </main>

            <FooterSection />

            <style jsx>{`
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
