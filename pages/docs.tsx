import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, BookOpen, Wallet, Shield, Zap, TrendingUp, AlertTriangle, Lock, Users, Target, BarChart3, MessageSquare, Bot, Brain } from 'lucide-react';
import { Header } from '@components/Header';

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: BookOpen },
    { id: 'getting-started', title: 'Getting Started', icon: Zap },
    { id: 'non-custodial', title: 'Non-Custodial Model', icon: Lock },
    { id: 'agents', title: 'The Three Agents', icon: Bot },
    { id: 'agent-what', title: 'Agent WHAT', icon: Target },
    { id: 'agent-how', title: 'Agent HOW', icon: BarChart3 },
    { id: 'agent-where', title: 'Agent WHERE', icon: Zap },
    { id: 'ostium', title: 'Ostium Trading', icon: TrendingUp },
    { id: 'telegram', title: 'Telegram Integration', icon: MessageSquare },
    { id: 'risks', title: 'Risks & Disclaimers', icon: AlertTriangle },
  ];

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
        threshold: [0, 0.1, 0.5, 1],
        rootMargin: '-120px 0px -60% 0px'
      }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    console.log("Scrolling to section: ", id);
    const element = document.getElementById(id);
    if (element) {
      // Get the header height (sticky header)
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight + 20 : 120; // Add 20px padding

      // Get element position relative to document
      const elementTop = element.getBoundingClientRect().top + window.pageYOffset;

      // Calculate scroll position accounting for header
      const offsetPosition = elementTop - headerHeight;

      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] border border-[var(--border)]">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold text-[var(--text-primary)] mb-2" data-testid="text-title">
            Documentation
          </h1>
          <p className="text-[var(--text-secondary)] mt-1 text-lg" data-testid="text-subtitle">
            Complete guide to Maxxit's non-custodial AI trading platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <Card className="sticky top-28 bg-[var(--bg-surface)] border-[var(--border)]">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-display text-[var(--text-primary)]">Contents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {sections.map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => scrollToSection(id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-all duration-200 text-left group ${activeSection === id
                      ? 'bg-[var(--accent)]/20 text-[var(--accent)] border-l-2 border-[var(--accent)] shadow-[0_0_12px_rgba(0,255,136,0.15)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border-l-2 border-transparent'
                      }`}
                    data-testid={`button-nav-${id}`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 transition-colors ${activeSection === id ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                      }`} />
                    <span className="font-medium">{title}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {/* Overview */}
            <section id="overview" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <BookOpen className="h-6 w-6 text-[var(--accent)]" />
                    Overview
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    What is Maxxit and how does it work?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    <strong className="text-[var(--accent)]">Maxxit</strong> is a <strong className="text-[var(--accent)]">fully non-custodial</strong> AI trading platform
                    that turns signals from sources you trust into real trades. It sizes them to your risk style, routes them to the best venue, and monitors positions continuously — 24/7.
                  </p>
                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 mb-4 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--accent)]">
                      <Lock className="h-4 w-4" />
                      100% Non-Custodial
                    </h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      <strong className="text-[var(--accent)]">Your funds NEVER leave your wallet.</strong> Maxxit agents trade on your behalf via delegation,
                      but they cannot access, withdraw, or transfer your assets. You maintain full custody at all times.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">🤖 Three AI Agents</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        WHAT (signal selection) → HOW (your trading clone) → WHERE (venue routing + monitoring)
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">📊 Benchmarked Sources</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        We track source performance over time. Instead of "who's loud," you get "who's right often enough to matter."
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">🔒 Your Wallet, Your Keys</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Trades execute via agent delegation on Ostium. Revoke access anytime — your funds remain fully under your control.
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">⚡ Deterministic AI</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Consistent decisions, not AI mood swings. Same input → same output. Reproducible, predictable, debuggable.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Getting Started */}
            <section id="getting-started" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Zap className="h-6 w-6 text-[var(--accent)]" />
                    Getting Started
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Start trading with Maxxit in minutes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal list-inside space-y-4 text-[var(--text-primary)]">
                    <li>
                      <strong className="text-[var(--accent)]">Connect Your Wallet</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Connect your Arbitrum wallet and fund it with USDC for trading.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Browse the Alpha Club Marketplace</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Explore clubs created by the community. Each club uses multi-parameter analysis with its own unique strategy configuration.
                        Review performance metrics and risk parameters before joining.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Join an Alpha Club</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        When you join a club, you approve the agent to trade on your behalf via Ostium's delegation system. 
                        The agent can open/close positions but <strong className="text-[var(--accent)]">CANNOT withdraw funds</strong>.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Configure Your Trading Style</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Set your risk tolerance, position sizing preferences, and leverage limits. The agent becomes your "trading clone" — 
                        executing the strategy your way.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Monitor via Telegram or Dashboard</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Link your Telegram to receive instant trade notifications. Use the dashboard to track open positions, PnL, and send manual trade commands.
                      </p>
                    </li>
                  </ol>
                  <Separator />
                  <div className="flex gap-3">
                    <Link href="/create-agent">
                      <Button data-testid="button-create-agent">
                        Create Your Own Club
                      </Button>
                    </Link>
                    <Link href="/">
                      <Button variant="outline" data-testid="button-browse-agents">
                        Browse Clubs
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Non-Custodial Model */}
            <section id="non-custodial" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 hover:border-[var(--accent)]/50 transition-colors shadow-[0_0_20px_var(--accent-glow)]">
                <CardHeader className="border-b border-[var(--accent)]/20">
                  <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                    <Lock className="h-6 w-6" />
                    Non-Custodial Model
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Why Maxxit can never access your funds
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">🔐 Zero Custody Architecture</h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      Unlike centralized exchanges (CEXs) where your funds are held in the exchange's wallets, Maxxit operates in a <strong className="text-[var(--accent)]">completely non-custodial manner</strong>.
                      Your assets remain in <strong className="text-[var(--accent)]">your wallet at all times</strong>.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">How It Works</h4>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                          1
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Agent Delegation</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            When you join a club, you approve the agent to trade on your behalf via Ostium's delegation system. This grants the agent
                            permission to open/close positions but <strong className="text-[var(--danger)]">NOT to withdraw funds</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                          2
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">On-Chain Execution</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Every trade is executed on-chain via Ostium on Arbitrum. The agent opens perpetual positions (long/short)
                            with your configured leverage and risk parameters. You can verify every transaction on Arbiscan.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                          3
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Revocable Permissions</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            You can <strong className="text-[var(--accent)]">revoke agent access at any time</strong>.
                            Once revoked, the agent can no longer execute trades. Your funds remain in your wallet, completely under your control.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                          4
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">No Withdrawal Capability</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            The agent <strong className="text-[var(--danger)]">physically cannot</strong> withdraw or transfer your funds to external addresses.
                            It can only interact with Ostium for opening and closing positions.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)] shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                    <h4 className="font-semibold mb-2 text-[var(--text-primary)]">📖 Compare: CEX vs Maxxit</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <h5 className="font-semibold text-[var(--danger)] mb-1">❌ Centralized Exchange (CEX)</h5>
                        <ul className="space-y-1 text-[var(--text-primary)]">
                          <li>• Funds held in exchange's wallets</li>
                          <li>• Exchange controls private keys</li>
                          <li>• Risk of hacks and insolvency events</li>
                          <li>• Withdrawals can be frozen</li>
                          <li>• Must trust the platform</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="font-semibold text-[var(--accent)] mb-1">✅ Maxxit (Non-Custodial)</h5>
                        <ul className="space-y-1 text-[var(--text-primary)]">
                          <li>• Funds remain in YOUR wallet</li>
                          <li>• YOU control the private keys</li>
                          <li>• No hack risk to Maxxit = no fund loss</li>
                          <li>• Withdraw anytime, no permission needed</li>
                          <li>• Trustless, on-chain execution</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* The Three Agents */}
            <section id="agents" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Bot className="h-6 w-6 text-[var(--accent)]" />
                    The Three Agents
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    How Maxxit breaks down trading: WHAT → HOW → WHERE
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Maxxit covers the full trading cycle with three specialized agents, mirroring how humans actually trade:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border border-[var(--accent)]/30 rounded-md bg-[var(--accent)]/10 shadow-[0_0_10px_var(--accent-glow)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-5 w-5 text-[var(--accent)]" />
                        <h4 className="font-semibold text-[var(--accent)]">Agent WHAT</h4>
                      </div>
                      <p className="text-sm text-[var(--text-primary)]">
                        <strong>Signal Selection</strong> — Picks what to trade based on benchmarked sources and converts human alpha into objective parameters.
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--accent)]/30 rounded-md bg-[var(--accent)]/10 shadow-[0_0_10px_var(--accent-glow)]">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
                        <h4 className="font-semibold text-[var(--accent)]">Agent HOW</h4>
                      </div>
                      <p className="text-sm text-[var(--text-primary)]">
                        <strong>Your Trading Clone</strong> — Sizes positions to your risk style, applies your leverage preferences, executes like you would.
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--accent)]/30 rounded-md bg-[var(--accent)]/10 shadow-[0_0_10px_var(--accent-glow)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-5 w-5 text-[var(--accent)]" />
                        <h4 className="font-semibold text-[var(--accent)]">Agent WHERE</h4>
                      </div>
                      <p className="text-sm text-[var(--text-primary)]">
                        <strong>Venue + Monitoring</strong> — Routes to the best venue, executes trades, monitors positions 24/7, manages exits.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                    <h4 className="font-semibold mb-2 text-[var(--text-primary)]">Why Three Agents?</h4>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Traditional copy trading fails because it copies <strong>exact trades</strong> and assumes you're the same trader. 
                      Maxxit separates the <strong className="text-[var(--accent)]">intelligence</strong> (the idea) from the <strong className="text-[var(--accent)]">execution</strong> (your style).
                      You get the alpha, but trade it your way.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Agent WHAT */}
            <section id="agent-what" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Target className="h-6 w-6 text-[var(--accent)]" />
                    Agent WHAT — Signal Selection
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Picking the right signals to trade
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Humans start with trust. You follow certain accounts or groups because you believe they move markets.
                    Agent WHAT does two things that make this programmable:
                  </p>

                  <div className="space-y-4">
                    <div className="p-4 border border-[var(--border)] rounded bg-[var(--bg-elevated)]">
                      <h4 className="font-semibold text-[var(--accent)] mb-2">1. Benchmark Sources by Performance</h4>
                      <p className="text-sm text-[var(--text-primary)]">
                        Maxxit tracks outcomes over time and scores sources by their realized impact. So instead of "who's loud," 
                        you get <strong className="text-[var(--accent)]">"who's right often enough to matter."</strong>
                      </p>
                    </div>

                    <div className="p-4 border border-[var(--border)] rounded bg-[var(--bg-elevated)]">
                      <h4 className="font-semibold text-[var(--accent)] mb-2">2. Convert Human Alpha into Objective Trade Parameters</h4>
                      <p className="text-sm text-[var(--text-primary)] mb-3">
                        This is the bridge most systems miss. Maxxit turns messy human content (tweets, notes, calls) into structured intent:
                      </p>
                      <ul className="space-y-1 text-sm text-[var(--text-secondary)] ml-4">
                        <li>• Asset + direction</li>
                        <li>• Strength/conviction</li>
                        <li>• Suggested horizon</li>
                        <li>• Risk cues (tight vs wide invalidation)</li>
                        <li>• Confidence signal for downstream sizing</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold text-[var(--accent)] mb-2">Why Deterministic AI Matters</h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      If an agent reads the same post today and tomorrow, it should label it the <strong className="text-[var(--accent)]">same way</strong> if nothing changed.
                      That's what deterministic AI gives you: consistent decisions instead of "AI mood swings."
                    </p>
                    <ul className="space-y-1 text-sm text-[var(--text-secondary)] mt-3 ml-4">
                      <li>✓ Outputs are reproducible</li>
                      <li>✓ Behavior becomes predictable</li>
                      <li>✓ Debugging becomes possible</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Agent HOW */}
            <section id="agent-how" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <BarChart3 className="h-6 w-6 text-[var(--accent)]" />
                    Agent HOW — Your Trading Clone
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Execute trades your way
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Even if two people agree on a trade, they won't trade it the same way. One uses 2% size. Another uses 10% with leverage.
                    One scalps. Another holds.
                  </p>

                  <div className="bg-[var(--danger)]/10 p-4 rounded border border-[var(--danger)]/30">
                    <p className="text-sm text-[var(--text-primary)]">
                      That's why traditional copy trading breaks: it copies <strong className="text-[var(--danger)]">exact trades</strong> and assumes you're the same trader.
                    </p>
                  </div>

                  <p className="text-[var(--text-primary)] font-semibold">
                    Maxxit does something more natural:
                  </p>
                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <p className="text-[var(--text-primary)]">
                      It copies the <strong className="text-[var(--accent)]">intelligence</strong> (the idea) but executes it through <strong className="text-[var(--accent)]">your style</strong>.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Agent HOW becomes your Trading Clone:</h4>
                    <ul className="space-y-2 text-[var(--text-primary)]">
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Position sizing tuned to your risk tolerance</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Leverage/exposure aligned to your preferences</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Market + on-chain context awareness</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Consistent execution without emotional drift</span>
                      </li>
                    </ul>
                  </div>

                  <p className="text-[var(--text-secondary)] italic">
                    So you're not copying someone's exact trade. You're copying their <strong className="text-[var(--accent)]">edge</strong> — then trading it like you.
                  </p>
                </CardContent>
              </Card>
            </section>

            {/* Agent WHERE */}
            <section id="agent-where" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Zap className="h-6 w-6 text-[var(--accent)]" />
                    Agent WHERE — Venue + Monitoring
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Best execution and 24/7 position management
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">Execution matters:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                      <span className="text-[var(--text-primary)]">Slippage</span>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                      <span className="text-[var(--text-primary)]">Liquidity</span>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                      <span className="text-[var(--text-primary)]">Fees</span>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                      <span className="text-[var(--text-primary)]">Liquidation Risk</span>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center col-span-2">
                      <span className="text-[var(--text-primary)]">Exits You Can't Manage Offline</span>
                    </div>
                  </div>

                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <p className="text-[var(--text-primary)]">
                      <strong className="text-[var(--accent)]">Agent WHERE</strong> routes to the best venue available (primarily Ostium) and monitors positions continuously — 
                      protecting exits and preventing "I forgot to check" liquidations.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Key Capabilities:</h4>
                    <ul className="space-y-2 text-[var(--text-primary)]">
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Automatic venue selection based on liquidity and fees</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>24/7 position monitoring with real-time price tracking</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Intelligent stop-loss and take-profit execution</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[var(--accent)]">✓</span>
                        <span>Liquidation prevention through proactive monitoring</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Ostium Trading */}
            <section id="ostium" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 hover:border-[var(--accent)]/50 transition-colors shadow-[0_0_20px_var(--accent-glow)]">
                <CardHeader className="border-b border-[var(--accent)]/20">
                  <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                    <TrendingUp className="h-6 w-6" />
                    Ostium Trading
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Non-custodial perpetual trading on Arbitrum
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Maxxit primarily trades on <strong className="text-[var(--accent)]">Ostium</strong>, a high-performance perpetual DEX on Arbitrum.
                    Using an innovative agent delegation model, you can trade with leverage while maintaining 100% custody of your funds.
                  </p>

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--accent)]">
                      <Lock className="h-4 w-4" />
                      Agent Delegation Model
                    </h4>
                    <p className="text-sm text-[var(--text-primary)] mb-3">
                      Unlike traditional copy trading where you transfer funds to a platform, Ostium's delegation allows agents to 
                      <strong className="text-[var(--accent)]"> trade on your behalf</strong> while funds remain in <strong className="text-[var(--accent)]">your wallet</strong>.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">Your funds stay in YOUR wallet</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">Agent can only trade, cannot withdraw funds</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">Revoke agent access anytime</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">All trades visible on Arbiscan</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">How It Works</h4>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          1
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Connect & Fund</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Connect your wallet and deposit USDC. Your funds remain in your wallet at all times.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          2
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Join Club</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Select a club from the marketplace. Maxxit assigns an agent with a dedicated trading wallet
                            to execute trades on your behalf.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          3
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Approve Club (One-Time)</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Sign a transaction approving the agent to trade on your behalf. This grants permission
                            to open/close positions but <strong className="text-[var(--accent)]">NOT to withdraw funds</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          4
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Automated Trading</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            The agent monitors signals and executes perpetual trades (BTC, ETH, commodities, forex, etc.) with leverage.
                            Revoke agent access anytime.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-semibold">Supported Markets</h4>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Ostium supports a wide range of perpetual markets including crypto, commodities, and forex:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>BTC/USD</Badge>
                      <Badge>ETH/USD</Badge>
                      <Badge>SOL/USD</Badge>
                      <Badge>XAU/USD (Gold)</Badge>
                      <Badge>XAG/USD (Silver)</Badge>
                      <Badge>EUR/USD</Badge>
                      <Badge>GBP/USD</Badge>
                      <Badge>And more...</Badge>
                    </div>
                  </div>

                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">⚡ Key Features</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-xl font-bold text-[var(--accent)]">Up to 100x</div>
                        <div className="text-xs text-[var(--text-secondary)]">Leverage</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-[var(--accent)]">24/7</div>
                        <div className="text-xs text-[var(--text-secondary)]">Monitoring</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-[var(--accent)]">~5s</div>
                        <div className="text-xs text-[var(--text-secondary)]">Trade Execution</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-[var(--accent)]">100%</div>
                        <div className="text-xs text-[var(--text-secondary)]">Non-Custodial</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--danger)]/10 p-4 rounded-lg border border-[var(--danger)]/30 shadow-[0_0_15px_rgba(255,68,68,0.1)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--danger)]">
                      <AlertTriangle className="h-4 w-4" />
                      Perpetual Trading Risks
                    </h4>
                    <ul className="space-y-1 text-sm text-[var(--text-primary)]">
                      <li>• <strong className="text-[var(--danger)]">Leverage Risk:</strong> Perpetuals use leverage which amplifies both gains and losses</li>
                      <li>• <strong className="text-[var(--danger)]">Liquidation Risk:</strong> Positions can be liquidated if collateral falls below maintenance margin</li>
                      <li>• <strong className="text-[var(--danger)]">Funding Rates:</strong> Long/short positions pay periodic funding fees based on market imbalance</li>
                      <li>• <strong className="text-[var(--danger)]">Market Volatility:</strong> 24/7 trading with high leverage can result in rapid losses</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Telegram Integration */}
            <section id="telegram" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <MessageSquare className="h-6 w-6 text-[var(--accent)]" />
                    Telegram Integration
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Trade and get notifications via Telegram
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Link your Telegram account to Maxxit for instant notifications and "lazy trading" workflows.
                  </p>

                  <div className="space-y-3">
                    <h4 className="font-semibold">What You Can Do</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-4 border border-[var(--border)] rounded bg-[var(--bg-elevated)]">
                        <h5 className="font-semibold mb-2 text-[var(--accent)]">📬 Get Notifications</h5>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Receive instant alerts when trades open, close, or hit stop-loss/take-profit levels.
                        </p>
                      </div>
                      <div className="p-4 border border-[var(--border)] rounded bg-[var(--bg-elevated)]">
                        <h5 className="font-semibold mb-2 text-[var(--accent)]">💬 Send Commands</h5>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Execute manual trades with natural language: "Buy BTC if bullish" or "Close my ETH position."
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold text-[var(--accent)] mb-3">The "Lazy Trader" Workflow</h4>
                    <p className="text-sm text-[var(--text-primary)] mb-3">
                      Imagine you're watching a football game and your friend mentions BTC might pump. Instead of opening charts:
                    </p>
                    <div className="bg-[var(--bg-elevated)] p-3 rounded border border-[var(--accent)]/30 font-mono text-sm mb-3">
                      <p className="text-[var(--accent)]">
                        "Hey buy BTC now if the market looks bullish and close the trade with sufficient profit"
                      </p>
                    </div>
                    <p className="text-sm text-[var(--text-primary)]">
                      This triggers the full cycle: <strong className="text-[var(--accent)]">Agent WHAT</strong> validates the signal, 
                      <strong className="text-[var(--accent)]"> Agent HOW</strong> sizes the position, and 
                      <strong className="text-[var(--accent)]"> Agent WHERE</strong> executes and monitors.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Risks & Disclaimers */}
            <section id="risks" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--danger)]/40 hover:border-[var(--danger)]/60 transition-colors shadow-[0_0_25px_rgba(255,68,68,0.15)]">
                <CardHeader className="border-b border-[var(--danger)]/20">
                  <CardTitle className="flex items-center gap-3 text-[var(--danger)]">
                    <AlertTriangle className="h-6 w-6" />
                    Risks & Disclaimers
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Critical information before you start trading
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-[var(--danger)]/10 p-5 rounded-lg border-2 border-[var(--danger)]/40 shadow-[0_0_20px_rgba(255,68,68,0.2)]">
                    <p className="font-bold mb-3 text-[var(--danger)] text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      ⚠️ HIGH RISK WARNING
                    </p>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                      <strong className="text-[var(--danger)]">Cryptocurrency trading involves substantial risk of loss.</strong> Automated trading systems can experience significant losses,
                      especially in volatile markets.                       <strong className="text-[var(--danger)]">Only invest capital you can afford to lose completely.</strong> Past performance of clubs
                      does not guarantee future results. You may lose your entire investment.
                    </p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Trading Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li><strong className="text-[var(--danger)]">Market Volatility:</strong> Crypto prices can drop 20-50%+ in minutes during flash crashes</li>
                      <li><strong className="text-[var(--danger)]">Leverage Risk:</strong> Leveraged positions amplify both gains and losses</li>
                      <li><strong className="text-[var(--danger)]">Liquidation:</strong> Positions can be liquidated if margin requirements aren't met</li>
                      <li><strong className="text-[var(--danger)]">Club Performance:</strong> Strategies may underperform or fail in certain market conditions</li>
                    </ul>
                  </div>

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Smart Contract Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li><strong className="text-[var(--danger)]">Bugs & Exploits:</strong> Smart contracts may contain undiscovered vulnerabilities</li>
                      <li><strong className="text-[var(--danger)]">Protocol Failures:</strong> Ostium or other protocols could be hacked or fail</li>
                      <li><strong className="text-[var(--danger)]">Oracle Manipulation:</strong> Price feed manipulation could lead to bad trade executions</li>
                    </ul>
                  </div>

                  <Separator />

                  <div className="bg-[var(--danger)]/10 p-4 rounded-lg border border-[var(--danger)]/30 shadow-[0_0_15px_rgba(255,68,68,0.1)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--danger)]">
                      <AlertTriangle className="h-4 w-4" />
                      CEX Comparison
                    </h4>
                    <p className="text-sm mb-2 text-[var(--text-primary)]">
                      Historically, centralized exchanges have experienced security breaches, operational failures, and insolvency events that
                      resulted in significant user fund losses. When you deposit funds to a CEX, you lose direct control.
                    </p>
                    <p className="text-sm mt-2 font-semibold text-[var(--accent)]">
                      ✅ Maxxit's Non-Custodial Advantage: If Maxxit's servers were compromised or shut down, <strong className="text-[var(--accent)]">your funds remain 100% safe
                        in your wallet</strong>. Simply revoke agent access and you retain full control.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Best Practices</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li>Start with small position sizes to test clubs</li>
                      <li>Diversify across multiple clubs and markets</li>
                      <li>Monitor your memberships via dashboard or Telegram</li>
                      <li>Review club performance before joining</li>
                      <li>Set realistic expectations — most strategies have 40-60% win rates</li>
                      <li>Revoke club access if you want to pause trading</li>
                    </ul>
                  </div>

                  <Separator />

                  <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg text-xs text-muted-foreground">
                    <h4 className="font-semibold mb-2 text-foreground">LEGAL DISCLAIMER</h4>
                    <p className="mb-2">
                      <strong>NOT FINANCIAL ADVICE:</strong> Maxxit is a software platform that provides tools for automated trading.
                      We do NOT provide financial advice, investment recommendations, or guarantees of profitability.
                    </p>
                    <p className="mb-2">
                      <strong>USER RESPONSIBILITY:</strong> You are solely responsible for your own trading decisions, risk management,
                      and any losses incurred.
                    </p>
                    <p className="mb-2">
                      <strong>NO CUSTODY:</strong> Maxxit does not custody, control, or have access to your funds at any time. Your assets
                      remain in your wallet under your exclusive control.
                    </p>
                    <p className="mb-2">
                      <strong>NO WARRANTIES:</strong> The platform is provided "AS IS" without warranties of any kind.
                    </p>
                    <p>
                      <strong>ACCEPTANCE OF RISK:</strong> By using Maxxit, you explicitly acknowledge and accept ALL risks associated with
                      cryptocurrency trading, DeFi protocols, smart contracts, and automated trading systems.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
