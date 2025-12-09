import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, BookOpen, Wallet, Shield, DollarSign, Zap, TrendingUp, AlertTriangle, Lock, Users, Twitter } from 'lucide-react';
import { Header } from '@components/Header';

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: BookOpen },
    { id: 'getting-started', title: 'Getting Started', icon: Zap },
    { id: 'non-custodial', title: 'Non-Custodial Model', icon: Lock },
    { id: 'agents', title: 'Creating Agents', icon: TrendingUp },
    { id: 'profit-sharing', title: 'Profit Sharing (20%)', icon: Users },
    { id: 'billing', title: 'Billing & Fees', icon: DollarSign },
    { id: 'wallets', title: 'Safe Wallets', icon: Shield },
    { id: 'trading', title: 'Trading System', icon: Wallet },
    { id: 'hyperliquid', title: 'Hyperliquid Integration', icon: Zap },
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
            Complete guide to Maxxit's non-custodial DeFi trading platform
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
                    <strong className="text-[var(--accent)]">Maxxit</strong> is a <strong className="text-[var(--accent)]">fully non-custodial</strong> DeFi trading platform
                    that enables users to deploy AI-powered trading agents that execute trades autonomously on <strong>your own Safe wallet</strong>.
                    Agents process multi-parameter market signals and execute trades 24/7 while you maintain complete control over your funds.
                  </p>
                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 mb-4 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--accent)]">
                      <Lock className="h-4 w-4" />
                      100% Non-Custodial
                    </h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      <strong className="text-[var(--accent)]">Your funds NEVER leave your Safe wallet.</strong> Maxxit cannot access, withdraw, or transfer your assets.
                      You maintain full custody at all times through Safe's battle-tested smart contract architecture.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">🤖 AI + Human Reasoning</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Agents combine multi-factor analysis with performance-verified human insights for real alpha generation
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">⚡ Gasless Trading</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Maxxit system pays for all gas fees. Trade with just USDC - no need to hold ETH or worry about gas management.
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">🔒 Your Wallet, Your Keys</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Trades execute directly from your Safe wallet via secure modules. Revoke access anytime.
                      </p>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-colors">
                      <h4 className="font-semibold mb-2 text-[var(--text-primary)]">📊 Impact Factor Verified</h4>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Forward-tested signal sources with on-chain verified results. Similar to Kaito's mindshare, but for trading impact.
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
                    Deploy your first trading agent in minutes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal list-inside space-y-4 text-[var(--text-primary)]">
                    <li>
                      <strong className="text-[var(--accent)]">Connect Your Safe Wallet</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Connect your Arbitrum Safe wallet (or create one at <a href="https://app.safe.global" target="_blank" className="text-[var(--accent)] hover:underline">app.safe.global</a>).
                        Fund it with USDC for trading. Gas fees are handled by Maxxit - no need to hold ETH.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Browse the Agent Marketplace</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Explore agents created by the community. Each agent uses multi-parameter analysis with its own unique strategy configuration.
                        Review performance metrics, Impact Factor scores, and risk parameters before deploying.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Enable the Trading Module</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        When you deploy an agent, you'll be prompted to enable Maxxit's trading module on your Safe. This is a <strong className="text-[var(--accent)]">one-time setup</strong> that
                        grants limited permissions for trade execution only. The module CANNOT withdraw funds or perform any other actions.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Fund and Activate</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Approve USDC to the module and initialize capital tracking. Your agent will begin processing multi-parameter market signals and executing trades automatically.
                      </p>
                    </li>
                    <li>
                      <strong className="text-[var(--accent)]">Monitor via Telegram or Dashboard</strong>
                      <p className="ml-6 text-sm text-[var(--text-secondary)] mt-1">
                        Link your Telegram to receive instant trade notifications. Use the dashboard to track open positions, PnL, and manually execute trades with commands like "Buy 10 USDC of WETH".
                      </p>
                    </li>
                  </ol>
                  <Separator />
                  <div className="flex gap-3">
                    <Link href="/create-agent">
                      <Button data-testid="button-create-agent">
                        Create Your Own Agent
                      </Button>
                    </Link>
                    <Link href="/">
                      <Button variant="outline" data-testid="button-browse-agents">
                        Browse Agents
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
                      Your assets remain in <strong className="text-[var(--accent)]">your Safe wallet at all times</strong>.
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
                          <h5 className="font-semibold text-sm">Safe Module Installation</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            When you deploy an agent, you enable Maxxit's trading module on your Safe. This module has <strong className="text-[var(--accent)]">strictly limited permissions</strong>:
                            it can ONLY execute trades via approved DEX routers (Uniswap V3). It <strong className="text-[var(--danger)]">cannot</strong> transfer tokens directly, cannot change Safe owners,
                            and cannot perform any administrative actions.
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
                            Every trade is executed as an on-chain transaction from <strong className="text-[var(--accent)]">your Safe wallet</strong>. The module constructs swap transactions
                            (e.g., USDC → WETH) and executes them through the Safe's <code className="bg-[var(--bg-elevated)] px-1 rounded text-[var(--accent)]">executeFromModule</code> function.
                            You can verify every transaction on Arbiscan.
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
                            You can <strong className="text-[var(--accent)]">revoke the module at any time</strong> via the Safe Transaction Builder at <a href="https://app.safe.global" target="_blank" className="text-[var(--accent)] hover:underline">app.safe.global</a>.
                            Once disabled, Maxxit can no longer execute trades. Your funds remain in your Safe, completely under your control.
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
                            The module <strong className="text-[var(--danger)]">physically cannot</strong> call token <code className="bg-[var(--bg-elevated)] px-1 rounded text-[var(--accent)]">transfer()</code> functions to send your funds to external addresses.
                            It can only interact with approved DEX routers for swaps. Profit sharing (20%) is handled on-chain during position closing,
                            but the bulk of your funds always remain in your Safe.
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
                          <li>• Funds remain in YOUR Safe wallet</li>
                          <li>• YOU control the private keys</li>
                          <li>• No hack risk to Maxxit = no fund loss</li>
                          <li>• Withdraw anytime, no permission needed</li>
                          <li>• Trustless, on-chain execution</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--danger)]/10 p-4 rounded-lg border border-[var(--danger)]/30 shadow-[0_0_15px_rgba(255,68,68,0.1)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--danger)]">
                      <AlertTriangle className="h-4 w-4" />
                      Smart Contract Risk Disclosure
                    </h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      While Maxxit cannot access your funds, smart contracts (Safe, Uniswap, Maxxit module) carry inherent risks including bugs, exploits,
                      or unforeseen vulnerabilities. Maxxit's module is open-source and follows Safe's security best practices, but <strong className="text-[var(--danger)]">no smart contract
                        is 100% risk-free</strong>. Always use funds you can afford to lose.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Creating Agents */}
            <section id="agents" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <TrendingUp className="h-6 w-6 text-[var(--accent)]" />
                    Creating Agents
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Build your custom trading strategy
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Anyone can create a trading agent on Maxxit. Agents combine <strong className="text-[var(--accent)]">multiple signal sources</strong> with advanced risk management
                    to execute trades automatically based on market conditions. As an agent creator, you earn <strong className="text-[var(--accent)]">10% of all profits</strong> generated
                    by your agent across all deployments.
                  </p>

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)] shadow-[0_0_15px_rgba(0,0,0,0.2)] mb-4">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">🎯 The Maxxit Difference: Impact Factor Scoring</h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      Unlike other platforms that rely on unverified social signals, Maxxit agents use <strong className="text-[var(--accent)]">Impact Factor-verified sources</strong>.
                      Similar to how Kaito measures mindshare, we've developed a proprietary system to measure <strong className="text-[var(--accent)]">real trading efficacy</strong>
                      through forward-testing with results recorded on-chain for transparency. Only sources with proven positive impact are integrated into agent decision-making.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Agent Configuration</h4>
                    <div className="space-y-3">
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">Multi-Parameter Strategy</h5>
                        <p className="text-sm text-[var(--text-primary)]">
                          Configure your agent's decision engine with multiple input sources:
                        </p>
                        <ul className="list-disc list-inside text-sm text-[var(--text-secondary)] mt-2 ml-2 space-y-1">
                          <li><strong>Performance-verified signal sources</strong> (one parameter among many)</li>
                          <li><strong>On-chain activity:</strong> liquidity, volume, whale tracking</li>
                          <li><strong>Technical indicators:</strong> momentum, volatility, trends</li>
                          <li><strong>Risk constraints:</strong> position sizing, stop-loss, take-profit</li>
                        </ul>
                      </div>

                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">Trading Venue</h5>
                        <p className="text-sm text-[var(--text-primary)] mb-2">
                          Currently, agents trade on <strong className="text-[var(--accent)]">SPOT</strong> venues (Uniswap V3 on Arbitrum). Agents execute swaps between USDC and supported tokens:
                        </p>
                        <div className="flex flex-wrap gap-1 text-xs">
                          <Badge variant="outline">WETH</Badge>
                          <Badge variant="outline">WBTC</Badge>
                          <Badge variant="outline">ARB</Badge>
                          <Badge variant="outline">LINK</Badge>
                          <Badge variant="outline">UNI</Badge>
                          <Badge variant="outline">GMX</Badge>
                          <Badge variant="outline">AAVE</Badge>
                          <Badge variant="outline">CRV</Badge>
                          <Badge variant="outline">LDO</Badge>
                          <Badge variant="outline">PEPE</Badge>
                          <Badge variant="outline">PENDLE</Badge>
                          <Badge variant="outline">GRT</Badge>
                          <Badge variant="outline">MATIC</Badge>
                          <Badge variant="outline">SOL</Badge>
                        </div>
                      </div>

                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">Profit Receiver</h5>
                        <p className="text-sm text-[var(--text-primary)]">
                          Set your Arbitrum wallet address to receive <strong className="text-[var(--accent)]">10% of profits</strong> from all trades executed by your agent.
                          This is automatically distributed on-chain when positions close in profit.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)] shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">💡 Agent Creator Economics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Your profit share:</span>
                        <span className="font-semibold text-[var(--accent)]">10% of all profits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Signal source profit share:</span>
                        <span className="font-semibold text-[var(--accent)]">10% of all profits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Trader keeps:</span>
                        <span className="font-semibold text-[var(--accent)]">80% of profits</span>
                      </div>
                      <Separator className="my-2" />
                      <p className="text-xs text-[var(--text-secondary)]">
                        Example: If your agent generates $1,000 in profits across all deployments, you earn $100,
                        the monitored X accounts earn $100, and traders keep $800.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Profit Sharing */}
            <section id="profit-sharing" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 hover:border-[var(--accent)]/50 transition-colors shadow-[0_0_20px_var(--accent-glow)]">
                <CardHeader className="border-b border-[var(--accent)]/20">
                  <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                    <Users className="h-6 w-6" />
                    Profit Sharing (20% Total)
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    How profits are distributed on-chain
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Maxxit implements an <strong className="text-[var(--accent)]">on-chain profit sharing mechanism</strong> where 20% of all realized profits are automatically distributed
                    to agent creators and performance-verified signal sources. This incentivizes quality agent creation and rewards high-impact contributors
                    whose insights drive profitable trades.
                  </p>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Distribution Breakdown</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-4 border rounded-md bg-[var(--accent)]/10 border-[var(--accent)]/30 shadow-[0_0_10px_var(--accent-glow)]">
                        <div className="text-2xl font-bold text-[var(--accent)] mb-1">80%</div>
                        <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]">Trader Keeps</div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          The majority of profits go to you, the trader who deployed the agent and provided the capital.
                        </p>
                      </div>
                      <div className="p-4 border rounded-md bg-[var(--accent)]/10 border-[var(--accent)]/30 shadow-[0_0_10px_var(--accent-glow)]">
                        <div className="text-2xl font-bold text-[var(--accent)] mb-1">10%</div>
                        <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]">Agent Creator</div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Rewards the agent creator for building and maintaining the multi-parameter trading strategy.
                        </p>
                      </div>
                      <div className="p-4 border rounded-md bg-[var(--accent)]/10 border-[var(--accent)]/30 shadow-[0_0_10px_var(--accent-glow)]">
                        <div className="text-2xl font-bold text-[var(--accent)] mb-1">10%</div>
                        <div className="text-sm font-semibold mb-1 text-[var(--text-primary)]">Signal Sources</div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Distributed to Impact Factor-verified sources for contributing high-efficacy market insights.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-semibold">How It Works On-Chain</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>
                        <strong>Position Opens:</strong> Your Safe wallet swaps USDC for a token (e.g., WETH). Entry price is recorded.
                      </li>
                      <li>
                        <strong>Position Monitored:</strong> The system tracks price movements and applies intelligent risk management to protect gains.
                      </li>
                      <li>
                        <strong>Position Closes:</strong> When the position exits (via risk management rules or manual close), the system calculates profit/loss.
                      </li>
                      <li>
                        <strong>Profit Distribution:</strong> If profitable, the smart contract automatically:
                        <ul className="list-disc list-inside ml-6 mt-1 text-muted-foreground">
                          <li>Sends 10% to agent creator's wallet</li>
                          <li>Sends 10% to signal source wallets (split based on Impact Factor weighting)</li>
                          <li>Keeps 80% in your Safe wallet</li>
                        </ul>
                      </li>
                      <li>
                        <strong>On Losses:</strong> No profit share is taken. 100% of the loss is borne by you (the trader).
                      </li>
                    </ol>
                  </div>

                  <Separator />

                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">📊 Example Calculation</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Entry:</span>
                        <span className="text-[var(--text-primary)]">$1,000 USDC → 0.5 WETH (fee: $0.20)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Exit:</span>
                        <span className="text-[var(--text-primary)]">0.5 WETH → $1,500 USDC (fee: $0.20)</span>
                      </div>
                      <div className="flex justify-between font-semibold text-[var(--accent)]">
                        <span>Gross Profit:</span>
                        <span>+$500 USDC</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Trade fees ($0.20 × 2):</span>
                        <span className="text-[var(--text-primary)]">$0.40 USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Agent creator (10%):</span>
                        <span className="text-[var(--accent)]">$50 USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Signal sources (10%):</span>
                        <span className="text-[var(--accent)]">$50 USDC</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span className="text-[var(--text-primary)]">You Keep:</span>
                        <span className="text-[var(--accent)]">$1,399.60 USDC</span>
                      </div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>Net Profit:</span>
                        <span className="text-[var(--accent)]">+$399.60 USDC (+39.96%)</span>
                      </div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)] mt-1">
                        <span>Monthly subscription:</span>
                        <span>$20 USDC (covers unlimited trades)</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--text-primary)]">
                      <AlertTriangle className="h-4 w-4" />
                      Important Notes
                    </h4>
                    <ul className="space-y-1 text-sm text-[var(--text-primary)]">
                      <li>• Profit sharing is <strong className="text-[var(--accent)]">only on realized profits</strong> when positions close in profit</li>
                      <li>• Losses are 100% borne by the trader (no profit share on losses)</li>
                      <li>• Distribution happens automatically on-chain during position closing</li>
                      <li>• All transactions are verifiable on Arbiscan</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Billing & Fees */}
            <section id="billing" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <DollarSign className="h-6 w-6 text-[var(--accent)]" />
                    Billing & Fees
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Transparent, performance-aligned pricing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Maxxit uses a simple, transparent fee structure. You only pay when trades execute and when they're profitable.
                  </p>
                  <div className="space-y-3">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">Agent Subscription</h4>
                        <Badge variant="secondary">$20 USDC per month</Badge>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Monthly subscription per active agent deployment. Covers continuous monitoring, signal processing, and automated execution infrastructure.
                        Cancel anytime with no early termination fees.
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">Trade Execution Fee</h4>
                        <Badge variant="secondary">$0.20 USDC per trade</Badge>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Charged on <strong className="text-[var(--accent)]">each trade execution</strong> (opening or closing a position). This covers gas costs and on-chain transaction processing.
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">Profit Share</h4>
                        <Badge variant="secondary">20% of profits (split 10%/10%)</Badge>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        Only charged on <strong className="text-[var(--accent)]">winning trades</strong>. Calculated on realized PnL after closing the position:
                      </p>
                      <ul className="list-disc list-inside text-sm text-[var(--text-secondary)] mt-2 ml-2">
                        <li><strong>10%</strong> goes to the agent creator</li>
                        <li><strong>10%</strong> goes to Impact Factor-verified signal sources</li>
                        <li><strong>80%</strong> you keep</li>
                      </ul>
                      <p className="text-xs text-[var(--text-secondary)] mt-2">
                        <strong className="text-[var(--danger)]">On losses:</strong> No profit share is charged. 100% of losses are borne by you.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">✅ No Hidden Fees</h4>
                    <ul className="space-y-1 text-sm text-[var(--text-primary)]">
                      <li>✓ No withdrawal fees</li>
                      <li>✓ No deposit fees</li>
                      <li>✓ No maker/taker fees</li>
                      <li>✓ No liquidation fees</li>
                      <li>✓ No inactivity fees</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Safe Wallets */}
            <section id="wallets" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Shield className="h-6 w-6 text-[var(--accent)]" />
                    Safe Wallets
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Battle-tested smart contract wallet infrastructure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-[var(--text-primary)]">
                    Maxxit uses <strong className="text-[var(--accent)]">Safe</strong> (formerly Gnosis Safe) wallets, the most trusted smart contract wallet in DeFi with
                    <strong className="text-[var(--accent)]"> over $100 billion</strong> secured. Safe enables automated trading while you maintain full custody.
                  </p>
                  <div className="space-y-3">
                    <h4 className="font-semibold">What is Safe?</h4>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Safe is a programmable smart contract wallet that supports <strong className="text-[var(--accent)]">modules</strong> - authorized contracts that can execute
                      specific actions on behalf of the Safe. Maxxit's trading module is one such module, with strictly limited permissions to only execute DEX swaps.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-semibold">How Maxxit Uses Safe</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text-primary)]">
                      <li>
                        <strong>Module Installation:</strong> You enable Maxxit's trading module on your Safe (one-time setup)
                      </li>
                      <li>
                        <strong>Limited Permissions:</strong> The module can ONLY call approved DEX routers (Uniswap V3) for swaps
                      </li>
                      <li>
                        <strong>No Fund Access:</strong> The module CANNOT transfer tokens, change owners, or perform admin actions
                      </li>
                      <li>
                        <strong>Trade Execution:</strong> When a signal triggers, the module constructs a swap transaction and executes it via <code className="bg-muted px-1 rounded">executeFromModule</code>
                      </li>
                      <li>
                        <strong>Revoke Anytime:</strong> Disable the module via Safe UI at <a href="https://app.safe.global" target="_blank" className="text-[var(--accent)] hover:underline">app.safe.global</a>
                      </li>
                    </ol>
                  </div>
                  <Separator />
                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--text-primary)]">
                      <Shield className="h-4 w-4 text-[var(--accent)]" />
                      Security Guarantees
                    </h4>
                    <ul className="space-y-1 text-sm">
                      <li>✓ <strong>No private key sharing</strong> - Maxxit never sees your keys</li>
                      <li>✓ <strong>Funds never leave Safe</strong> - All trades execute from your wallet</li>
                      <li>✓ <strong>Module permissions revocable</strong> - Disable access anytime</li>
                      <li>✓ <strong>Auditable execution</strong> - Every transaction visible on Arbiscan</li>
                      <li>✓ <strong>Battle-tested architecture</strong> - Safe secures $100B+ in assets</li>
                    </ul>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">🔗 Useful Links</h4>
                    <div className="space-y-1 text-sm">
                      <div>
                        <a href="https://app.safe.global" target="_blank" className="text-[var(--accent)] hover:underline">
                          Create a Safe Wallet →
                        </a>
                      </div>
                      <div>
                        <a href="https://docs.safe.global" target="_blank" className="text-[var(--accent)] hover:underline">
                          Safe Documentation →
                        </a>
                      </div>
                      <div>
                        <a href="https://arbiscan.io" target="_blank" className="text-[var(--accent)] hover:underline">
                          Verify Transactions on Arbiscan →
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Trading System */}
            <section id="trading" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <CardHeader className="border-b border-[var(--border)]">
                  <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                    <Wallet className="h-6 w-6 text-[var(--accent)]" />
                    Trading System
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    How trades are executed and monitored
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold">What Makes Maxxit Stand Out</h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      Maxxit agents represent the <strong className="text-[var(--accent)]">next evolution in DeFi trading</strong> by combining AI-powered automation with a layer of
                      <strong className="text-[var(--accent)]"> verified human reasoning</strong>. While other platforms rely solely on technical indicators or basic social sentiment,
                      Maxxit introduces a revolutionary <strong className="text-[var(--accent)]">Impact Factor system</strong> for signal validation.
                    </p>

                    <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                      <h5 className="font-semibold mb-2 flex items-center gap-2 text-[var(--accent)]">
                        <Users className="h-4 w-4" />
                        Impact Factor: Like Kaito's Mindshare, But for Trading Efficacy
                      </h5>
                      <p className="text-sm text-[var(--text-primary)] mb-2">
                        Just as Kaito pioneered <strong className="text-[var(--accent)]">mindshare analysis</strong> to measure crypto project attention, Maxxit has developed
                        <strong className="text-[var(--accent)]"> Impact Factor scoring</strong> to measure the real-time trading efficacy of signal sources.
                      </p>
                      <ul className="space-y-1 text-sm text-[var(--text-secondary)] ml-4">
                        <li>• <strong>On-chain test results</strong> - forward-tested signals with results recorded on-chain for transparency</li>
                        <li>• <strong>Performance-verified sources</strong> - only signals with proven positive impact are used</li>
                        <li>• <strong>Continuous recalibration</strong> - impact scores update in real-time based on trading outcomes</li>
                        <li>• <strong>Multi-source validation</strong> - agents weight signals from multiple verified sources</li>
                      </ul>
                    </div>

                    <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                      <h5 className="font-semibold mb-2 text-[var(--accent)]">Multi-Parameter Decision Engine</h5>
                      <p className="text-sm text-[var(--text-primary)] mb-2">
                        Maxxit agents don't just follow signals blindly. Each trade decision is processed through multiple validation layers:
                      </p>
                      <ul className="space-y-2 text-sm text-[var(--text-primary)]">
                        <li className="flex gap-2">
                          <span className="text-[var(--accent)] font-semibold">1.</span>
                          <span><strong>Human Reasoning Layer:</strong> Performance-verified sources (one parameter among many) provide directional bias and timing cues</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-[var(--accent)] font-semibold">2.</span>
                          <span><strong>On-Chain Market Activity:</strong> Real-time liquidity depth, volume spikes, whale movements, and DEX flow analysis</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-[var(--accent)] font-semibold">3.</span>
                          <span><strong>Technical Indicators:</strong> Momentum, volatility, support/resistance levels, and trend strength confirmation</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-[var(--accent)] font-semibold">4.</span>
                          <span><strong>Risk Assessment:</strong> Market regime detection, correlation analysis, and portfolio-level risk constraints</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-[var(--accent)] font-semibold">5.</span>
                          <span><strong>Execution Quality:</strong> Slippage prediction, gas optimization, and timing for minimal market impact</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                      <h5 className="font-semibold mb-2">⚡ Gasless Trading Experience</h5>
                      <p className="text-sm text-[var(--text-primary)]">
                        Unlike traditional DeFi trading where you need to manage ETH for gas fees, Maxxit provides a <strong className="text-[var(--accent)]">gasless experience</strong>.
                        The Maxxit system sponsors all gas costs, so you only need to hold USDC for trading.
                        No complex gas management, no transaction failures due to insufficient ETH, no need to bridge ETH to Arbitrum.
                      </p>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)]">
                      All trade execution happens directly from <strong className="text-[var(--accent)]">your non-custodial Safe wallet</strong>, ensuring you maintain full control
                      over your assets at all times while benefiting from the most sophisticated multi-parameter trading system in DeFi.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-semibold">Manual Trading via Telegram</h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      Link your Telegram account to execute manual trades with natural language commands:
                    </p>
                    <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
                      <div>Buy 10 USDC of WETH</div>
                      <div>Close WETH</div>
                      <div>Buy 5 USDC of ARB</div>
                      <div>Status</div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Manual trades execute from your Safe wallet with the same $0.20 per trade fee, 20% profit sharing, and automated risk management.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-semibold">Supported Tokens (Uniswap V3 Arbitrum)</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge>WETH</Badge>
                      <Badge>WBTC</Badge>
                      <Badge>ARB</Badge>
                      <Badge>LINK</Badge>
                      <Badge>UNI</Badge>
                      <Badge>GMX</Badge>
                      <Badge>AAVE</Badge>
                      <Badge>CRV</Badge>
                      <Badge>LDO</Badge>
                      <Badge>PEPE</Badge>
                      <Badge>PENDLE</Badge>
                      <Badge>GRT</Badge>
                      <Badge>MATIC</Badge>
                      <Badge>SOL</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      All tokens have verified liquidity on Uniswap V3. Swaps execute with 0.5% slippage tolerance.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-semibold">Intelligent Risk Management</h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      All positions are protected by advanced risk management systems that automatically monitor and exit positions to protect capital
                      and lock in profits. The system uses dynamic trailing stops, take-profit targets, and market volatility analysis to optimize exits.
                    </p>
                    <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                      <h5 className="font-semibold text-sm mb-2 text-[var(--accent)]">Key Features:</h5>
                      <ul className="space-y-1 text-sm text-[var(--text-primary)]">
                        <li>✓ Automated profit protection on winning trades</li>
                        <li>✓ Dynamic position sizing based on market conditions</li>
                        <li>✓ Real-time monitoring 24/7 with instant execution</li>
                        <li>✓ Adaptive exit strategies for different market regimes</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Hyperliquid Integration */}
            <section id="hyperliquid" className="scroll-mt-32">
              <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 hover:border-[var(--accent)]/50 transition-colors shadow-[0_0_20px_var(--accent-glow)]">
                <CardHeader className="border-b border-[var(--accent)]/20">
                  <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                    <Zap className="h-6 w-6" />
                    Hyperliquid Integration
                  </CardTitle>
                  <CardDescription className="text-[var(--text-secondary)] mt-2">
                    Non-custodial perpetual trading with agent delegation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    Maxxit now supports <strong>Hyperliquid</strong>, a high-performance perpetual DEX, using an innovative
                    <strong> agent delegation model</strong>. Trade with leverage while maintaining 100% custody of your funds.
                  </p>

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--accent)]">
                      <Lock className="h-4 w-4" />
                      Agent Delegation Model
                    </h4>
                    <p className="text-sm text-[var(--text-primary)] mb-3">
                      Unlike traditional copy trading where you transfer funds to a platform, Hyperliquid's delegation
                      allows agents to <strong className="text-[var(--accent)]">trade on your behalf</strong> while funds remain in <strong className="text-[var(--accent)]">your wallet</strong>.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">Your funds stay in YOUR Hyperliquid wallet</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">Agent can only trade, cannot withdraw funds</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span className="text-[var(--text-primary)]">Revoke agent access anytime on Hyperliquid</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">✓</span>
                        <span>All trades visible on Hyperliquid blockchain</span>
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
                          <h5 className="font-semibold text-sm">Connect Hyperliquid Wallet</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Connect your Hyperliquid wallet (via MetaMask or other Web3 wallet) and deposit USDC.
                            Your funds remain in your wallet at all times.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          2
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Deploy Agent</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Select a Hyperliquid-compatible agent from the marketplace. Maxxit creates a dedicated agent wallet
                            (stored encrypted) that will execute trades on your behalf.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          3
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Approve Agent (One-Time)</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            Sign a transaction on Hyperliquid approving the agent to trade on your behalf. This grants the agent
                            permission to open/close positions but <strong className="text-[var(--accent)]">NOT to withdraw funds</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--bg-deep)] flex items-center justify-center text-sm font-semibold">
                          4
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Automated Trading Begins</h5>
                          <p className="text-sm text-[var(--text-secondary)]">
                            The agent monitors market signals and executes perpetual trades (BTC, ETH, SOL, etc.) with leverage
                            directly from your wallet. You can revoke agent access anytime on Hyperliquid.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <h4 className="font-semibold">Advanced Features</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">📊 Auto Position Discovery</h5>
                        <p className="text-sm text-[var(--text-secondary)]">
                          System automatically detects positions opened outside Maxxit and creates tracking records.
                          Even manual trades on Hyperliquid get monitored for trailing stops.
                        </p>
                      </div>

                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">🎯 Trailing Stops (1%)</h5>
                        <p className="text-sm text-[var(--text-secondary)]">
                          All positions monitored with configurable trailing stops. Default 1% trailing stop activates
                          after +3% profit to lock in gains while letting winners run.
                        </p>
                      </div>

                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">🔒 Race Prevention</h5>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Database locks and idempotent operations prevent duplicate close attempts. Monitor instance
                          locking ensures only one process monitors positions at a time.
                        </p>
                      </div>

                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">🔄 Self-Healing Sync</h5>
                        <p className="text-sm text-[var(--text-secondary)]">
                          System automatically reconciles DB state with Hyperliquid if positions closed externally.
                          No manual intervention needed to keep records accurate.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">⚡ Performance Stats</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-2xl font-bold text-[var(--accent)]">~2s</div>
                        <div className="text-xs text-[var(--text-secondary)]">Position Discovery</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--accent)]">~5s</div>
                        <div className="text-xs text-[var(--text-secondary)]">Trade Execution</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--accent)]">30s</div>
                        <div className="text-xs text-[var(--text-secondary)]">Monitor Cycle</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--accent)]">100%</div>
                        <div className="text-xs text-muted-foreground">Idempotent Ops</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border)]">
                    <h4 className="font-semibold mb-2 text-[var(--accent)]">💰 Hyperliquid Profit Sharing</h4>
                    <p className="text-sm text-[var(--text-primary)] mb-3">
                      Same transparent fee model applies to Hyperliquid trades. 10% profit share collected automatically
                      after closing profitable positions using Hyperliquid's internal USDC transfer system.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Agent creator share:</span>
                        <span className="font-semibold text-[var(--accent)]">10% of profits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">You keep:</span>
                        <span className="font-semibold text-[var(--accent)]">90% of profits</span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-2">
                        No withdrawal needed - profits stay in your Hyperliquid wallet
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--danger)]/10 p-4 rounded-lg border border-[var(--danger)]/30 shadow-[0_0_15px_rgba(255,68,68,0.1)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--danger)]">
                      <AlertTriangle className="h-4 w-4" />
                      Hyperliquid-Specific Risks
                    </h4>
                    <ul className="space-y-1 text-sm text-[var(--text-primary)]">
                      <li>• <strong className="text-[var(--danger)]">Leverage Risk:</strong> Perpetuals use leverage which amplifies both gains and losses</li>
                      <li>• <strong className="text-[var(--danger)]">Liquidation Risk:</strong> Positions can be liquidated if collateral falls below maintenance margin</li>
                      <li>• <strong className="text-[var(--danger)]">Funding Rates:</strong> Long/short positions pay periodic funding fees based on market imbalance</li>
                      <li>• <strong className="text-[var(--danger)]">Market Volatility:</strong> 24/7 trading with high leverage can result in rapid losses</li>
                      <li>• <strong className="text-[var(--danger)]">Agent Delegation:</strong> Ensure you trust the agent before approving on Hyperliquid</li>
                    </ul>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">📚 Learn More</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <a href="https://hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                          Hyperliquid Official Site →
                        </a>
                      </div>
                      <div>
                        <a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                          Trade on Hyperliquid →
                        </a>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-2">
                        For technical documentation on our Hyperliquid integration, see our{' '}
                        <a href="https://github.com/your-repo/HYPERLIQUID_INTEGRATION.md" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                          GitHub documentation
                        </a>
                      </div>
                    </div>
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
                      especially in volatile markets. <strong className="text-[var(--danger)]">Only invest capital you can afford to lose completely.</strong> Past performance of agents
                      does not guarantee future results. You may lose your entire investment.
                    </p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Trading Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li><strong className="text-[var(--danger)]">Market Volatility:</strong> Crypto prices can drop 20-50%+ in minutes during flash crashes</li>
                      <li><strong className="text-[var(--danger)]">Slippage:</strong> Large trades may execute at worse prices than expected due to low liquidity</li>
                      <li><strong className="text-[var(--danger)]">Failed Signals:</strong> LLM classification may misinterpret tweets, leading to bad trades</li>
                      <li><strong className="text-[var(--danger)]">Agent Performance:</strong> Strategies may underperform or fail in certain market conditions</li>
                      <li><strong className="text-[var(--danger)]">Trailing Stop Gaps:</strong> In fast-moving markets, trailing stops may exit later than intended</li>
                    </ul>
                  </div>

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Smart Contract Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li><strong className="text-[var(--danger)]">Bugs & Exploits:</strong> Smart contracts may contain undiscovered vulnerabilities</li>
                      <li><strong className="text-[var(--danger)]">Protocol Failures:</strong> Uniswap, Safe, or other protocols could be hacked or fail</li>
                      <li><strong className="text-[var(--danger)]">Upgrade Risks:</strong> Protocol upgrades may introduce new bugs or security issues</li>
                      <li><strong className="text-[var(--danger)]">Oracle Manipulation:</strong> Price feed manipulation could lead to bad trade executions</li>
                    </ul>
                  </div>

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Operational Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li><strong className="text-[var(--danger)]">Network Congestion:</strong> High Arbitrum gas fees may delay or prevent trade execution</li>
                      <li><strong className="text-[var(--danger)]">Worker Downtime:</strong> If monitoring workers fail, trailing stops may not execute</li>
                      <li><strong className="text-[var(--danger)]">API Failures:</strong> X API, LLM API, or price feed failures could disrupt trading</li>
                      <li><strong className="text-[var(--danger)]">Executor Wallet:</strong> If executor runs out of ETH for gas, trades cannot execute</li>
                    </ul>
                  </div>

                  <Separator />

                  <div className="bg-[var(--danger)]/10 p-4 rounded-lg border border-[var(--danger)]/30 shadow-[0_0_15px_rgba(255,68,68,0.1)]">
                    <h4 className="font-semibold mb-2 flex items-center gap-2 text-[var(--danger)]">
                      <AlertTriangle className="h-4 w-4" />
                      Centralized Exchange Risks
                    </h4>
                    <p className="text-sm mb-2 text-[var(--text-primary)]">
                      Historically, centralized exchanges have experienced security breaches, operational failures, and insolvency events that
                      resulted in significant user fund losses. When you deposit funds to a centralized exchange, you lose direct control.
                    </p>
                    <p className="text-sm mt-2 font-semibold text-[var(--accent)]">
                      ✅ Maxxit's Non-Custodial Advantage: If Maxxit's servers were compromised or shut down, <strong className="text-[var(--accent)]">your funds remain 100% safe
                        in your Safe wallet</strong>. Simply revoke the module and you retain full control. No one can freeze, seize, or access your assets.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Best Practices</h4>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-primary)] ml-2">
                      <li>Start with small position sizes ($50-100 USDC) to test agents</li>
                      <li>Diversify across multiple agents and tokens</li>
                      <li>Monitor your deployments daily via dashboard or Telegram</li>
                      <li>Keep 10-20% of your Safe balance in USDC for fees</li>
                      <li>Only USDC is required - Maxxit covers all gas costs</li>
                      <li>Review agent performance and signal sources before deploying</li>
                      <li>Set realistic expectations - most strategies have 40-60% win rates</li>
                      <li>Revoke module access if you want to pause trading</li>
                    </ul>
                  </div>

                  <Separator />

                  <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg text-xs text-muted-foreground">
                    <h4 className="font-semibold mb-2 text-foreground">LEGAL DISCLAIMER</h4>
                    <p className="mb-2">
                      <strong>NOT FINANCIAL ADVICE:</strong> Maxxit is a software platform that provides tools for automated trading.
                      We do NOT provide financial advice, investment recommendations, or guarantees of profitability. All content, agents,
                      and strategies are for informational purposes only.
                    </p>
                    <p className="mb-2">
                      <strong>USER RESPONSIBILITY:</strong> You are solely responsible for your own trading decisions, risk management,
                      and any losses incurred. By using Maxxit, you acknowledge that you understand the risks of cryptocurrency trading
                      and automated trading systems.
                    </p>
                    <p className="mb-2">
                      <strong>NO CUSTODY:</strong> Maxxit does not custody, control, or have access to your funds at any time. Your assets
                      remain in your Safe wallet under your exclusive control. We are not a custodian, broker, exchange, or financial institution.
                    </p>
                    <p className="mb-2">
                      <strong>NO WARRANTIES:</strong> The platform is provided "AS IS" without warranties of any kind. We do not guarantee
                      uptime, execution quality, or freedom from bugs. Smart contracts may contain vulnerabilities.
                    </p>
                    <p className="mb-2">
                      <strong>LIMITATION OF LIABILITY:</strong> Maxxit, its creators, and contributors shall not be liable for any losses,
                      damages, or claims arising from your use of the platform, including but not limited to: trading losses, smart contract bugs,
                      protocol failures, network issues, or any other technical or operational failures.
                    </p>
                    <p className="mb-2">
                      <strong>REGULATORY COMPLIANCE:</strong> Cryptocurrency regulations vary by jurisdiction. It is YOUR responsibility to
                      ensure compliance with local laws. Maxxit is not available in restricted jurisdictions.
                    </p>
                    <p>
                      <strong>ACCEPTANCE OF RISK:</strong> By using Maxxit, you explicitly acknowledge and accept ALL risks associated with
                      cryptocurrency trading, DeFi protocols, smart contracts, and automated trading systems. You confirm that you are trading
                      with funds you can afford to lose completely.
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

