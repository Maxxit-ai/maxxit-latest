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
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: [0, 0.5, 1], rootMargin: '-100px 0px -50% 0px' }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-title">Documentation</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-subtitle">
            Complete guide to Maxxit's non-custodial DeFi trading platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-sm">Contents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {sections.map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => scrollToSection(id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                      activeSection === id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover-elevate text-muted-foreground'
                    }`}
                    data-testid={`button-nav-${id}`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{title}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {/* Overview */}
            <section id="overview">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Overview
                  </CardTitle>
                  <CardDescription>What is Maxxit and how does it work?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    <strong>Maxxit</strong> is a <strong className="text-green-600">fully non-custodial</strong> DeFi trading platform 
                    that enables users to deploy AI-powered trading agents that execute trades autonomously on <strong>your own Safe wallet</strong>. 
                    Agents process multi-parameter market signals and execute trades 24/7 while you maintain complete control over your funds.
                  </p>
                  <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800 mb-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      100% Non-Custodial
                    </h4>
                    <p className="text-sm">
                      <strong>Your funds NEVER leave your Safe wallet.</strong> Maxxit cannot access, withdraw, or transfer your assets. 
                      You maintain full custody at all times through Safe's battle-tested smart contract architecture.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-md">
                      <h4 className="font-semibold mb-2">🤖 AI + Human Reasoning</h4>
                      <p className="text-sm text-muted-foreground">
                        Agents combine multi-factor analysis with performance-verified human insights for real alpha generation
                      </p>
                    </div>
                    <div className="p-4 border rounded-md">
                      <h4 className="font-semibold mb-2">⚡ Gasless Trading</h4>
                      <p className="text-sm text-muted-foreground">
                        Maxxit system pays for all gas fees. Trade with just USDC - no need to hold ETH or worry about gas management.
                      </p>
                    </div>
                    <div className="p-4 border rounded-md">
                      <h4 className="font-semibold mb-2">🔒 Your Wallet, Your Keys</h4>
                      <p className="text-sm text-muted-foreground">
                        Trades execute directly from your Safe wallet via secure modules. Revoke access anytime.
                      </p>
                    </div>
                    <div className="p-4 border rounded-md">
                      <h4 className="font-semibold mb-2">📊 Impact Factor Verified</h4>
                      <p className="text-sm text-muted-foreground">
                        Forward-tested signal sources with on-chain verified results. Similar to Kaito's mindshare, but for trading impact.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Getting Started */}
            <section id="getting-started">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Getting Started
                  </CardTitle>
                  <CardDescription>Deploy your first trading agent in minutes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ol className="list-decimal list-inside space-y-4 text-foreground">
                    <li>
                      <strong>Connect Your Safe Wallet</strong>
                      <p className="ml-6 text-sm text-muted-foreground mt-1">
                        Connect your Arbitrum Safe wallet (or create one at <a href="https://app.safe.global" target="_blank" className="text-blue-600 hover:underline">app.safe.global</a>). 
                        Fund it with USDC for trading. Gas fees are handled by Maxxit - no need to hold ETH.
                      </p>
                    </li>
                    <li>
                      <strong>Browse the Agent Marketplace</strong>
                      <p className="ml-6 text-sm text-muted-foreground mt-1">
                        Explore agents created by the community. Each agent uses multi-parameter analysis with its own unique strategy configuration. 
                        Review performance metrics, Impact Factor scores, and risk parameters before deploying.
                      </p>
                    </li>
                    <li>
                      <strong>Enable the Trading Module</strong>
                      <p className="ml-6 text-sm text-muted-foreground mt-1">
                        When you deploy an agent, you'll be prompted to enable Maxxit's trading module on your Safe. This is a <strong>one-time setup</strong> that 
                        grants limited permissions for trade execution only. The module CANNOT withdraw funds or perform any other actions.
                      </p>
                    </li>
                    <li>
                      <strong>Fund and Activate</strong>
                      <p className="ml-6 text-sm text-muted-foreground mt-1">
                        Approve USDC to the module and initialize capital tracking. Your agent will begin processing multi-parameter market signals and executing trades automatically.
                      </p>
                    </li>
                    <li>
                      <strong>Monitor via Telegram or Dashboard</strong>
                      <p className="ml-6 text-sm text-muted-foreground mt-1">
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
            <section id="non-custodial">
              <Card className="border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Lock className="h-5 w-5" />
                    Non-Custodial Model
                  </CardTitle>
                  <CardDescription>Why Maxxit can never access your funds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <h4 className="font-semibold mb-2">🔐 Zero Custody Architecture</h4>
                    <p className="text-sm">
                      Unlike centralized exchanges (CEXs) where your funds are held in the exchange's wallets, Maxxit operates in a <strong>completely non-custodial manner</strong>. 
                      Your assets remain in <strong>your Safe wallet at all times</strong>.
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
                          <p className="text-sm text-muted-foreground">
                            When you deploy an agent, you enable Maxxit's trading module on your Safe. This module has <strong>strictly limited permissions</strong>: 
                            it can ONLY execute trades via approved DEX routers (Uniswap V3). It <strong>cannot</strong> transfer tokens directly, cannot change Safe owners, 
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
                          <p className="text-sm text-muted-foreground">
                            Every trade is executed as an on-chain transaction from <strong>your Safe wallet</strong>. The module constructs swap transactions 
                            (e.g., USDC → WETH) and executes them through the Safe's <code className="bg-muted px-1 rounded">executeFromModule</code> function. 
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
                          <p className="text-sm text-muted-foreground">
                            You can <strong>revoke the module at any time</strong> via the Safe Transaction Builder at <a href="https://app.safe.global" target="_blank" className="text-blue-600 hover:underline">app.safe.global</a>. 
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
                          <p className="text-sm text-muted-foreground">
                            The module <strong>physically cannot</strong> call token <code className="bg-muted px-1 rounded">transfer()</code> functions to send your funds to external addresses. 
                            It can only interact with approved DEX routers for swaps. Profit sharing (20%) is handled on-chain during position closing, 
                            but the bulk of your funds always remain in your Safe.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold mb-2">📖 Compare: CEX vs Maxxit</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <h5 className="font-semibold text-red-600 mb-1">❌ Centralized Exchange (CEX)</h5>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>• Funds held in exchange's wallets</li>
                          <li>• Exchange controls private keys</li>
                          <li>• Risk of hacks and insolvency events</li>
                          <li>• Withdrawals can be frozen</li>
                          <li>• Must trust the platform</li>
                        </ul>
                      </div>
                      <div>
                        <h5 className="font-semibold text-green-600 mb-1">✅ Maxxit (Non-Custodial)</h5>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>• Funds remain in YOUR Safe wallet</li>
                          <li>• YOU control the private keys</li>
                          <li>• No hack risk to Maxxit = no fund loss</li>
                          <li>• Withdraw anytime, no permission needed</li>
                          <li>• Trustless, on-chain execution</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Smart Contract Risk Disclosure
                    </h4>
                    <p className="text-sm">
                      While Maxxit cannot access your funds, smart contracts (Safe, Uniswap, Maxxit module) carry inherent risks including bugs, exploits, 
                      or unforeseen vulnerabilities. Maxxit's module is open-source and follows Safe's security best practices, but <strong>no smart contract 
                      is 100% risk-free</strong>. Always use funds you can afford to lose.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Creating Agents */}
            <section id="agents">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Creating Agents
                  </CardTitle>
                  <CardDescription>Build your custom trading strategy</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    Anyone can create a trading agent on Maxxit. Agents combine <strong>multiple signal sources</strong> with advanced risk management 
                    to execute trades automatically based on market conditions. As an agent creator, you earn <strong>10% of all profits</strong> generated 
                    by your agent across all deployments.
                  </p>
                  
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mb-4">
                    <h4 className="font-semibold mb-2">🎯 The Maxxit Difference: Impact Factor Scoring</h4>
                    <p className="text-sm text-muted-foreground">
                      Unlike other platforms that rely on unverified social signals, Maxxit agents use <strong>Impact Factor-verified sources</strong>. 
                      Similar to how Kaito measures mindshare, we've developed a proprietary system to measure <strong>real trading efficacy</strong> 
                      through forward-testing with results recorded on-chain for transparency. Only sources with proven positive impact are integrated into agent decision-making.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Agent Configuration</h4>
                    <div className="space-y-3">
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">Multi-Parameter Strategy</h5>
                        <p className="text-sm text-muted-foreground">
                          Configure your agent's decision engine with multiple input sources:
                        </p>
                        <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 ml-2 space-y-1">
                          <li><strong>Performance-verified signal sources</strong> (one parameter among many)</li>
                          <li><strong>On-chain activity:</strong> liquidity, volume, whale tracking</li>
                          <li><strong>Technical indicators:</strong> momentum, volatility, trends</li>
                          <li><strong>Risk constraints:</strong> position sizing, stop-loss, take-profit</li>
                        </ul>
                      </div>
                      
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">Trading Venue</h5>
                        <p className="text-sm text-muted-foreground mb-2">
                          Currently, agents trade on <strong>SPOT</strong> venues (Uniswap V3 on Arbitrum). Agents execute swaps between USDC and supported tokens:
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
                        <p className="text-sm text-muted-foreground">
                          Set your Arbitrum wallet address to receive <strong>10% of profits</strong> from all trades executed by your agent. 
                          This is automatically distributed on-chain when positions close in profit.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                    <h4 className="font-semibold mb-2">💡 Agent Creator Economics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Your profit share:</span>
                        <span className="font-semibold">10% of all profits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Signal source profit share:</span>
                        <span className="font-semibold">10% of all profits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trader keeps:</span>
                        <span className="font-semibold text-green-600">80% of profits</span>
                      </div>
                      <Separator className="my-2" />
                      <p className="text-xs text-muted-foreground">
                        Example: If your agent generates $1,000 in profits across all deployments, you earn $100, 
                        the monitored X accounts earn $100, and traders keep $800.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Profit Sharing */}
            <section id="profit-sharing">
              <Card className="border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                    <Users className="h-5 w-5" />
                    Profit Sharing (20% Total)
                  </CardTitle>
                  <CardDescription>How profits are distributed on-chain</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    Maxxit implements an <strong>on-chain profit sharing mechanism</strong> where 20% of all realized profits are automatically distributed 
                    to agent creators and performance-verified signal sources. This incentivizes quality agent creation and rewards high-impact contributors 
                    whose insights drive profitable trades.
                  </p>
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Distribution Breakdown</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-4 border rounded-md bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                        <div className="text-2xl font-bold text-green-600 mb-1">80%</div>
                        <div className="text-sm font-semibold mb-1">Trader Keeps</div>
                        <p className="text-xs text-muted-foreground">
                          The majority of profits go to you, the trader who deployed the agent and provided the capital.
                        </p>
                      </div>
                      <div className="p-4 border rounded-md bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                        <div className="text-2xl font-bold text-purple-600 mb-1">10%</div>
                        <div className="text-sm font-semibold mb-1">Agent Creator</div>
                        <p className="text-xs text-muted-foreground">
                          Rewards the agent creator for building and maintaining the multi-parameter trading strategy.
                        </p>
                      </div>
                      <div className="p-4 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                        <div className="text-2xl font-bold text-blue-600 mb-1">10%</div>
                        <div className="text-sm font-semibold mb-1">Signal Sources</div>
                        <p className="text-xs text-muted-foreground">
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
                        <span className="text-muted-foreground">Entry:</span>
                        <span>$1,000 USDC → 0.5 WETH (fee: $0.20)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Exit:</span>
                        <span>0.5 WETH → $1,500 USDC (fee: $0.20)</span>
                      </div>
                      <div className="flex justify-between font-semibold text-green-600">
                        <span>Gross Profit:</span>
                        <span>+$500 USDC</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trade fees ($0.20 × 2):</span>
                        <span>$0.40 USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Agent creator (10%):</span>
                        <span>$50 USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Signal sources (10%):</span>
                        <span>$50 USDC</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>You Keep:</span>
                        <span className="text-green-600">$1,399.60 USDC</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Net Profit:</span>
                        <span>+$399.60 USDC (+39.96%)</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Monthly subscription:</span>
                        <span>$20 USDC (covers unlimited trades)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Important Notes
                    </h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Profit sharing is <strong>only on realized profits</strong> when positions close in profit</li>
                      <li>• Losses are 100% borne by the trader (no profit share on losses)</li>
                      <li>• Distribution happens automatically on-chain during position closing</li>
                      <li>• All transactions are verifiable on Arbiscan</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Billing & Fees */}
            <section id="billing">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Billing & Fees
                  </CardTitle>
                  <CardDescription>Transparent, performance-aligned pricing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    Maxxit uses a simple, transparent fee structure. You only pay when trades execute and when they're profitable.
                  </p>
                  <div className="space-y-3">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">Agent Subscription</h4>
                        <Badge variant="secondary">$20 USDC per month</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Monthly subscription per active agent deployment. Covers continuous monitoring, signal processing, and automated execution infrastructure. 
                        Cancel anytime with no early termination fees.
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">Trade Execution Fee</h4>
                        <Badge variant="secondary">$0.20 USDC per trade</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Charged on <strong>each trade execution</strong> (opening or closing a position). This covers gas costs and on-chain transaction processing.
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">Profit Share</h4>
                        <Badge variant="secondary">20% of profits (split 10%/10%)</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Only charged on <strong>winning trades</strong>. Calculated on realized PnL after closing the position:
                      </p>
                      <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 ml-2">
                        <li><strong>10%</strong> goes to the agent creator</li>
                        <li><strong>10%</strong> goes to Impact Factor-verified signal sources</li>
                        <li><strong>80%</strong> you keep</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>On losses:</strong> No profit share is charged. 100% of losses are borne by you.
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <h4 className="font-semibold mb-2">✅ No Hidden Fees</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
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
            <section id="wallets">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Safe Wallets
                  </CardTitle>
                  <CardDescription>Battle-tested smart contract wallet infrastructure</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    Maxxit uses <strong>Safe</strong> (formerly Gnosis Safe) wallets, the most trusted smart contract wallet in DeFi with 
                    <strong> over $100 billion</strong> secured. Safe enables automated trading while you maintain full custody.
                  </p>
                  <div className="space-y-3">
                    <h4 className="font-semibold">What is Safe?</h4>
                    <p className="text-sm text-muted-foreground">
                      Safe is a programmable smart contract wallet that supports <strong>modules</strong> - authorized contracts that can execute 
                      specific actions on behalf of the Safe. Maxxit's trading module is one such module, with strictly limited permissions to only execute DEX swaps.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-semibold">How Maxxit Uses Safe</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-foreground">
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
                        <strong>Revoke Anytime:</strong> Disable the module via Safe UI at <a href="https://app.safe.global" target="_blank" className="text-blue-600 hover:underline">app.safe.global</a>
                      </li>
                    </ol>
                  </div>
                  <Separator />
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
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
                        <a href="https://app.safe.global" target="_blank" className="text-blue-600 hover:underline">
                          Create a Safe Wallet →
                        </a>
                      </div>
                      <div>
                        <a href="https://docs.safe.global" target="_blank" className="text-blue-600 hover:underline">
                          Safe Documentation →
                        </a>
                      </div>
                      <div>
                        <a href="https://arbiscan.io" target="_blank" className="text-blue-600 hover:underline">
                          Verify Transactions on Arbiscan →
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Trading System */}
            <section id="trading">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Trading System
                  </CardTitle>
                  <CardDescription>How trades are executed and monitored</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold">What Makes Maxxit Stand Out</h4>
                    <p className="text-sm text-muted-foreground">
                      Maxxit agents represent the <strong>next evolution in DeFi trading</strong> by combining AI-powered automation with a layer of 
                      <strong> verified human reasoning</strong>. While other platforms rely solely on technical indicators or basic social sentiment, 
                      Maxxit introduces a revolutionary <strong>Impact Factor system</strong> for signal validation.
                    </p>
                    
                    <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                      <h5 className="font-semibold mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Impact Factor: Like Kaito's Mindshare, But for Trading Efficacy
                      </h5>
                      <p className="text-sm text-muted-foreground mb-2">
                        Just as Kaito pioneered <strong>mindshare analysis</strong> to measure crypto project attention, Maxxit has developed 
                        <strong> Impact Factor scoring</strong> to measure the real-time trading efficacy of signal sources.
                      </p>
                      <ul className="space-y-1 text-sm text-muted-foreground ml-4">
                        <li>• <strong>On-chain test results</strong> - forward-tested signals with results recorded on-chain for transparency</li>
                        <li>• <strong>Performance-verified sources</strong> - only signals with proven positive impact are used</li>
                        <li>• <strong>Continuous recalibration</strong> - impact scores update in real-time based on trading outcomes</li>
                        <li>• <strong>Multi-source validation</strong> - agents weight signals from multiple verified sources</li>
                      </ul>
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h5 className="font-semibold mb-2">Multi-Parameter Decision Engine</h5>
                      <p className="text-sm text-muted-foreground mb-2">
                        Maxxit agents don't just follow signals blindly. Each trade decision is processed through multiple validation layers:
                      </p>
                      <ul className="space-y-2 text-sm">
                        <li className="flex gap-2">
                          <span className="text-blue-600 font-semibold">1.</span>
                          <span><strong>Human Reasoning Layer:</strong> Performance-verified sources (one parameter among many) provide directional bias and timing cues</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-600 font-semibold">2.</span>
                          <span><strong>On-Chain Market Activity:</strong> Real-time liquidity depth, volume spikes, whale movements, and DEX flow analysis</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-600 font-semibold">3.</span>
                          <span><strong>Technical Indicators:</strong> Momentum, volatility, support/resistance levels, and trend strength confirmation</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-600 font-semibold">4.</span>
                          <span><strong>Risk Assessment:</strong> Market regime detection, correlation analysis, and portfolio-level risk constraints</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-blue-600 font-semibold">5.</span>
                          <span><strong>Execution Quality:</strong> Slippage prediction, gas optimization, and timing for minimal market impact</span>
                        </li>
                      </ul>
                    </div>
                    
                    <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                      <h5 className="font-semibold mb-2">⚡ Gasless Trading Experience</h5>
                      <p className="text-sm text-muted-foreground">
                        Unlike traditional DeFi trading where you need to manage ETH for gas fees, Maxxit provides a <strong>gasless experience</strong>. 
                        The Maxxit system sponsors all gas costs, so you only need to hold USDC for trading. 
                        No complex gas management, no transaction failures due to insufficient ETH, no need to bridge ETH to Arbitrum.
                      </p>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      All trade execution happens directly from <strong>your non-custodial Safe wallet</strong>, ensuring you maintain full control 
                      over your assets at all times while benefiting from the most sophisticated multi-parameter trading system in DeFi.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Manual Trading via Telegram</h4>
                    <p className="text-sm text-muted-foreground">
                      Link your Telegram account to execute manual trades with natural language commands:
                    </p>
                    <div className="bg-muted p-3 rounded-lg font-mono text-sm space-y-1">
                      <div>Buy 10 USDC of WETH</div>
                      <div>Close WETH</div>
                      <div>Buy 5 USDC of ARB</div>
                      <div>Status</div>
                    </div>
                    <p className="text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">
                      All tokens have verified liquidity on Uniswap V3. Swaps execute with 0.5% slippage tolerance.
                    </p>
                      </div>
                  
                  <Separator />
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Intelligent Risk Management</h4>
                    <p className="text-sm text-muted-foreground">
                      All positions are protected by advanced risk management systems that automatically monitor and exit positions to protect capital 
                      and lock in profits. The system uses dynamic trailing stops, take-profit targets, and market volatility analysis to optimize exits.
                    </p>
                    <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                      <h5 className="font-semibold text-sm mb-2">Key Features:</h5>
                      <ul className="space-y-1 text-sm text-muted-foreground">
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
            <section id="hyperliquid">
              <Card className="border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <Zap className="h-5 w-5" />
                    Hyperliquid Integration
                  </CardTitle>
                  <CardDescription>Non-custodial perpetual trading with agent delegation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-foreground">
                    Maxxit now supports <strong>Hyperliquid</strong>, a high-performance perpetual DEX, using an innovative 
                    <strong> agent delegation model</strong>. Trade with leverage while maintaining 100% custody of your funds.
                  </p>
                  
                  <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Agent Delegation Model
                    </h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Unlike traditional copy trading where you transfer funds to a platform, Hyperliquid's delegation 
                      allows agents to <strong>trade on your behalf</strong> while funds remain in <strong>your wallet</strong>.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="text-green-600 font-semibold">✓</span>
                        <span>Your funds stay in YOUR Hyperliquid wallet</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-green-600 font-semibold">✓</span>
                        <span>Agent can only trade, cannot withdraw funds</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-green-600 font-semibold">✓</span>
                        <span>Revoke agent access anytime on Hyperliquid</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-green-600 font-semibold">✓</span>
                        <span>All trades visible on Hyperliquid blockchain</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">How It Works</h4>
                    <div className="space-y-4">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                          1
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Connect Hyperliquid Wallet</h5>
                          <p className="text-sm text-muted-foreground">
                            Connect your Hyperliquid wallet (via MetaMask or other Web3 wallet) and deposit USDC. 
                            Your funds remain in your wallet at all times.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                          2
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Deploy Agent</h5>
                          <p className="text-sm text-muted-foreground">
                            Select a Hyperliquid-compatible agent from the marketplace. Maxxit creates a dedicated agent wallet 
                            (stored encrypted) that will execute trades on your behalf.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                          3
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Approve Agent (One-Time)</h5>
                          <p className="text-sm text-muted-foreground">
                            Sign a transaction on Hyperliquid approving the agent to trade on your behalf. This grants the agent 
                            permission to open/close positions but <strong>NOT to withdraw funds</strong>.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                          4
                        </div>
                        <div>
                          <h5 className="font-semibold text-sm">Automated Trading Begins</h5>
                          <p className="text-sm text-muted-foreground">
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
                        <p className="text-sm text-muted-foreground">
                          System automatically detects positions opened outside Maxxit and creates tracking records. 
                          Even manual trades on Hyperliquid get monitored for trailing stops.
                        </p>
                      </div>
                      
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">🎯 Trailing Stops (1%)</h5>
                        <p className="text-sm text-muted-foreground">
                          All positions monitored with configurable trailing stops. Default 1% trailing stop activates 
                          after +3% profit to lock in gains while letting winners run.
                        </p>
                      </div>
                      
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">🔒 Race Prevention</h5>
                        <p className="text-sm text-muted-foreground">
                          Database locks and idempotent operations prevent duplicate close attempts. Monitor instance 
                          locking ensures only one process monitors positions at a time.
                        </p>
                      </div>
                      
                      <div className="p-4 border rounded-md">
                        <h5 className="font-semibold mb-2">🔄 Self-Healing Sync</h5>
                        <p className="text-sm text-muted-foreground">
                          System automatically reconciles DB state with Hyperliquid if positions closed externally. 
                          No manual intervention needed to keep records accurate.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                    <h4 className="font-semibold mb-2">⚡ Performance Stats</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-2xl font-bold text-green-600">~2s</div>
                        <div className="text-xs text-muted-foreground">Position Discovery</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">~5s</div>
                        <div className="text-xs text-muted-foreground">Trade Execution</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">30s</div>
                        <div className="text-xs text-muted-foreground">Monitor Cycle</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">100%</div>
                        <div className="text-xs text-muted-foreground">Idempotent Ops</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                    <h4 className="font-semibold mb-2">💰 Hyperliquid Profit Sharing</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Same transparent fee model applies to Hyperliquid trades. 10% profit share collected automatically 
                      after closing profitable positions using Hyperliquid's internal USDC transfer system.
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Agent creator share:</span>
                        <span className="font-semibold">10% of profits</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You keep:</span>
                        <span className="font-semibold text-green-600">90% of profits</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        No withdrawal needed - profits stay in your Hyperliquid wallet
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Hyperliquid-Specific Risks
                    </h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• <strong>Leverage Risk:</strong> Perpetuals use leverage which amplifies both gains and losses</li>
                      <li>• <strong>Liquidation Risk:</strong> Positions can be liquidated if collateral falls below maintenance margin</li>
                      <li>• <strong>Funding Rates:</strong> Long/short positions pay periodic funding fees based on market imbalance</li>
                      <li>• <strong>Market Volatility:</strong> 24/7 trading with high leverage can result in rapid losses</li>
                      <li>• <strong>Agent Delegation:</strong> Ensure you trust the agent before approving on Hyperliquid</li>
                    </ul>
                  </div>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-semibold mb-2">📚 Learn More</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <a href="https://hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Hyperliquid Official Site →
                        </a>
                      </div>
                      <div>
                        <a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Trade on Hyperliquid →
                        </a>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                          For technical documentation on our Hyperliquid integration, see our{' '}
                        <a href="https://github.com/your-repo/HYPERLIQUID_INTEGRATION.md" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          GitHub documentation
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Risks & Disclaimers */}
            <section id="risks">
              <Card className="border-red-200 dark:border-red-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                    Risks & Disclaimers
                  </CardTitle>
                  <CardDescription>Critical information before you start trading</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="font-semibold mb-2">⚠️ HIGH RISK WARNING</p>
                    <p className="text-sm text-muted-foreground">
                      <strong>Cryptocurrency trading involves substantial risk of loss.</strong> Automated trading systems can experience significant losses, 
                      especially in volatile markets. <strong>Only invest capital you can afford to lose completely.</strong> Past performance of agents 
                      does not guarantee future results. You may lose your entire investment.
                    </p>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Trading Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                      <li><strong>Market Volatility:</strong> Crypto prices can drop 20-50%+ in minutes during flash crashes</li>
                      <li><strong>Slippage:</strong> Large trades may execute at worse prices than expected due to low liquidity</li>
                      <li><strong>Failed Signals:</strong> LLM classification may misinterpret tweets, leading to bad trades</li>
                      <li><strong>Agent Performance:</strong> Strategies may underperform or fail in certain market conditions</li>
                      <li><strong>Trailing Stop Gaps:</strong> In fast-moving markets, trailing stops may exit later than intended</li>
                    </ul>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Smart Contract Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                      <li><strong>Bugs & Exploits:</strong> Smart contracts may contain undiscovered vulnerabilities</li>
                      <li><strong>Protocol Failures:</strong> Uniswap, Safe, or other protocols could be hacked or fail</li>
                      <li><strong>Upgrade Risks:</strong> Protocol upgrades may introduce new bugs or security issues</li>
                      <li><strong>Oracle Manipulation:</strong> Price feed manipulation could lead to bad trade executions</li>
                    </ul>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Operational Risks</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                      <li><strong>Network Congestion:</strong> High Arbitrum gas fees may delay or prevent trade execution</li>
                      <li><strong>Worker Downtime:</strong> If monitoring workers fail, trailing stops may not execute</li>
                      <li><strong>API Failures:</strong> X API, LLM API, or price feed failures could disrupt trading</li>
                      <li><strong>Executor Wallet:</strong> If executor runs out of ETH for gas, trades cannot execute</li>
                    </ul>
                  </div>
                  
                  <Separator />
                  
                  <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Centralized Exchange Risks
                    </h4>
                    <p className="text-sm mb-2">
                      Historically, centralized exchanges have experienced security breaches, operational failures, and insolvency events that 
                      resulted in significant user fund losses. When you deposit funds to a centralized exchange, you lose direct control.
                    </p>
                    <p className="text-sm mt-2 font-semibold text-green-600">
                      ✅ Maxxit's Non-Custodial Advantage: If Maxxit's servers were compromised or shut down, <strong>your funds remain 100% safe 
                      in your Safe wallet</strong>. Simply revoke the module and you retain full control. No one can freeze, seize, or access your assets.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2 text-sm">
                    <h4 className="font-semibold">Best Practices</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
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

