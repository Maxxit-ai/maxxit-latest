import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '../client/src/lib/db';
import { AgentCard } from '@components/AgentCard';
import { AgentDrawer } from '@components/AgentDrawer';
import { HyperliquidConnect } from '@components/HyperliquidConnect';
import { MultiVenueSelector } from '@components/MultiVenueSelector';
import { Bot, TrendingUp, Shield, Zap } from 'lucide-react';
import { Header } from '@components/Header';

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

  useEffect(() => {
    async function fetchAgents() {
      try {
        const data = await db.get('agents', {
          'status': 'eq.PUBLIC', // Changed from ACTIVE to PUBLIC
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

  const scrollToAgents = () => {
    document.getElementById('agents-list')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAgentClick = (agent: Agent) => {
    if (agent.venue === 'MULTI') {
      // For MULTI agents, open venue selector directly
      setMultiVenueAgent({ id: agent.id, name: agent.name });
      setMultiVenueSelectorOpen(true);
    } else {
      // For other agents, open the drawer
      setSelectedAgent(agent);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background with gradient and pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-background" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.15),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(34,197,94,0.1),transparent_50%)]" />
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2322c55e' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }} />
        </div>
        
        <div className="relative container mx-auto px-4 py-24 md:py-32 text-center">
          {/* Maxxit Logo/Brand */}
          <div className="mb-8 animate-in fade-in slide-in-from-top duration-300">
            <h2 className="text-4xl md:text-5xl font-bold text-primary mb-2" data-testid="text-brand">
              MAXXIT
            </h2>
            <div className="h-1 w-20 bg-primary/50 mx-auto" />
          </div>
          
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-6 animate-in fade-in slide-in-from-top duration-500">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Agentic DeFi Trading</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 animate-in fade-in slide-in-from-top duration-700" data-testid="text-hero-title">
            DeFi Agent Marketplace
          </h1>
          
          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-10 leading-relaxed animate-in fade-in slide-in-from-top duration-1000">
            Deploy AI-powered trading agents differentiated by real-time crypto Twitter signals 
            and technical indicators — with transparent performance tracking and gasless execution.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom duration-1000">
            <button
              onClick={scrollToAgents}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md text-base font-medium hover-elevate active-elevate-2 transition-all"
              data-testid="button-explore"
            >
              <TrendingUp className="h-4 w-4" />
              Explore Agents
            </button>
            <Link href="/create-agent">
              <button
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-white/20 bg-white/10 backdrop-blur-sm text-white rounded-md text-base font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="link-create"
              >
                <Bot className="h-4 w-4" />
                Create Agent
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Strip */}
      <section className="border-y border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center group">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Transparent PnL</h3>
              <p className="text-sm text-muted-foreground">
                Every trade tracked with full position history and real-time performance metrics
              </p>
            </div>
            <div className="flex flex-col items-center text-center group">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">AI-Powered Reasoning</h3>
              <p className="text-sm text-muted-foreground">
                Agents powered by crypto Twitter signals and technical indicators
              </p>
            </div>
            <div className="flex flex-col items-center text-center group">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Gasless Execution</h3>
              <p className="text-sm text-muted-foreground">
                Only $0.20 per trade with no gas fees — transparent pricing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Agents List */}
      <section id="agents-list" className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Active Trading Agents
            </h2>
            <p className="text-muted-foreground">
              {!loading && agents.length > 0 && `${agents.length} agents available`}
            </p>
          </div>
          <Link href="/docs">
            <button className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate transition-all" data-testid="link-docs">
              <Shield className="h-4 w-4" />
              Learn More
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="border rounded-lg p-6 space-y-4 bg-card animate-pulse">
                <div className="h-6 w-3/4 bg-muted rounded" />
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 border rounded-lg bg-destructive/5">
            <p className="text-destructive mb-4 text-lg font-semibold">{error}</p>
            <p className="text-sm text-muted-foreground mb-6">
              Make sure NEON_REST_URL and NEON_REST_TOKEN are configured in your environment
            </p>
            <Link href="/docs#getting-started">
              <button className="inline-flex items-center justify-center px-4 py-2 border border-border bg-background rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all" data-testid="button-setup-help">
                Setup Guide
              </button>
            </Link>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 border rounded-lg bg-muted/30">
            <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold text-foreground mb-2">No active agents yet</p>
            <p className="text-muted-foreground mb-6">
              Be the first to create a trading agent and start earning
            </p>
            <Link href="/create-agent">
              <button className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover-elevate active-elevate-2 transition-all" data-testid="button-create-first">
                Create Your First Agent
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, index) => (
              <div
                key={agent.id}
                className="animate-in fade-in slide-in-from-bottom duration-500"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="relative">
                  <AgentCard
                    agent={agent}
                    onClick={() => handleAgentClick(agent)}
                  />
                  {/* Hyperliquid Button Overlay - Only show for non-MULTI agents */}
                  {agent.venue !== 'MULTI' && (
                    <div className="absolute bottom-4 right-4 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setHyperliquidAgentId(agent.id);
                          setHyperliquidAgentName(agent.name);
                          setHyperliquidModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all"
                        title="Setup Hyperliquid Trading"
                      >
                        <Zap className="h-4 w-4" />
                        <span className="hidden sm:inline">Hyperliquid</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Agent Drawer */}
      {selectedAgent && (
        <AgentDrawer
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          agentVenue={selectedAgent.venue}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Hyperliquid Setup Modal */}
      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={hyperliquidAgentId}
          agentName={hyperliquidAgentName}
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => {
            console.log('Hyperliquid setup complete!');
          }}
        />
      )}

      {/* Multi-Venue Selector Modal */}
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
