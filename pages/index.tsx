import { useCallback, useEffect, useState } from 'react';
import { db } from '../client/src/lib/db';
import { AgentDrawer } from '@components/AgentDrawer';
import { HyperliquidConnect } from '@components/HyperliquidConnect';
import { MultiVenueSelector } from '@components/MultiVenueSelector';
import { Header } from '@components/Header';
import HeroSection from '@components/home/HeroSection';
import ArchitectureSection from '@components/home/ArchitectureSection';
import CreateAgentSection from '@components/home/CreateAgentSection';
import EconomySection from '@components/home/EconomySection';
import StatsSection from '@components/home/StatsSection';
import AgentsSection from '@components/home/AgentsSection';
import CTASection from '@components/home/CTASection';
import FooterSection from '@components/home/FooterSection';
import { AgentSummary } from '@components/home/types';

export default function Home() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [hyperliquidAgentId, setHyperliquidAgentId] = useState<string>('');
  const [hyperliquidAgentName, setHyperliquidAgentName] = useState<string>('');
  const [hyperliquidAgentVenue, setHyperliquidAgentVenue] = useState<string>('');
  const [multiVenueSelectorOpen, setMultiVenueSelectorOpen] = useState(false);
  const [multiVenueAgent, setMultiVenueAgent] = useState<{ id: string; name: string } | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const data = await db.get('agents', {
          status: 'eq.PUBLIC',
          order: 'apr30d.desc',
          limit: '20',
          select: 'id,name,venue,apr30d,apr90d,aprSi,sharpe30d',
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

  const scrollToSection = useCallback((targetId: string) => {
    const element = document.getElementById(targetId);
    if (!element) {
      console.error(`${targetId} section not found`);
      return;
    }
    const headerOffset = 100;
    const elementTop = element.offsetTop;
    window.scrollTo({
      top: elementTop - headerOffset,
      behavior: 'smooth',
    });
  }, []);

  const handleAgentClick = useCallback((agent: AgentSummary) => {
    if (agent.venue === 'MULTI') {
      setMultiVenueAgent({ id: agent.id, name: agent.name });
      setMultiVenueSelectorOpen(true);
    } else {
      setSelectedAgent(agent);
    }
  }, []);

  const handleDeployClick = useCallback((agent: AgentSummary) => {
    if (agent.venue === 'MULTI') {
      setMultiVenueAgent({ id: agent.id, name: agent.name });
      setMultiVenueSelectorOpen(true);
      return;
    }
    setHyperliquidAgentId(agent.id);
    setHyperliquidAgentName(agent.name);
    setHyperliquidAgentVenue(agent.venue);
    setHyperliquidModalOpen(true);
  }, []);

  return (
    <div className="min-h-screen border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-primary)] ">
      <div className="min-h-svh flex flex-col">
        <Header />
        <HeroSection
          onDeployScroll={() => scrollToSection('agents')}
          onLearnMoreScroll={() => scrollToSection('architecture')}
        />
      </div>

      <ArchitectureSection activeAgent={activeAgent} onHover={setActiveAgent} />
      <CreateAgentSection />
      <EconomySection />
      <StatsSection />
      <AgentsSection
        agents={agents}
        loading={loading}
        error={error}
        onCardClick={handleAgentClick}
        onDeployClick={handleDeployClick}
      />
      <CTASection />
      <FooterSection />

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
          agentVenue={hyperliquidAgentVenue || 'HYPERLIQUID'}
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

