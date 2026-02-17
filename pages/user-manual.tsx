import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Wallet, CreditCard, CheckCircle2, History, Users, MapPin, Settings, Bot, DollarSign, LineChart, ChevronDown, ChevronUp, PlusCircle, Radio, Orbit, Zap, MessageSquare, Key, Shield, Rocket } from 'lucide-react';
import { Header } from '@components/Header';
import FooterSection from '@components/home/FooterSection';

interface Step {
  id: string;
  number: number;
  title: string;
  description: string;
  icon: React.ElementType;
  image: string;
  images?: { src: string; alt: string }[];
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

// Steps for OpenClaw setup flow
const openclawSteps: Step[] = [
  {
    id: 'openclaw-start',
    number: 1,
    title: 'Get Started with OpenClaw',
    description: 'OpenClaw is your personal AI assistant on Maxxit. It runs on a dedicated server and connects to your Telegram bot.',
    icon: Orbit,
    image: '/openclaw_images/01-landing-page.png',
    details: [
      'Navigate to the OpenClaw setup page',
      'Review the features — dedicated instance, Telegram integration, and LLM budget',
      'Click "Get Started" to begin the setup',
    ],
    tip: 'OpenClaw can be extended with skills like Maxxit Lazy Trading to execute trades via Telegram messages.',
  },
  {
    id: 'openclaw-plan',
    number: 2,
    title: 'Choose Your Plan',
    description: 'Select a plan that fits your needs. Each plan includes hosting, usage tracking, and Telegram integration.',
    icon: CreditCard,
    image: '/openclaw_images/02-plan-selection.png',
    details: [
      'Review the Starter plan ($29/mo) — includes $2 LLM usage with all models',
      'Review the Pro plan ($49/mo) — includes $20 LLM usage plus custom skills',
      'Select your preferred plan and complete payment',
    ],
    tip: 'Start with the Starter plan to try out OpenClaw. You can upgrade anytime.',
  },
  {
    id: 'openclaw-telegram',
    number: 3,
    title: 'Create Your Telegram Bot',
    description: 'Create a private Telegram bot using BotFather. Messages you send to this bot go directly to your OpenClaw instance.',
    icon: MessageSquare,
    image: '/openclaw_images/03-telegram-bot-token.png',
    images: [
      { src: '/openclaw_images/04-botfather-newbot.png', alt: 'BotFather /newbot command' },
      { src: '/openclaw_images/05-botfather-token.png', alt: 'BotFather bot token' },
      { src: '/openclaw_images/03-telegram-bot-token.png', alt: 'Paste bot token in setup' },
    ],
    details: [
      'Open @BotFather in Telegram',
      'Send /newbot and follow the prompts to name your bot',
      'Copy the bot token BotFather gives you',
      'Paste the token in the setup page and click "Verify & Connect Bot"',
    ],
    tip: 'Choose a bot name that\'s easy to find in your Telegram — you\'ll be messaging it frequently!',
  },
  {
    id: 'openclaw-verify',
    number: 4,
    title: 'Verify Your Telegram Account',
    description: 'After connecting your bot, verify your Telegram account by sending it a message. This links your Telegram ID.',
    icon: CheckCircle2,
    image: '/openclaw_images/08-bot-verified.png',
    images: [
      { src: '/openclaw_images/06-bot-verification-required.png', alt: 'Verification required' },
      { src: '/openclaw_images/07-telegram-start-verify.png', alt: 'Send /start to verify' },
      { src: '/openclaw_images/08-bot-verified.png', alt: 'Bot verified successfully' },
    ],
    details: [
      'Open your newly created bot in Telegram',
      'Send /start to the bot',
      'Wait for the verification confirmation on the setup page',
      'Your Telegram account is now securely linked',
    ],
  },
  {
    id: 'openclaw-openai',
    number: 5,
    title: 'Create OpenAI API Key',
    description: 'Maxxit generates a personal OpenAI API key for your instance, enabling usage tracking and plan-based limits.',
    icon: Key,
    image: '/openclaw_images/10-openai-key-created.png',
    images: [
      { src: '/openclaw_images/09-openai-key-create.png', alt: 'Create OpenAI key' },
      { src: '/openclaw_images/10-openai-key-created.png', alt: 'OpenAI key created' },
    ],
    details: [
      'Click "Create API Key" on the OpenAI step',
      'The key is generated and stored automatically',
      'Your monthly LLM budget is included in your plan',
      'You can top up LLM credits anytime if needed',
    ],
    tip: 'Your API key enables per-model usage tracking so you know exactly where your LLM budget goes.',
  },
  {
    id: 'openclaw-skill',
    number: 6,
    title: 'Enable Maxxit Lazy Trading Skill',
    description: 'The Maxxit Lazy Trading skill lets you execute trades on Ostium by sending a message to your OpenClaw bot.',
    icon: Zap,
    image: '/openclaw_images/12-skills-setup-agent.png',
    images: [
      { src: '/openclaw_images/11-skills-enable.png', alt: 'Enable the Lazy Trading skill' },
      { src: '/openclaw_images/12-skills-setup-agent.png', alt: 'Set up trading agent' },
    ],
    details: [
      'Click "Enable Skill" next to Maxxit Lazy Trading',
      'Click "Set Up Trading Agent" to create a dedicated trading agent',
      'The system creates an agent wallet for non-custodial trading',
    ],
    tip: 'This step is optional but highly recommended — it\'s what makes OpenClaw a trading assistant!',
  },
  {
    id: 'openclaw-onchain',
    number: 7,
    title: 'Approve On-Chain Permissions',
    description: 'Approve two on-chain transactions to let your trading agent operate on Ostium non-custodially.',
    icon: Shield,
    image: '/openclaw_images/13-skills-delegation-usdc.png',
    images: [
      { src: '/openclaw_images/13-skills-delegation-usdc.png', alt: 'Delegation and USDC approval' },
      { src: '/openclaw_images/14-skills-generate-key.png', alt: 'Generate API key' },
      { src: '/openclaw_images/15-skills-key-generated.png', alt: 'API key generated' },
      { src: '/openclaw_images/16-skills-key-ready.png', alt: 'API key ready to use' },
    ],
    details: [
      'Approve Delegation — allows the agent to trade on Ostium on your behalf (cannot withdraw funds)',
      'Approve USDC — allows Ostium to use your USDC for trading (funds stay in your wallet)',
      'Click "Create Deployment & Continue"',
      'Generate the API key to connect the skill to your instance',
    ],
    tip: 'The agent can only trade — it cannot withdraw your funds. You can revoke access anytime from Ostium.',
  },
  {
    id: 'openclaw-launch',
    number: 8,
    title: 'Launch Your OpenClaw',
    description: 'Review your setup and launch your personal AI assistant. Once live, start chatting via Telegram!',
    icon: Rocket,
    image: '/openclaw_images/17-launch-review.png',
    images: [
      { src: '/openclaw_images/17-launch-review.png', alt: 'Review your setup' },
      { src: '/openclaw_images/18-launch-deploying.png', alt: 'Instance deploying' },
    ],
    details: [
      'Review your setup summary (plan, model, Telegram bot, API key)',
      'Click "Launch OpenClaw" to spin up your instance',
      'Wait for the instance to start (usually under a minute)',
      'Open your Telegram bot and send a message to get started!',
    ],
    tip: 'Try sending: "Hey buy BTC now if the market looks bullish" — your OpenClaw will analyze and execute!',
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
          {/* Images */}
          {step.images && step.images.length > 0 ? (
            <div className="space-y-3">
              {step.images.length === 2 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {step.images.map((img, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                      <Image
                        src={img.src}
                        alt={img.alt}
                        width={800}
                        height={450}
                        className="w-full h-auto"
                        priority={step.number <= 3}
                        quality={100}
                      />
                      <p className="text-[10px] text-[var(--text-secondary)] text-center py-1.5 bg-[var(--bg-elevated)]">{img.alt}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {step.images.length >= 3 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {step.images.slice(0, 2).map((img, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                          <Image
                            src={img.src}
                            alt={img.alt}
                            width={800}
                            height={450}
                            className="w-full h-auto"
                            priority={step.number <= 3}
                            quality={100}
                          />
                          <p className="text-[10px] text-[var(--text-secondary)] text-center py-1.5 bg-[var(--bg-elevated)]">{img.alt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.images.slice(2).map((img, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                      <Image
                        src={img.src}
                        alt={img.alt}
                        width={3000}
                        height={3000}
                        className="w-full h-auto"
                        quality={100}
                      />
                      <p className="text-[10px] text-[var(--text-secondary)] text-center py-1.5 bg-[var(--bg-elevated)]">{img.alt}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
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
          )}

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
  const sidebarRef = useRef<HTMLDivElement>(null);

  const toggleStep = (stepId: string) => {
    setExpandedStep(expandedStep === stepId ? '' : stepId);
  };

  // Capture wheel events on the sidebar so main content doesn't scroll
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      // Only intercept if sidebar content is scrollable
      if (scrollHeight <= clientHeight) return;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;
      // Prevent page scroll unless sidebar is at its boundary in that direction
      if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollTop += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

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
    const allSteps = [...joinClubSteps, ...createClubSteps, ...openclawSteps];

    const handleScroll = () => {
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight + 40 : 140;

      let currentSection = allSteps[0].id;
      let minDistance = Infinity;

      for (const { id } of allSteps) {
        const element = document.getElementById(id);
        if (element) {
          const rect = element.getBoundingClientRect();
          const distanceFromTop = rect.top - headerHeight;

          // Find the section that's closest to or just past the top threshold
          if (distanceFromTop <= 0 && Math.abs(distanceFromTop) < minDistance) {
            minDistance = Math.abs(distanceFromTop);
            currentSection = id;
          } else if (distanceFromTop > 0 && distanceFromTop < 100 && minDistance === Infinity) {
            // If no section has passed the threshold yet, use the first one approaching
            currentSection = id;
            break;
          }
        }
      }

      setActiveSection(currentSection);
    };

    // Initial check
    handleScroll();

    // Add scroll listener with throttling for performance
    let ticking = false;
    const scrollListener = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', scrollListener, { passive: true });
    return () => window.removeEventListener('scroll', scrollListener);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />

      <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl">
        {/* Page Header */}
        <div className="mb-4 sm:mb-6 md:mb-10">
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-14 md:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/60 flex items-center justify-center shadow-[0_0_20px_var(--accent-glow)] flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-7 md:h-7 text-[var(--bg-deep)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-4xl font-display font-bold text-[var(--text-primary)]">
                User Manual
              </h1>
              <p className="text-[var(--text-secondary)] text-xs sm:text-sm md:text-lg mt-0.5 sm:mt-1">
                Step-by-step guide to using Maxxit
              </p>
            </div>
          </div>

          {/* Quick intro */}
          <div className="p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl bg-gradient-to-r from-[var(--accent)]/10 to-transparent border border-[var(--accent)]/30 mt-3 sm:mt-4 md:mt-6">
            <p className="text-[var(--text-primary)] text-xs sm:text-sm md:text-base">
              Welcome to Maxxit! This guide will walk you through everything you need to know — from connecting your wallet to monitoring your AI-powered trades.
              <span className="text-[var(--accent)] font-semibold"> Click on any step to expand and see detailed instructions with screenshots.</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <div
              ref={sidebarRef}
              className="sticky top-20 sm:top-28 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 sm:p-4 max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-8rem)] overflow-y-auto scroll-smooth"
              style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
            >
              {/* Join Club Section */}
              <h3 className="text-[10px] sm:text-xs font-semibold text-[var(--accent)] uppercase tracking-wide mb-2 sm:mb-3 px-1.5 sm:px-2 flex items-center gap-1.5 sm:gap-2">
                <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                Join a Club
              </h3>
              <nav className="space-y-0.5 sm:space-y-1 mb-3 sm:mb-4">
                {joinClubSteps.map((step) => {
                  const isActive = activeSection === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => scrollToStep(step.id)}
                      className={`w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs transition-all duration-200 text-left ${isActive
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-l-2 border-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                    >
                      <span className={`flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[9px] sm:text-[10px] font-semibold flex items-center justify-center ${isActive
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

              {/* Divider */}
              <div className="border-t border-[var(--border)] my-4"></div>

              {/* OpenClaw Section */}
              <h3 className="text-[10px] sm:text-xs font-semibold text-[var(--accent)] uppercase tracking-wide mb-2 sm:mb-3 px-1.5 sm:px-2 flex items-center gap-1.5 sm:gap-2">
                <Orbit className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                OpenClaw Setup
              </h3>
              <nav className="space-y-0.5 sm:space-y-1">
                {openclawSteps.map((step) => {
                  const isActive = activeSection === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => scrollToStep(step.id)}
                      className={`w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-[10px] sm:text-xs transition-all duration-200 text-left ${isActive
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-l-2 border-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                    >
                      <span className={`flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[9px] sm:text-[10px] font-semibold flex items-center justify-center ${isActive
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
          <main className="lg:col-span-3 space-y-3 sm:space-y-4 md:space-y-6">
            {/* Section: Join a Club */}
            <div className="mb-4 sm:mb-6 md:mb-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-6">
                <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-lg sm:rounded-xl bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-[var(--text-primary)]">Join an Alpha Club</h2>
                  <p className="text-[10px] sm:text-xs md:text-sm text-[var(--text-secondary)]">Follow these steps to join an existing club and start trading</p>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
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

              <div className="mt-2 sm:mt-3 md:mt-4 p-2.5 sm:p-3 md:p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]">
                <p className="text-[10px] sm:text-xs md:text-sm text-[var(--text-secondary)]">
                  After selecting your sources, continue with steps 7-11 from the "Join a Club" flow above
                  (Select Venue → Trading Preferences → Agent Assignment → Costs → Monitor Trades).
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="relative py-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]"></div>
              </div>
            </div>

            {/* Section: OpenClaw Setup */}
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                  <Orbit className="h-4 w-4 sm:h-5 sm:w-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">Set Up OpenClaw</h2>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">Deploy your personal AI assistant with Telegram trading</p>
                </div>
              </div>

              <div className="p-3 sm:p-4 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 mb-4 sm:mb-6">
                <p className="text-xs sm:text-sm text-[var(--text-primary)]">
                  <span className="font-semibold text-[var(--accent)]">OpenClaw</span> is your personal AI assistant instance.
                  It runs on a dedicated server, connects to your Telegram, and can trade on Ostium via the <span className="font-semibold text-[var(--accent)]">Maxxit Lazy Trading</span> skill.
                </p>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {openclawSteps.map((step) => (
                  <div key={step.id} id={step.id} className="scroll-mt-32">
                    <StepCard
                      step={step}
                      isExpanded={expandedStep === step.id}
                      onToggle={() => toggleStep(step.id)}
                    />
                  </div>
                ))}
              </div>

              {/* OpenClaw welcome image */}
              <div className="mt-4 sm:mt-6 p-4 sm:p-6 rounded-lg sm:rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                <h3 className="font-semibold text-[var(--accent)] mb-2 text-sm sm:text-base">🎉 Your OpenClaw is Ready!</h3>
                <p className="text-xs sm:text-sm text-[var(--text-primary)] mb-4">
                  Once launched, your bot will greet you on Telegram. Just send a message to start trading!
                </p>
                <div className="rounded-lg overflow-hidden border border-[var(--accent)]/30 max-w-sm mx-auto">
                  <Image
                    src="/openclaw_welcome.png"
                    alt="OpenClaw welcome message on Telegram"
                    width={500}
                    height={400}
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] text-center mt-2">
                  Your OpenClaw bot greeting you on Telegram after launch
                </p>
              </div>
            </div>

            {/* Completion Message */}
            <div className="mt-4 sm:mt-6 md:mt-8 p-4 sm:p-6 md:p-8 rounded-lg sm:rounded-xl bg-gradient-to-r from-[var(--accent)]/20 to-[var(--accent)]/5 border border-[var(--accent)]/30 text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 mx-auto mb-2 sm:mb-3 md:mb-4 rounded-full bg-[var(--accent)] flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-[var(--bg-deep)]" />
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-[var(--text-primary)] mb-1.5 sm:mb-2">You're All Set!</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 sm:mb-4 md:mb-6 max-w-lg mx-auto px-2">
                You've completed the user manual. You're now ready to start trading with AI-powered agents on Maxxit.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4 justify-center px-2">
                <Link href="/" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-semibold rounded-lg hover:opacity-90 transition-opacity text-xs sm:text-sm">
                    Browse Alpha Clubs
                  </button>
                </Link>
                <Link href="/create-agent" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 border border-[var(--accent)] text-[var(--accent)] font-semibold rounded-lg hover:bg-[var(--accent)]/10 transition-colors text-xs sm:text-sm">
                    Create Your Own Club
                  </button>
                </Link>
              </div>
            </div>

            {/* Help Section */}
            <div className="mt-3 sm:mt-4 md:mt-6 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
              <h3 className="font-semibold text-[var(--text-primary)] mb-1.5 sm:mb-2 text-xs sm:text-sm md:text-base">Need More Help?</h3>
              <p className="text-[10px] sm:text-xs md:text-sm text-[var(--text-secondary)] mb-2 sm:mb-3 md:mb-4">
                If you have questions or run into issues, we're here to help.
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 md:gap-3 text-[10px] sm:text-xs md:text-sm">
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

      <FooterSection />
    </div>
  );
}

