import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, BookOpen, Zap, Users, TrendingUp, Bot, Brain, Shield, MessageSquare, BarChart3, Target, Clock, CheckCircle } from 'lucide-react';
import { Header } from '@components/Header';

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-deep)] border border-[var(--border)]">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent)] mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        {/* Hero Section */}
        <article className="space-y-8">
          <header className="space-y-4">
            <Badge variant="outline" className="text-[var(--accent)] border-[var(--accent)]">
              Deep Dive
            </Badge>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-[var(--text-primary)] leading-tight">
              From Manual Trading to Trustworthy Agents: Why Maxxit Exists
            </h1>
            <p className="text-xl text-[var(--text-secondary)] leading-relaxed">
              Trading didn't start with bots or agents. It started with humans making judgment calls.
            </p>
          </header>

          {/* Intro Section */}
          <section className="prose prose-invert max-w-none">
            <p className="text-lg text-[var(--text-primary)] leading-relaxed">
              You'd track a handful of sources, build conviction, place the trade, and stay glued to the chart until exit. That workflow still works.
            </p>
            <p className="text-lg text-[var(--text-primary)] leading-relaxed">
              But in crypto, it comes at a brutal cost:
            </p>
            <ul className="space-y-2 text-[var(--text-primary)]">
              <li className="flex items-start gap-3">
                <span className="text-[var(--danger)] mt-1">•</span>
                <span>It eats time</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--danger)] mt-1">•</span>
                <span>It's emotionally expensive</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--danger)] mt-1">•</span>
                <span>You miss moves when you're offline</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--danger)] mt-1">•</span>
                <span>And even when your idea is right, execution can be sloppy</span>
              </li>
            </ul>
            
            <div className="bg-[var(--accent)]/10 p-6 rounded-lg border border-[var(--accent)]/30 my-8 shadow-[0_0_15px_var(--accent-glow)]">
              <p className="text-lg font-semibold text-[var(--accent)] mb-2">Maxxit exists to take that pain out.</p>
              <p className="text-[var(--text-primary)]">
                Maxxit is a <strong className="text-[var(--accent)]">non-custodial trading platform</strong> where AI agents handle the repetitive human actions 24/7 while you keep control. It turns signals from sources you trust into real trades, sizes them to your risk style, routes them to the best venue, and monitors positions continuously.
              </p>
            </div>
          </section>

          <Separator className="bg-[var(--border)]" />

          {/* Evolution Section */}
          <section className="space-y-6">
            <h2 className="text-3xl font-display font-bold text-[var(--text-primary)]">
              The Evolution: Humans → Bots → Agents
              <span className="block text-lg font-normal text-[var(--text-secondary)] mt-2">
                (and why trust became the missing piece)
              </span>
            </h2>

            {/* Manual Trading */}
            <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                  <Users className="h-6 w-6 text-[var(--accent)]" />
                  1) Manual Trading: Smart, but Human
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[var(--text-primary)]">Manual trading is basically three steps:</p>
                <ol className="list-decimal list-inside space-y-2 text-[var(--text-primary)] ml-4">
                  <li><strong className="text-[var(--accent)]">What</strong> to trade (pick the asset)</li>
                  <li><strong className="text-[var(--accent)]">How</strong> to trade (size, leverage, risk)</li>
                  <li><strong className="text-[var(--accent)]">Where</strong> to trade (venue + execution + monitoring)</li>
                </ol>
                <p className="text-[var(--text-primary)]">Humans are good at context and judgment. But we're also:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                    <span className="text-[var(--danger)]">Inconsistent</span>
                  </div>
                  <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                    <span className="text-[var(--danger)]">Emotional</span>
                  </div>
                  <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                    <span className="text-[var(--danger)]">Not 24/7</span>
                  </div>
                  <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center">
                    <span className="text-[var(--danger)]">Hesitant</span>
                  </div>
                </div>
                <p className="text-[var(--text-secondary)] italic">
                  That's why even good alpha often doesn't translate into good results.
                </p>
              </CardContent>
            </Card>

            {/* Bots */}
            <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                  <Bot className="h-6 w-6 text-[var(--accent)]" />
                  2) Bots: Tireless, but Static
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[var(--text-primary)]">
                  Bots solved one thing: <strong className="text-[var(--accent)]">stamina</strong>.
                </p>
                <p className="text-[var(--text-primary)]">
                  They can run all day. They don't get tired. They don't panic.
                </p>
                <p className="text-[var(--text-primary)]">
                  But bots are <strong className="text-[var(--danger)]">rigid</strong>. They follow fixed rules. They can't really understand messy, human alpha like:
                </p>
                <ul className="space-y-2 text-[var(--text-secondary)] ml-4">
                  <li>• A trader's tweet</li>
                  <li>• A research note</li>
                  <li>• A Telegram call with nuance</li>
                </ul>
                <p className="text-[var(--text-secondary)] italic">
                  So bots are consistent, but they're not great at turning "human signals" into "trade instructions."
                </p>
              </CardContent>
            </Card>

            {/* Agents */}
            <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-[var(--text-primary)]">
                  <Brain className="h-6 w-6 text-[var(--accent)]" />
                  3) Agents: Dynamic, but Hard to Trust
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[var(--text-primary)]">
                  Agents can interpret context and adapt. But most "AI agents" hit a <strong className="text-[var(--danger)]">trust problem</strong>:
                </p>
                <div className="bg-[var(--bg-elevated)] p-4 rounded border border-[var(--border)]">
                  <p className="text-[var(--text-primary)]">
                    If you feed the same market info into many AI systems twice, you might get two different answers. That randomness is fine for brainstorming. It's <strong className="text-[var(--danger)]">not fine for a system that can place trades</strong>.
                  </p>
                </div>
                <p className="text-[var(--text-primary)] font-semibold">
                  And there's a second problem people miss:
                </p>
                <p className="text-[var(--text-primary)]">
                  <strong className="text-[var(--accent)]">Trading needs objective parameters.</strong>
                </p>
                <p className="text-[var(--text-secondary)]">
                  Humans can act on vibes. Machines can't.
                </p>
                <p className="text-[var(--text-primary)]">A human can read:</p>
                <div className="bg-[var(--bg-elevated)] p-3 rounded border border-[var(--border)] italic text-[var(--text-secondary)]">
                  "This looks bullish, maybe rotate into ETH soon."
                </div>
                <p className="text-[var(--text-primary)]">…but an execution system needs something more structured:</p>
                <ul className="space-y-1 text-[var(--text-primary)] ml-4">
                  <li>• Which asset?</li>
                  <li>• Direction?</li>
                  <li>• Entry trigger?</li>
                  <li>• Invalidation point?</li>
                  <li>• Sizing rules?</li>
                  <li>• Time horizon?</li>
                </ul>
                <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 mt-4 shadow-[0_0_15px_var(--accent-glow)]">
                  <p className="text-[var(--text-primary)]">
                    If an agent can't reliably convert human alpha into objective, repeatable trade instructions, it'll either do nothing or do unpredictable things.
                  </p>
                  <p className="text-[var(--accent)] font-semibold mt-2">
                    That's where Maxxit comes in.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator className="bg-[var(--border)]" />

          {/* Three Agents Section */}
          <section className="space-y-6">
            <h2 className="text-3xl font-display font-bold text-[var(--text-primary)]">
              Maxxit Breaks Down Trading: WHAT → HOW → WHERE
            </h2>
            <p className="text-lg text-[var(--text-secondary)]">
              Maxxit covers the full trading cycle with three agents.
            </p>

            {/* Agent WHAT */}
            <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 shadow-[0_0_20px_var(--accent-glow)]">
              <CardHeader className="border-b border-[var(--accent)]/20">
                <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                  <Target className="h-6 w-6" />
                  Step 1: WHAT to Trade (Picking the Right Signals)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <p className="text-[var(--text-primary)]">
                  Humans start with trust. You follow certain accounts or groups because you believe they move markets.
                </p>
                <div className="bg-[var(--bg-elevated)] p-4 rounded border border-[var(--border)]">
                  <p className="text-[var(--text-primary)]">
                    <strong className="text-[var(--accent)]">Example:</strong> Let's say you believe Vitalik's posts influence market sentiment. In Maxxit, you can select Vitalik as a source. When he posts, Maxxit treats it as real-time signal input along with research firms and private Telegram channels.
                  </p>
                </div>
                
                <p className="text-[var(--text-primary)] font-semibold">
                  But here's the key: Maxxit doesn't just "copy tweets."
                </p>
                <p className="text-[var(--text-primary)]">It does two things that make this programmable:</p>
                
                <div className="space-y-4">
                  <div className="p-4 border border-[var(--border)] rounded bg-[var(--bg-elevated)]">
                    <h4 className="font-semibold text-[var(--accent)] mb-2">(a) Benchmark Sources by Performance</h4>
                    <p className="text-[var(--text-primary)]">
                      Maxxit tracks outcomes over time and scores sources by their realized impact. So instead of "who's loud," you get <strong className="text-[var(--accent)]">"who's right often enough to matter."</strong>
                    </p>
                  </div>
                  
                  <div className="p-4 border border-[var(--border)] rounded bg-[var(--bg-elevated)]">
                    <h4 className="font-semibold text-[var(--accent)] mb-2">(b) Convert Human Alpha into Objective Trade Parameters</h4>
                    <p className="text-[var(--text-primary)] mb-3">
                      This is the bridge most systems miss. Maxxit turns messy human content (tweets, notes, calls) into structured intent an agent can actually trade:
                    </p>
                    <ul className="space-y-1 text-[var(--text-secondary)] ml-4">
                      <li>• Asset + direction</li>
                      <li>• Strength/conviction</li>
                      <li>• Suggested horizon</li>
                      <li>• Risk cues (tight vs wide invalidation, momentum vs mean reversion)</li>
                      <li>• Confidence signal for downstream sizing</li>
                    </ul>
                    <p className="text-[var(--text-primary)] mt-3 italic">
                      So the agent isn't trading "a post." It's trading a <strong className="text-[var(--accent)]">clean instruction</strong>.
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                  <h4 className="font-semibold text-[var(--accent)] mb-2">Why Deterministic AI Matters</h4>
                  <p className="text-[var(--text-primary)]">
                    If an agent reads Vitalik's post today and labels it "bullish ETH", it should label it the <strong className="text-[var(--accent)]">same way tomorrow</strong> if nothing changed.
                  </p>
                  <p className="text-[var(--text-primary)] mt-2">
                    That's what deterministic AI gives you: <strong className="text-[var(--accent)]">consistent decisions</strong> instead of "AI mood swings."
                  </p>
                  <ul className="space-y-1 text-[var(--text-secondary)] mt-3 ml-4">
                    <li>✓ Outputs are reproducible</li>
                    <li>✓ Behavior becomes predictable</li>
                    <li>✓ Debugging becomes possible</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Agent HOW */}
            <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 shadow-[0_0_20px_var(--accent-glow)]">
              <CardHeader className="border-b border-[var(--accent)]/20">
                <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                  <BarChart3 className="h-6 w-6" />
                  Step 2: HOW to Trade (Your Trading Clone)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <p className="text-[var(--text-primary)]">
                  Even if two people agree on a trade, they won't trade it the same way.
                </p>
                <p className="text-[var(--text-secondary)]">
                  One uses 2% size. Another uses 10% with leverage. One scalps. Another holds.
                </p>
                <div className="bg-[var(--danger)]/10 p-4 rounded border border-[var(--danger)]/30">
                  <p className="text-[var(--text-primary)]">
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
                
                <p className="text-[var(--text-primary)] font-semibold mt-4">
                  AGENT HOW becomes your Trading Clone:
                </p>
                <ul className="space-y-2 text-[var(--text-primary)] ml-4">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                    <span>Position sizing tuned to your risk tolerance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                    <span>Leverage/exposure aligned to your preferences</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                    <span>Market + on-chain context awareness</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                    <span>Consistent execution without emotional drift</span>
                  </li>
                </ul>
                <p className="text-[var(--text-secondary)] italic mt-4">
                  So you're not copying someone's exact trade. You're copying their <strong className="text-[var(--accent)]">edge</strong> — then trading it like you.
                </p>
              </CardContent>
            </Card>

            {/* Agent WHERE */}
            <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 shadow-[0_0_20px_var(--accent-glow)]">
              <CardHeader className="border-b border-[var(--accent)]/20">
                <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                  <Zap className="h-6 w-6" />
                  Step 3: WHERE to Trade (Best Venue + 24/7 Monitoring)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
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
                  <div className="p-3 bg-[var(--bg-elevated)] rounded border border-[var(--border)] text-center col-span-2 md:col-span-2">
                    <span className="text-[var(--text-primary)]">Exits You Can't Manage Offline</span>
                  </div>
                </div>
                <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
                  <p className="text-[var(--text-primary)]">
                    <strong className="text-[var(--accent)]">AGENT WHERE</strong> routes to the best venue available and monitors positions continuously — protecting exits and preventing "I forgot to check" liquidations.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator className="bg-[var(--border)]" />

          {/* Proof Section */}
          <section className="space-y-6">
            <h2 className="text-3xl font-display font-bold text-[var(--text-primary)]">
              Proof It Works: 6,266 Signals Over 6 Months
              <span className="block text-lg font-normal text-[var(--text-secondary)] mt-2">
                (not theory)
              </span>
            </h2>
            
            <p className="text-lg text-[var(--text-primary)]">
              Maxxit isn't a "nice idea on paper." We validated the system on a real signal stream over a meaningful period:
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--accent)]/30 text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">6,266</div>
                <div className="text-sm text-[var(--text-secondary)]">Signals Tracked</div>
              </div>
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--accent)]/30 text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">88</div>
                <div className="text-sm text-[var(--text-secondary)]">Sources</div>
              </div>
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--accent)]/30 text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">6</div>
                <div className="text-sm text-[var(--text-secondary)]">Month Window</div>
              </div>
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--accent)]/30 text-center">
                <div className="text-2xl font-bold text-[var(--accent)]">85.9%</div>
                <div className="text-sm text-[var(--text-secondary)]">IPFS Verified</div>
              </div>
            </div>

            <p className="text-[var(--text-primary)]">
              We benchmarked performance in the exact way a user experiences the product — by "turning on" agents step-by-step:
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-[var(--text-primary)]">No Agents (Baseline)</h4>
                  <Badge variant="outline">Trade all signals equally</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[var(--text-secondary)]">Win Rate:</span>
                    <span className="ml-2 font-semibold text-[var(--text-primary)]">38.6%</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)]">Profit Factor:</span>
                    <span className="ml-2 font-semibold text-[var(--text-primary)]">1.31×</span>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--accent)]/30">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-[var(--accent)]">With AGENT HOW</h4>
                  <Badge className="bg-[var(--accent)]/20 text-[var(--accent)]">Trading Clone</Badge>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-2">Same signals, but personalized sizing/risk</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[var(--text-secondary)]">Win Rate:</span>
                    <span className="ml-2 font-semibold text-[var(--accent)]">38.6%</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)]">Profit Factor:</span>
                    <span className="ml-2 font-semibold text-[var(--accent)]">1.64×</span>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-[var(--accent)]/10 rounded border border-[var(--accent)]/50 shadow-[0_0_20px_var(--accent-glow)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-[var(--accent)]">With AGENT WHAT + AGENT HOW</h4>
                  <Badge className="bg-[var(--accent)] text-[var(--bg-deep)]">Full Stack</Badge>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-2">Benchmarked source selection + personalized execution</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[var(--text-secondary)]">Win Rate:</span>
                    <span className="ml-2 font-bold text-[var(--accent)]">43.4%</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)]">Profit Factor:</span>
                    <span className="ml-2 font-bold text-[var(--accent)]">2.29×</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Chart */}
            <div className="bg-[var(--bg-surface)] p-6 rounded-lg border border-[var(--border)]">
              <Image 
                src="/maxxit_performance_lift.png" 
                alt="Performance Lift by Agent Stack" 
                width={800} 
                height={400}
                className="w-full h-auto rounded"
              />
            </div>

            <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_15px_var(--accent-glow)]">
              <p className="text-[var(--text-primary)] font-semibold">
                <strong className="text-[var(--accent)]">Takeaway:</strong> Performance improves when the system does what humans struggle with most — source selection + disciplined sizing, continuously.
              </p>
            </div>
          </section>

          <Separator className="bg-[var(--border)]" />

          {/* Lazy Trading Section */}
          <section className="space-y-6">
            <h2 className="text-3xl font-display font-bold text-[var(--text-primary)]">
              New "Lazy Trading" Workflows Become Possible
            </h2>
            
            <p className="text-lg text-[var(--text-primary)]">
              Once trading becomes agentic and non-custodial, completely new behaviors appear.
            </p>
            
            <p className="text-[var(--text-primary)]">
              Imagine you don't want dashboards, charts, or constant monitoring. You just want one simple thing:
            </p>
            
            <div className="bg-[var(--bg-elevated)] p-4 rounded border border-[var(--border)] text-center">
              <p className="text-xl text-[var(--accent)] font-semibold italic">
                "If something important happens, trade it for me safely."
              </p>
            </div>

            <p className="text-[var(--text-primary)]">With Maxxit, you can:</p>
            <ul className="space-y-3 text-[var(--text-primary)]">
              <li className="flex items-start gap-3">
                <span className="text-[var(--accent)] font-bold">1.</span>
                <span>Drop alpha into a Telegram DM (your own notes, a forwarded call, a link, a tweet)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--accent)] font-bold">2.</span>
                <span>The system converts it into objective parameters</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--accent)] font-bold">3.</span>
                <span>AGENT WHAT validates it against benchmarked sources + context</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--accent)] font-bold">4.</span>
                <span>AGENT HOW sizes it to your preferences</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-[var(--accent)] font-bold">5.</span>
                <span>AGENT WHERE executes and monitors it</span>
              </li>
            </ul>

            <Card className="bg-[var(--bg-surface)] border-[var(--accent)]/30 shadow-[0_0_20px_var(--accent-glow)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-[var(--accent)]">
                  <MessageSquare className="h-6 w-6" />
                  The "Lazy Trader" Example
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[var(--text-primary)]">
                  You are watching a football game and your friend shares that BTC is gonna go up because blah blah blah. You trust your friend but still want a second opinion — and if that opinion turns out the same, you also want to take the trade.
                </p>
                <p className="text-[var(--text-primary)]">
                  So what you could do is text Maxxit listener agent on Telegram:
                </p>
                <div className="bg-[var(--bg-elevated)] p-4 rounded border border-[var(--accent)]/30 font-mono text-sm">
                  <p className="text-[var(--accent)]">
                    "Hey buy BTC now if the market looks bullish and close the trade with sufficient profit"
                  </p>
                </div>
                <p className="text-[var(--text-primary)]">
                  This will start the entire cycle where your text will be analysed alongside market data by <strong className="text-[var(--accent)]">Agent WHAT</strong>, which will be further passed to your <strong className="text-[var(--accent)]">Agent HOW</strong> who will decide the size, target, etc and pass it to <strong className="text-[var(--accent)]">Agent WHERE</strong> to execute the trade & monitor for exit.
                </p>
                <div className="bg-[var(--accent)]/10 p-4 rounded-lg border border-[var(--accent)]/30">
                  <p className="text-[var(--text-primary)]">
                    Here you <strong className="text-[var(--accent)]">save time</strong> of the entire process and <strong className="text-[var(--accent)]">do not miss the trade</strong>.
                  </p>
                </div>
                <p className="text-[var(--text-secondary)] italic">
                  So even a "lazy trader" can participate in markets responsibly because the system handles the hard part: turning messy human input into disciplined execution.
                </p>
              </CardContent>
            </Card>
          </section>

          <Separator className="bg-[var(--border)]" />

          {/* Why Delegate Section */}
          <section className="space-y-6">
            <h2 className="text-3xl font-display font-bold text-[var(--text-primary)]">
              Why Delegate Your Trades to Maxxit
            </h2>
            
            <p className="text-lg text-[var(--text-primary)]">
              Maxxit gives you back your <strong className="text-[var(--accent)]">time, energy, and focus</strong> — without giving up custody.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <h4 className="font-semibold text-[var(--accent)] mb-2">Stop Paying for Noise</h4>
                <p className="text-sm text-[var(--text-secondary)]">
                  Instead of subscribing to 20 Telegram groups, subscribe once to Maxxit's Alpha Clubs — a compilation of benchmarked, proven sources.
                </p>
              </div>
              
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <h4 className="font-semibold text-[var(--accent)] mb-2">Stop Doom-Scrolling X</h4>
                <p className="text-sm text-[var(--text-secondary)]">
                  Maxxit scans X and Telegram for you, filters the signal from the noise, and converts it into actionable trades.
                </p>
              </div>
              
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <h4 className="font-semibold text-[var(--accent)] mb-2">Stop Doing Endless Research</h4>
                <p className="text-sm text-[var(--text-secondary)]">
                  Maxxit consumes market research and translates it into objective trade instructions you can actually execute.
                </p>
              </div>
              
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <h4 className="font-semibold text-[var(--accent)] mb-2">Stop Rushing to Execute</h4>
                <p className="text-sm text-[var(--text-secondary)]">
                  No more opening charts in panic — Maxxit acts as your always-on trading butler, executing 24/7.
                </p>
              </div>
              
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <h4 className="font-semibold text-[var(--accent)] mb-2">Stop Venue-Hopping</h4>
                <p className="text-sm text-[var(--text-secondary)]">
                  Maxxit routes trades to the best venue automatically (fees, liquidity, slippage, pairs).
                </p>
              </div>
              
              <div className="p-4 bg-[var(--bg-surface)] rounded border border-[var(--border)] hover:border-[var(--accent)]/30 transition-colors">
                <h4 className="font-semibold text-[var(--accent)] mb-2">Stop Losing Sleep for Exits</h4>
                <p className="text-sm text-[var(--text-secondary)]">
                  Go offline — Maxxit monitors positions and manages exits timely, including liquidation prevention.
                </p>
              </div>
            </div>

            <div className="bg-[var(--accent)]/10 p-6 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_20px_var(--accent-glow)]">
              <div className="flex items-start gap-4">
                <Shield className="h-8 w-8 text-[var(--accent)] flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-[var(--accent)] mb-2">All of This Stays Non-Custodial</h4>
                  <p className="text-[var(--text-primary)]">
                    <strong className="text-[var(--accent)]">Your funds remain in your wallet.</strong>
                  </p>
                  <p className="text-[var(--text-secondary)] mt-2">
                    And it's <strong className="text-[var(--accent)]">auditable</strong>: decisions and performance trails are verifiable, not a black box.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="mt-12 text-center">
            <div className="bg-[var(--bg-surface)] p-8 rounded-lg border border-[var(--accent)]/30 shadow-[0_0_30px_var(--accent-glow)]">
              <h3 className="text-2xl font-display font-bold text-[var(--text-primary)] mb-4">
                Ready to Let Agents Handle the Hard Part?
              </h3>
              <p className="text-[var(--text-secondary)] mb-6">
                Start trading smarter with Maxxit's AI-powered, non-custodial platform.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/">
                  <button className="px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">
                    Explore Agents
                  </button>
                </Link>
                <Link href="/docs">
                  <button className="px-8 py-3 border border-[var(--accent)] text-[var(--accent)] font-bold hover:bg-[var(--accent)]/10 transition-colors">
                    Read Documentation
                  </button>
                </Link>
              </div>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
