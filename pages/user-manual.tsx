import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Wallet, CreditCard, CheckCircle2, History, Users, MapPin, Settings, Bot, DollarSign, LineChart, ChevronDown, ChevronUp, PlusCircle, Radio } from 'lucide-react';
import { Header } from '@components/Header';

interface Step {
  id: string;
  number: number;
  title: string;
  description: string;
  icon: React.ElementType;
  image: string;
  details: string[];
  tip?: string;
}

// Steps for joining a club flow
const joinClubSteps: Step[] = [
  {
    id: 'connect-wallet',
    number: 1,
    title: 'Connect Your Wallet',
    description: 'Start by connecting your crypto wallet to Maxxit. We support popular wallets like MetaMask, Coinbase Wallet, and more.',
    icon: Wallet,
    image: '/manual images/1_ConnectWallet.png',
    details: [
      'Click the "Connect Wallet" button in the top right corner',
      'Select your preferred wallet provider',
      'Approve the connection request in your wallet',
      'Make sure you\'re connected to Arbitrum network',
    ],
    tip: 'Ensure your wallet has USDC on Arbitrum for trading. Gas fees are sponsored by Maxxit!',
  },
  {
    id: 'purchase-credits',
    number: 2,
    title: 'Purchase Credits',
    description: 'Credits are used to create or join Alpha Clubs. You can purchase credits using various payment methods.',
    icon: CreditCard,
    image: '/manual images/2_PurchaseCredits.png',
    details: [
      'Navigate to the Credits section',
      'Select the amount of credits you want to purchase',
      'Choose between Stripe (card) or crypto payment',
      'Complete the payment process',
    ],
    tip: 'Credits are non-refundable. Start with a smaller package to test the platform.',
  },
  {
    id: 'stripe-payment',
    number: 3,
    title: 'Complete Payment via Stripe',
    description: 'If you choose Stripe, you\'ll be redirected to a secure payment gateway to complete your purchase.',
    icon: CreditCard,
    image: '/manual images/3_StripeGateway.png',
    details: [
      'Enter your card details securely',
      'Verify the payment amount',
      'Click "Pay" to complete the transaction',
      'Wait for confirmation',
    ],
    tip: 'Stripe supports most major credit and debit cards worldwide.',
  },
  {
    id: 'payment-success',
    number: 4,
    title: 'Payment Confirmation',
    description: 'Once your payment is processed, you\'ll see a confirmation screen with your updated credit balance.',
    icon: CheckCircle2,
    image: '/manual images/4_PaymentSuccess.png',
    details: [
      'Verify the credits have been added to your account',
      'Check your email for payment receipt',
      'You\'re now ready to create or join clubs!',
    ],
  },
  {
    id: 'credit-history',
    number: 5,
    title: 'View Credit History',
    description: 'Track all your credit transactions including purchases, usage for joining clubs, and any refunds.',
    icon: History,
    image: '/manual images/5_CreditHistory.png',
    details: [
      'Access your credit history from the dashboard',
      'View detailed transaction records',
      'Monitor your credit usage over time',
      'Download receipts if needed',
    ],
  },
  {
    id: 'join-club',
    number: 6,
    title: 'Join an Alpha Club',
    description: 'Browse the marketplace and join an existing club to start trading with AI-powered agents.',
    icon: Users,
    image: '/manual images/6_CreateOrJoin.png',
    details: [
      'Browse the Alpha Club marketplace',
      'Review club performance metrics and strategies',
      'Check the club\'s signal sources and risk parameters',
      'Click "Join" to become a member',
    ],
    tip: 'Review the club\'s historical performance and risk parameters before joining.',
  },
  {
    id: 'select-venue',
    number: 7,
    title: 'Select Trading Venue',
    description: 'Choose where your trades will be executed. Currently, we support Ostium for perpetual trading on Arbitrum.',
    icon: MapPin,
    image: '/manual images/7_SelectVenue.png',
    details: [
      'Select Ostium as your trading venue',
      'Review the venue features and supported markets',
      'Understand the fee structure',
      'Confirm your selection',
    ],
    tip: 'Ostium offers non-custodial perpetual trading with up to 100x leverage.',
  },
  {
    id: 'trading-preferences',
    number: 8,
    title: 'Set Trading Preferences',
    description: 'Configure your risk tolerance, position sizing, and leverage preferences. The agent becomes your "trading clone."',
    icon: Settings,
    image: '/manual images/8_SelectTradingPref.png',
    details: [
      'Set your maximum position size as a percentage of your balance',
      'Configure your preferred leverage level',
      'Define stop-loss and take-profit parameters',
      'Choose your risk profile (conservative, moderate, aggressive)',
    ],
    tip: 'Start with conservative settings until you understand how the agent trades.',
  },
  {
    id: 'agent-assignment',
    number: 9,
    title: 'Agent Assignment & Transactions',
    description: 'An agent is assigned to your club membership. You\'ll need to approve the agent to trade on your behalf.',
    icon: Bot,
    image: '/manual images/9_AgentAssignmentAndTransactions.png',
    details: [
      'Review the assigned agent wallet address',
      'Approve the agent delegation on Ostium',
      'Sign the transaction in your wallet',
      'The agent can now execute trades on your behalf',
    ],
    tip: 'The agent can only trade – it cannot withdraw your funds. You can revoke access anytime.',
  },
  {
    id: 'agent-cost',
    number: 10,
    title: 'Understanding Costs',
    description: 'Review the cost structure including credit usage and trading fees.',
    icon: DollarSign,
    image: '/manual images/10_AgentCost.png',
    details: [
      'Credits are consumed when joining clubs',
      'Trading fees are charged by the venue (Ostium)',
      'Some clubs may have performance fees',
      'All gas fees for on-chain transactions are sponsored by Maxxit',
    ],
    tip: 'Monitor your credit balance regularly and top up before it runs out to avoid trading interruptions.',
  },
  {
    id: 'my-trades',
    number: 11,
    title: 'Monitor Your Trades',
    description: 'Track all your active and historical trades from the "My Trades" dashboard.',
    icon: LineChart,
    image: '/manual images/11_MyTrades.png',
    details: [
      'View all open positions in real-time',
      'Monitor profit/loss for each trade',
      'Review trade history and performance',
      'Receive Telegram notifications for trade updates',
    ],
    tip: 'Link your Telegram account to receive instant trade notifications.',
  },
];

// Steps for creating your own club (separate flow)
const createClubSteps: Step[] = [
  {
    id: 'club-creation',
    number: 1,
    title: 'Create Your Club',
    description: 'Set up a new Alpha Club with your custom name, description, and trading strategy.',
    icon: PlusCircle,
    image: '/manual images/12_ClubCreation.png',
    details: [
      'Click "Create Club" from the marketplace',
      'Enter a unique name for your club',
      'Write a description explaining your trading strategy',
      'Set the club visibility (public or private)',
    ],
    tip: 'A clear description helps other traders understand your strategy and builds trust.',
  },
  {
    id: 'select-sources',
    number: 2,
    title: 'Select Trading Sources',
    description: 'Choose the signal sources your club will follow. Select from X (Twitter) accounts and Telegram channels.',
    icon: Radio,
    image: '/manual images/13_SelectYourTradingSources.png',
    details: [
      'Browse available X (Twitter) traders and influencers',
      'Select Telegram channels for alpha signals',
      'Each source has performance metrics to help you decide',
      'The more Telegram sources you select, the higher your club\'s credit cost',
    ],
    tip: 'Telegram sources increase your club\'s monthly credit cost. Choose sources with proven track records to maximize value.',
  },
];

// Combined for navigation
const steps = [...joinClubSteps];

function StepCard({ step, isExpanded, onToggle }: { step: Step; isExpanded: boolean; onToggle: () => void }) {
  const Icon = step.icon;

  return (
    <div
      className={`bg-[var(--bg-surface)] border rounded-xl overflow-hidden transition-all duration-300 ${isExpanded ? 'border-[var(--accent)] shadow-[0_0_30px_var(--accent-glow)]' : 'border-[var(--border)] hover:border-[var(--accent)]/50'
        }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 text-left"
      >
        <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-base sm:text-lg font-bold transition-colors ${isExpanded ? 'bg-[var(--accent)] text-[var(--bg-deep)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          }`}>
          {step.number}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${isExpanded ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`} />
            <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] break-words">{step.title}</h3>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2 sm:line-clamp-none">{step.description}</p>
        </div>
        <div className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--text-secondary)]" />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 sm:space-y-6">
          {/* Image */}
          <div className="relative rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
            <Image
              src={step.image}
              alt={step.title}
              width={3000}
              height={3000}
              className="w-full h-auto"
              priority={step.number <= 3}
              quality={100}
            />
          </div>

          {/* Details */}
          <div className="space-y-2 sm:space-y-3">
            <h4 className="font-semibold text-[var(--text-primary)] text-sm sm:text-base">Steps:</h4>
            <ol className="space-y-2">
              {step.details.map((detail, index) => (
                <li key={index} className="flex items-start gap-2 sm:gap-3">
                  <span className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] text-xs sm:text-sm font-semibold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-[var(--text-primary)] text-xs sm:text-sm">{detail}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Tip */}
          {step.tip && (
            <div className="p-3 sm:p-4 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30">
              <p className="text-xs sm:text-sm">
                <span className="font-semibold text-[var(--accent)]">💡 Pro Tip: </span>
                <span className="text-[var(--text-primary)]">{step.tip}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UserManualPage() {
  const [expandedStep, setExpandedStep] = useState<string>('connect-wallet');
  const [activeSection, setActiveSection] = useState<string>('connect-wallet');

  const toggleStep = (stepId: string) => {
    setExpandedStep(expandedStep === stepId ? '' : stepId);
  };

  const scrollToStep = (stepId: string) => {
    setExpandedStep(stepId);
    setActiveSection(stepId);
    const element = document.getElementById(stepId);
    if (element) {
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight + 20 : 120;
      const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: Math.max(0, elementTop - headerHeight),
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        threshold: [0, 0.3, 0.5],
        rootMargin: '-120px 0px -60% 0px',
      }
    );

    // Observe both join and create club steps
    [...joinClubSteps, ...createClubSteps].forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
        {/* Page Header */}
        <div className="mb-6 sm:mb-10">
          <div className="flex items-center gap-3 sm:gap-4 mb-4">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/60 flex items-center justify-center shadow-[0_0_20px_var(--accent-glow)] flex-shrink-0">
              <svg className="w-5 h-5 sm:w-7 sm:h-7 text-[var(--bg-deep)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-4xl font-display font-bold text-[var(--text-primary)]">
                User Manual
              </h1>
              <p className="text-[var(--text-secondary)] text-sm sm:text-lg mt-1">
                Step-by-step guide to using Maxxit
              </p>
            </div>
          </div>

          {/* Quick intro */}
          <div className="p-4 sm:p-6 rounded-xl bg-gradient-to-r from-[var(--accent)]/10 to-transparent border border-[var(--accent)]/30 mt-4 sm:mt-6">
            <p className="text-[var(--text-primary)] text-sm sm:text-base">
              Welcome to Maxxit! This guide will walk you through everything you need to know — from connecting your wallet to monitoring your AI-powered trades.
              <span className="text-[var(--accent)] font-semibold"> Click on any step to expand and see detailed instructions with screenshots.</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <div className="sticky top-20 sm:top-28 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 sm:p-4 max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-8rem)] overflow-y-auto">
              {/* Join Club Section */}
              <h3 className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide mb-3 px-2 flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                Join a Club
              </h3>
              <nav className="space-y-1 mb-4">
                {joinClubSteps.map((step) => {
                  const isActive = activeSection === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => scrollToStep(step.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 text-left ${isActive
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-l-2 border-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                    >
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center ${isActive
                        ? 'bg-[var(--accent)] text-[var(--bg-deep)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                        }`}>
                        {step.number}
                      </span>
                      <span className="truncate font-medium">{step.title}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Divider */}
              <div className="border-t border-[var(--border)] my-4"></div>

              {/* Create Club Section */}
              <h3 className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide mb-3 px-2 flex items-center gap-2">
                <PlusCircle className="h-3.5 w-3.5" />
                Create a Club
              </h3>
              <nav className="space-y-1">
                {createClubSteps.map((step) => {
                  const isActive = activeSection === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => scrollToStep(step.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 text-left ${isActive
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-l-2 border-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                    >
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center ${isActive
                        ? 'bg-[var(--accent)] text-[var(--bg-deep)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                        }`}>
                        {step.number}
                      </span>
                      <span className="truncate font-medium">{step.title}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Additional Links */}
              <div className="mt-6 pt-4 border-t border-[var(--border)]">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 px-2">
                  Resources
                </h3>
                <div className="space-y-1">
                  <Link href="/docs" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Documentation</span>
                  </Link>
                  <Link href="/blog" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Blog</span>
                  </Link>
                  <Link href="/" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span>Browse Clubs</span>
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3 space-y-4 sm:space-y-6">
            {/* Section: Join a Club */}
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">Join an Alpha Club</h2>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">Follow these steps to join an existing club and start trading</p>
                </div>
              </div>

              <div className="space-y-4">
                {joinClubSteps.map((step) => (
                  <div key={step.id} id={step.id} className="scroll-mt-32">
                    <StepCard
                      step={step}
                      isExpanded={expandedStep === step.id}
                      onToggle={() => toggleStep(step.id)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="relative py-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[var(--bg-deep)] px-4 text-sm text-[var(--text-secondary)]">OR</span>
              </div>
            </div>

            {/* Section: Create Your Own Club */}
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                  <PlusCircle className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">Create Your Own Club</h2>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">Want to build your own strategy? Here's how to create a club</p>
                </div>
              </div>

              <div className="p-3 sm:p-4 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 mb-4 sm:mb-6">
                <p className="text-xs sm:text-sm text-[var(--text-primary)]">
                  <span className="font-semibold text-[var(--accent)]">Note:</span> Creating a club follows the same initial steps (1-5) as joining.
                  After purchasing credits, choose "Create" instead of "Join", then follow these additional steps:
                </p>
              </div>

              <div className="space-y-4">
                {createClubSteps.map((step) => (
                  <div key={step.id} id={step.id} className="scroll-mt-32">
                    <StepCard
                      step={step}
                      isExpanded={expandedStep === step.id}
                      onToggle={() => toggleStep(step.id)}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 sm:mt-4 p-3 sm:p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]">
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  After selecting your sources, continue with steps 7-11 from the "Join a Club" flow above
                  (Select Venue → Trading Preferences → Agent Assignment → Costs → Monitor Trades).
                </p>
              </div>
            </div>

            {/* Completion Message */}
            <div className="mt-6 sm:mt-8 p-6 sm:p-8 rounded-xl bg-gradient-to-r from-[var(--accent)]/20 to-[var(--accent)]/5 border border-[var(--accent)]/30 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-[var(--accent)] flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-[var(--bg-deep)]" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2">You're All Set!</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4 sm:mb-6 max-w-lg mx-auto">
                You've completed the user manual. You're now ready to start trading with AI-powered agents on Maxxit.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Link href="/" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm">
                    Browse Alpha Clubs
                  </button>
                </Link>
                <Link href="/create-agent" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 border border-[var(--accent)] text-[var(--accent)] font-semibold rounded-lg hover:bg-[var(--accent)]/10 transition-colors text-sm">
                    Create Your Own Club
                  </button>
                </Link>
              </div>
            </div>

            {/* Help Section */}
            <div className="mt-4 sm:mt-6 p-4 sm:p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
              <h3 className="font-semibold text-[var(--text-primary)] mb-2 text-sm sm:text-base">Need More Help?</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 sm:mb-4">
                If you have questions or run into issues, we're here to help.
              </p>
              <div className="flex flex-wrap gap-2 sm:gap-3 text-xs sm:text-sm">
                <Link href="/docs" className="text-[var(--accent)] hover:underline">
                  Read Full Documentation →
                </Link>
                <span className="text-[var(--text-secondary)]">|</span>
                <a href="https://t.me/maxxit" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                  Join Telegram Community →
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

