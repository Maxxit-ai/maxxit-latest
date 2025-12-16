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
import { usePrivy } from '@privy-io/react-auth';

export default function Home() {
  const { authenticated, user } = usePrivy();
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
  const [userAgentAddresses, setUserAgentAddresses] = useState<{
    hyperliquid?: string | null;
    ostium?: string | null;
  } | null>(null);
  const [agentDeployments, setAgentDeployments] = useState<Record<string, string[]>>({}); // agentId -> enabled_venues[]
  const [ostiumDelegationStatus, setOstiumDelegationStatus] = useState<{
    hasDelegation: boolean;
    delegatedAddress: string;
    isDelegatedToAgent: boolean;
  } | null>(null);
  const [ostiumUsdcAllowance, setOstiumUsdcAllowance] = useState<{
    usdcAllowance: number;
    hasApproval: boolean;
  } | null>(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        const userWallet = authenticated && user?.wallet?.address ? user.wallet.address.toLowerCase() : null;

        // Fetch agents, user agent addresses, and deployments in parallel
        const [agentsData, addressesData, deploymentsData] = await Promise.all([
          db.get('agents', {
            status: 'eq.PUBLIC',
            order: 'apr30d.desc',
            limit: '20',
            select: 'id,name,venue,apr30d,apr90d,aprSi,sharpe30d',
          }),
          // Only fetch addresses if user is authenticated
          userWallet
            ? db.get('user_agent_addresses', {
              userWallet: `eq.${userWallet}`,
            }).catch(() => null) // Gracefully handle if no addresses exist
            : Promise.resolve(null),
          // Fetch deployments for the user to check enabled_venues per agent
          userWallet
            ? db.get('agent_deployments', {
              userWallet: `eq.${userWallet}`,
              status: 'eq.ACTIVE',
            }).catch(() => [])
            : Promise.resolve([]),
        ]);

        setAgents(agentsData || []);

        // Set user agent addresses if available (API converts snake_case to camelCase)
        if (addressesData && Array.isArray(addressesData) && addressesData.length > 0) {
          setUserAgentAddresses({
            hyperliquid: addressesData[0].hyperliquidAgentAddress || null,
            ostium: addressesData[0].ostiumAgentAddress || null,
          });
        } else if (addressesData && !Array.isArray(addressesData)) {
          // Single object returned
          setUserAgentAddresses({
            hyperliquid: addressesData.hyperliquidAgentAddress || null,
            ostium: addressesData.ostiumAgentAddress || null,
          });
        } else {
          setUserAgentAddresses(null);
        }

        // Process deployments: map agentId -> enabled_venues[]
        if (deploymentsData && Array.isArray(deploymentsData)) {
          const deploymentsMap: Record<string, string[]> = {};
          deploymentsData.forEach((deployment: any) => {
            const agentId = deployment.agentId || deployment.agent_id;
            const enabledVenues = deployment.enabledVenues || deployment.enabled_venues || [];
            if (agentId) {
              // Merge venues if multiple deployments exist for same agent
              if (!deploymentsMap[agentId]) {
                deploymentsMap[agentId] = [];
              }
              enabledVenues.forEach((venue: string) => {
                if (!deploymentsMap[agentId].includes(venue)) {
                  deploymentsMap[agentId].push(venue);
                }
              });
            }
          });
          setAgentDeployments(deploymentsMap);
        } else {
          setAgentDeployments({});
        }

        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, [authenticated, user?.wallet?.address]);

  // Fetch Ostium delegation status and USDC allowance when user has an Ostium address
  useEffect(() => {
    async function fetchOstiumStatus() {
      if (!authenticated || !user?.wallet?.address || !userAgentAddresses?.ostium) {
        return;
      }

      try {
        const [delegationResponse, allowanceResponse] = await Promise.all([
          fetch(`/api/ostium/check-delegation-status?userWallet=${user.wallet.address}&agentAddress=${userAgentAddresses.ostium}`),
          fetch(`/api/ostium/check-approval-status?userWallet=${user.wallet.address}`)
        ]);

        if (delegationResponse.ok) {
          const delegationData = await delegationResponse.json();
          setOstiumDelegationStatus({
            hasDelegation: delegationData.hasDelegation,
            delegatedAddress: delegationData.delegatedAddress,
            isDelegatedToAgent: delegationData.isDelegatedToAgent,
          });
        }

        if (allowanceResponse.ok) {
          const allowanceData = await allowanceResponse.json();
          setOstiumUsdcAllowance({
            usdcAllowance: allowanceData.usdcAllowance,
            hasApproval: allowanceData.hasApproval,
          });
        }
      } catch (error) {
        console.error('Error fetching Ostium status:', error);
      }
    }

    fetchOstiumStatus();
  }, [authenticated, user?.wallet?.address, userAgentAddresses?.ostium]);

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
        userAgentAddresses={userAgentAddresses}
        agentDeployments={agentDeployments}
        ostiumDelegationStatus={ostiumDelegationStatus}
        ostiumUsdcAllowance={ostiumUsdcAllowance}
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
              // Refresh addresses and deployments after deployment
              if (authenticated && user?.wallet?.address) {
                const userWallet = user.wallet.address.toLowerCase();
                Promise.all([
                  db.get('user_agent_addresses', {
                    userWallet: `eq.${userWallet}`,
                  }).catch(() => null),
                  db.get('agent_deployments', {
                    userWallet: `eq.${userWallet}`,
                    status: 'eq.ACTIVE',
                  }).catch(() => []),
                ]).then(([addressesData, deploymentsData]) => {
                  // Update addresses
                  if (addressesData && Array.isArray(addressesData) && addressesData.length > 0) {
                    setUserAgentAddresses({
                      hyperliquid: addressesData[0].hyperliquidAgentAddress || null,
                      ostium: addressesData[0].ostiumAgentAddress || null,
                    });
                  } else if (addressesData && !Array.isArray(addressesData)) {
                    setUserAgentAddresses({
                      hyperliquid: addressesData.hyperliquidAgentAddress || null,
                      ostium: addressesData.ostiumAgentAddress || null,
                    });
                  }

                  // Update deployments
                  if (deploymentsData && Array.isArray(deploymentsData)) {
                    const deploymentsMap: Record<string, string[]> = {};
                    deploymentsData.forEach((deployment: any) => {
                      const agentId = deployment.agentId || deployment.agent_id;
                      const enabledVenues = deployment.enabledVenues || deployment.enabled_venues || [];
                      if (agentId) {
                        if (!deploymentsMap[agentId]) {
                          deploymentsMap[agentId] = [];
                        }
                        enabledVenues.forEach((venue: string) => {
                          if (!deploymentsMap[agentId].includes(venue)) {
                            deploymentsMap[agentId].push(venue);
                          }
                        });
                      }
                    });
                    setAgentDeployments(deploymentsMap);
                  }
                });
              }
            }}
            userAgentAddresses={userAgentAddresses}
          />
        )}
      </div>
  );
}

