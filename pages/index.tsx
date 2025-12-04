import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '../client/src/lib/db';
import { AgentDrawer } from '@components/AgentDrawer';
import { HyperliquidConnect } from '@components/HyperliquidConnect';
import { MultiVenueSelector } from '@components/MultiVenueSelector';

interface Agent {
  id: string;
  name: string;
  venue: string;
  apr30d: number | null;
  apr90d: number | null;
  aprSi: number | null;
  sharpe30d: number | null;
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [hyperliquidAgentId, setHyperliquidAgentId] = useState<string>('');
  const [hyperliquidAgentName, setHyperliquidAgentName] = useState<string>('');
  const [multiVenueSelectorOpen, setMultiVenueSelectorOpen] = useState(false);
  const [multiVenueAgent, setMultiVenueAgent] = useState<{ id: string; name: string } | null>(null);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const data = await db.get('agents', {
          'status': 'eq.PUBLIC',
          'order': 'apr30d.desc',
          'limit': '20',
          'select': 'id,name,venue,apr30d,apr90d,aprSi,sharpe30d',
        });
        setAgents(data || []);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, []);

  const handleAgentClick = (agent: Agent) => {
    if (agent.venue === 'MULTI') {
      setMultiVenueAgent({ id: agent.id, name: agent.name });
      setMultiVenueSelectorOpen(true);
    } else {
      setSelectedAgent(agent);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)] overflow-x-hidden">
      
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[var(--bg-deep)]/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center">
                <span className="text-accent text-lg">M</span>
        </div>
              <span className="font-display text-xl tracking-wide">MAXXIT</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm text-[var(--text-secondary)]">
              <Link href="#architecture" className="hover:text-accent transition-colors">Architecture</Link>
              <Link href="#agents" className="hover:text-accent transition-colors">Agents</Link>
              <Link href="/docs" className="hover:text-accent transition-colors">Docs</Link>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <span className="hidden sm:flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              {currentTime}
            </span>
            <Link href="/my-deployments">
              <button className="px-4 py-2 bg-accent text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] transition-colors">
                LAUNCH APP
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero - Clean, no layer boxes */}
      <section className="min-h-screen pt-16 relative flex items-center">
        <div className="absolute inset-0 bg-dots opacity-10" />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-accent opacity-[0.03] blur-[120px] rounded-full" />
        
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <p className="text-sm text-accent mb-6 tracking-widest font-mono">
            THE DECENTRALIZED TRADING ECONOMY
          </p>
          
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[0.9] mb-8">
            TRADE LIKE AN<br />
            <span className="text-accent">INSTITUTION</span>
            <span className="cursor-blink text-[var(--text-primary)]"></span>
          </h1>
          
          {/* Brief explanation */}
          <p className="max-w-3xl mx-auto mb-10 text-base md:text-lg text-[var(--text-secondary)] leading-relaxed">
            Three AI agents work together: one finds the best alpha from research institutes and crypto Twitter, 
            one becomes your 24/7 trading clone that sets position size and leverage, and one routes trades 
            to the optimal venue for gasless, non-custodial execution.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('agents');
                if (element) {
                  const headerOffset = 100;
                  const elementTop = element.offsetTop;
                  window.scrollTo({
                    top: elementTop - headerOffset,
                    behavior: 'smooth'
                  });
                } else {
                  console.error('Agents section not found');
                }
              }}
              className="group px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all"
            >
              DEPLOY AN AGENT
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
            </button>
              <button
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('architecture');
                if (element) {
                  const headerOffset = 100;
                  const elementTop = element.offsetTop;
                  window.scrollTo({
                    top: elementTop - headerOffset,
                    behavior: 'smooth'
                  });
                } else {
                  console.error('Architecture section not found');
                }
              }}
              className="px-8 py-4 border border-[var(--border)] font-bold text-lg hover:border-accent hover:text-accent transition-all"
            >
              LEARN MORE
              </button>
          </div>
          
          {/* Quick stats */}
          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            <div>
              <p className="font-display text-3xl text-accent">261</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">TRADING PAIRS</p>
            </div>
            <div>
              <p className="font-display text-3xl text-accent">24/7</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">AUTOMATED</p>
            </div>
            <div>
              <p className="font-display text-3xl text-accent">100%</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">NON-CUSTODIAL</p>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Deep Dive */}
      <section id="architecture" className="py-24 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Left - Detailed explanation */}
            <div>
              <p className="data-label mb-4">ARCHITECTURE</p>
              <h2 className="font-display text-4xl md:text-5xl mb-8">
                THREE AGENTS.<br />
                <span className="text-accent">ONE SYSTEM.</span>
              </h2>
              
              <div className="space-y-8">
                <div className="border-l-2 border-accent pl-6">
                  <h3 className="font-display text-xl mb-2">AGENT WHAT — The Alpha Layer</h3>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                    Consumes signals from curated research institutes, crypto Twitter accounts, 
                    and private Telegram channels. Uses deterministic AI to filter noise and 
                    convert high-conviction calls into executable signals. Alpha creators are 
                    ranked and paid based on realized P&L of their signals.
                  </p>
                </div>
                
                <div className="border-l-2 border-accent pl-6">
                  <h3 className="font-display text-xl mb-2">AGENT HOW — Your Trading Clone</h3>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                    A personalized AI that becomes your 24/7 trading presence. For each signal, 
                    it analyzes current market conditions, determines optimal position size, 
                    sets appropriate leverage, and manages risk parameters — all tuned to your 
                    preferences and risk tolerance.
                  </p>
                </div>
                
                <div className="border-l-2 border-accent pl-6">
                  <h3 className="font-display text-xl mb-2">AGENT WHERE — Best Execution</h3>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                    Routes each trade to the optimal venue based on liquidity, fees, and 
                    available pairs. Currently supports Hyperliquid (200+ pairs) and Ostium 
                    (61 RWA pairs including forex and commodities). Executes non-custodially 
                    through Gnosis Safe modules.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Right - Visual flow */}
            <div className="flex items-center">
              <div className="w-full border border-[var(--border)] p-8">
                <p className="data-label mb-6">SIGNAL FLOW</p>
                
                <div className="space-y-6">
                  {/* Sources */}
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <div className="w-10 h-10 border border-[var(--text-muted)] flex items-center justify-center text-xs">CT</div>
                      <div className="w-10 h-10 border border-[var(--text-muted)] flex items-center justify-center text-xs">TG</div>
                      <div className="w-10 h-10 border border-[var(--text-muted)] flex items-center justify-center text-xs">RI</div>
                    </div>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-xs text-[var(--text-muted)]">SOURCES</span>
                  </div>
                  
                  <div className="text-center text-[var(--text-muted)]">↓</div>
                  
                  {/* WHAT */}
                  <div className="border border-accent p-4 text-center">
                    <p className="text-xs text-accent mb-1">AGENT WHAT</p>
                    <p className="font-display text-lg">SIGNAL: LONG BTC</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Confidence: 87%</p>
                  </div>
                  
                  <div className="text-center text-[var(--text-muted)]">↓</div>
                  
                  {/* HOW */}
                  <div className="border border-accent p-4">
                    <p className="text-xs text-accent mb-2 text-center">AGENT HOW</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-[var(--text-muted)]">SIZE</p>
                        <p className="font-display text-lg">5%</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)]">LEVERAGE</p>
                        <p className="font-display text-lg">3x</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)]">STOP</p>
                        <p className="font-display text-lg">-5%</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center text-[var(--text-muted)]">↓</div>
                  
                  {/* WHERE */}
                  <div className="border border-accent p-4 text-center">
                    <p className="text-xs text-accent mb-1">AGENT WHERE</p>
                    <p className="font-display text-lg">→ OSTIUM</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Best execution for BTC-PERP</p>
                  </div>
                  
                  <div className="text-center text-[var(--text-muted)]">↓</div>
                  
                  {/* Result */}
                  <div className="bg-accent/10 border border-accent p-4 text-center">
                    <p className="text-xs text-accent mb-1">EXECUTED</p>
                    <p className="font-display text-lg text-accent">POSITION OPEN</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Non-custodial execution</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Create Your Own Agent */}
      <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left - Content */}
            <div>
              <p className="data-label mb-4">CREATE YOUR AGENT</p>
              <h2 className="font-display text-4xl md:text-5xl mb-6">
                COPY TRADING,<br />
                <span className="text-accent">EVOLVED.</span>
              </h2>
              <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-6">
                Traditional copy trading copies exact trades. Maxxit copies signals and intelligence 
                from traders you trust — Vitalik, research institutes, or private Telegram channels.
              </p>
              <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-8">
                Their tweets and posts become real-time signals. But you control execution: Agent HOW 
                sets position size and leverage based on your risk profile. Agent WHERE routes to the 
                optimal venue. You copy the intelligence, not the exact trade.
              </p>
              <Link href="/create-agent">
                <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all">
                  CREATE YOUR AGENT →
                </button>
              </Link>
            </div>
            
            {/* Right - Visual Example */}
            <div className="border border-[var(--border)] p-8">
              <p className="data-label mb-6">SELECT YOUR ALPHA SOURCES</p>
              
              {/* Source Selection - Prominent */}
              <div className="mb-6">
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Choose X accounts, Telegram channels, or research institutes whose signals you want to follow:
                </p>
                
                <div className="space-y-3">
                  {/* Example 1: X Account */}
                  <div className="border border-accent p-4 hover:bg-accent/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 border-2 border-accent flex items-center justify-center font-bold text-accent">
                        X
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-display text-base text-[var(--text-primary)]">@VitalikButerin</p>
                          <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30">ACTIVE</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-2">Ethereum co-founder • 5.2M followers</p>
                        <p className="text-xs text-[var(--text-secondary)] italic">
                          "His tweets about ETH upgrades become trading signals"
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Example 2: Telegram Channel */}
                  <div className="border border-accent p-4 hover:bg-accent/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 border-2 border-accent flex items-center justify-center font-bold text-accent">
                        TG
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-display text-base text-[var(--text-primary)]">Crypto Alpha Channel</p>
                          <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30">ACTIVE</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-2">Private Telegram • Premium signals</p>
                        <p className="text-xs text-[var(--text-secondary)] italic">
                          "Early calls on altcoins before they pump"
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Example 3: Research Institute */}
                  <div className="border border-accent p-4 hover:bg-accent/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 border-2 border-accent flex items-center justify-center font-bold text-accent">
                        RI
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-display text-base text-[var(--text-primary)]">DeFi Research Lab</p>
                          <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent border border-accent/30">ACTIVE</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mb-2">Research Institute • Institutional-grade analysis</p>
                        <p className="text-xs text-[var(--text-secondary)] italic">
                          "Deep research reports converted to actionable signals"
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Add More */}
                  <div className="border border-[var(--border)] border-dashed p-4 opacity-50 hover:opacity-75 transition-opacity cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 border border-[var(--text-muted)] flex items-center justify-center">
                        <span className="text-[var(--text-muted)] text-xl">+</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">Add more sources...</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Flow Arrow */}
              <div className="py-4 border-y border-[var(--border)]">
                <div className="flex items-center justify-center gap-3 text-sm text-accent">
                  <span className="text-lg">↓</span>
                  <span className="font-display">Their content becomes signals</span>
                  <span className="text-lg">↓</span>
                </div>
              </div>
              
              {/* Result */}
              <div className="mt-6 bg-accent/10 border border-accent p-6">
                <p className="text-xs text-accent mb-2 font-bold">YOUR PERSONALIZED COPY TRADING SYSTEM</p>
                <p className="text-sm text-[var(--text-primary)] mb-3">
                  Trades 24/7 based on signals from sources you selected
                </p>
                <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                  <span>• You control sizing</span>
                  <span>• You control leverage</span>
                  <span>• Best execution</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Economy */}
      <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-deep)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm text-accent mb-4 tracking-widest font-mono">THE DECENTRALIZED ECONOMY</p>
            <h2 className="font-display text-4xl md:text-5xl mb-6">
              EVERYONE GETS <span className="text-accent">PAID</span><br />
              FOR PERFORMANCE
            </h2>
            <p className="font-serif text-lg text-[var(--text-secondary)] max-w-2xl mx-auto italic">
              Alpha creators earn proportional to their signal performance. 
              You get institutional-grade execution. The system rewards merit.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-px bg-[var(--border)]">
            <div className="bg-[var(--bg-surface)] p-8">
              <p className="data-label mb-2">ALPHA CREATORS</p>
              <p className="font-display text-3xl text-accent mb-4">EARN %</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Research institutes, CT influencers, and Telegram channels 
                receive profit share based on signal performance.
              </p>
            </div>
            <div className="bg-[var(--bg-surface)] p-8">
              <p className="data-label mb-2">RETAIL TRADERS</p>
              <p className="font-display text-3xl text-accent mb-4">24/7</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Deploy once, trade forever. Your agent consumes best-in-class 
                alpha and executes while you sleep.
              </p>
              </div>
            <div className="bg-[var(--bg-surface)] p-8">
              <p className="data-label mb-2">EXECUTION</p>
              <p className="font-display text-3xl text-accent mb-4">GASLESS</p>
              <p className="text-sm text-[var(--text-secondary)]">
                Non-custodial, gasless execution. 
                No hidden costs, complete transparency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-[var(--border)] bg-[var(--bg-deep)]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {[
            { label: 'TRADING VOLUME', value: '$2.4M+', sub: 'ALL TIME' },
            { label: 'ALPHA SOURCES', value: '47', sub: 'CURATED' },
            { label: 'TRADING PAIRS', value: '261', sub: 'ACROSS VENUES' },
            { label: 'UPTIME', value: '99.9%', sub: 'RELIABILITY' },
          ].map((stat, i) => (
            <div 
              key={stat.label} 
              className={`py-10 px-6 ${i < 3 ? 'border-r border-[var(--border)]' : ''}`}
            >
              <p className="data-label mb-2">{stat.label}</p>
              <p className="data-value text-accent">{stat.value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agents Section */}
      <section id="agents" className="py-24 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 pb-8 border-b border-[var(--border)]">
          <div>
              <p className="data-label mb-4">DEPLOY NOW</p>
              <h2 className="font-display text-4xl md:text-5xl">
                LIVE <span className="text-accent">AGENTS</span>
            </h2>
              <p className="text-[var(--text-secondary)] mt-2">
                Each agent has unique alpha sources and trading strategies
            </p>
          </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[var(--text-muted)] font-mono">
                {!loading && `${agents.length} AVAILABLE`}
              </span>
              <Link href="/create-agent">
                <button className="px-4 py-2 border border-[var(--border)] text-sm hover:border-accent hover:text-accent transition-all">
                  + CREATE AGENT
            </button>
          </Link>
            </div>
        </div>

        {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border border-[var(--border)] p-8 animate-pulse">
                  <div className="h-6 w-3/4 bg-[var(--border)] mb-4" />
                  <div className="h-4 w-1/2 bg-[var(--border)] mb-8" />
                  <div className="h-16 w-1/3 bg-[var(--border)]" />
              </div>
            ))}
          </div>
        ) : error ? (
            <div className="border border-[var(--border)] p-12 text-center">
              <p className="text-[var(--danger)] mb-4 font-mono">ERROR: {error}</p>
          </div>
        ) : agents.length === 0 ? (
            <div className="border border-[var(--border)] p-16 text-center">
              <p className="font-display text-3xl mb-4">NO AGENTS YET</p>
              <p className="text-[var(--text-secondary)] mb-8">Be the first to deploy</p>
            <Link href="/create-agent">
                <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold">
                  CREATE AGENT →
              </button>
            </Link>
          </div>
        ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.map((agent, i) => (
              <div
                key={agent.id}
                  onClick={() => handleAgentClick(agent)}
                  className="border border-[var(--border)] p-6 cursor-pointer hover:border-accent transition-colors group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-display text-xl group-hover:text-accent transition-colors">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-2">
                        {agent.venue === 'MULTI' ? (
                          <span className="text-xs px-2 py-0.5 border border-accent text-accent">MULTI-VENUE</span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">{agent.venue}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[var(--text-muted)] text-xs font-mono">#{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  
                  <div className="mb-6">
                    <p className="data-label">30D RETURN</p>
                    <p className={`data-value text-3xl ${agent.apr30d && agent.apr30d > 0 ? 'text-accent' : 'text-[var(--text-muted)]'}`}>
                      {agent.apr30d != null ? `${agent.apr30d > 0 ? '+' : ''}${agent.apr30d.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                  
                  {agent.sharpe30d != null && (
                    <div className="flex justify-between text-sm mb-4">
                      <span className="text-[var(--text-muted)]">Sharpe</span>
                      <span className="font-mono">{agent.sharpe30d.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t border-[var(--border)]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        if (agent.venue === 'MULTI') {
                          setMultiVenueAgent({ id: agent.id, name: agent.name });
                          setMultiVenueSelectorOpen(true);
                        } else {
                          setHyperliquidAgentId(agent.id);
                          setHyperliquidAgentName(agent.name);
                          setHyperliquidModalOpen(true);
                        }
                        }}
                      className="w-full py-3 border border-[var(--border)] text-sm font-bold hover:bg-accent hover:text-[var(--bg-deep)] hover:border-accent transition-all"
                      >
                      DEPLOY →
                      </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="data-label mb-6">JOIN THE ECONOMY</p>
          <h2 className="font-display text-4xl md:text-6xl mb-6">
            TRADE LIKE AN<br />
            <span className="text-accent">INSTITUTION</span>
          </h2>
          <p className="font-serif text-lg text-[var(--text-secondary)] italic mb-10 max-w-xl mx-auto">
            Best-in-class alpha. 24/7 automated execution. 
            Non-custodial. Transparent. Decentralized.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="#agents">
              <button className="px-8 py-4 bg-accent text-[var(--bg-deep)] font-bold text-lg hover:bg-[var(--accent-dim)] transition-all">
                GET STARTED →
              </button>
            </Link>
            <Link href="/docs">
              <button className="px-8 py-4 border border-[var(--border)] font-bold text-lg hover:border-accent hover:text-accent transition-all">
                READ DOCS
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 border border-[var(--accent)] flex items-center justify-center">
                <span className="text-accent text-sm">M</span>
              </div>
              <span className="font-display">MAXXIT</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center">
              DeFi trading involves risk. Past performance ≠ future results. Non-custodial & gasless.
            </p>
            <p className="text-xs text-[var(--text-muted)]">© 2025</p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {selectedAgent && (
        <AgentDrawer
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          agentVenue={selectedAgent.venue}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={hyperliquidAgentId}
          agentName={hyperliquidAgentName}
          agentVenue={"OSTIUM"}
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => console.log('Setup complete')}
        />
      )}

      {multiVenueSelectorOpen && multiVenueAgent && (
        <MultiVenueSelector
          agentId={multiVenueAgent.id}
          agentName={multiVenueAgent.name}
          onClose={() => {
            setMultiVenueSelectorOpen(false);
            setMultiVenueAgent(null);
          }}
          onComplete={() => {
            setMultiVenueSelectorOpen(false);
            setMultiVenueAgent(null);
          }}
        />
      )}
    </div>
  );
}
