import { useEffect, useState } from "react";
import { Header } from "@components/Header";
import GMXSetupButton from "@components/GMXSetupButton";
import { SPOTSetupButton } from "@components/SPOTSetupButton";
import { HyperliquidSetupButton } from "@components/HyperliquidSetupButton";
import { OstiumSetupButton } from "@components/OstiumSetupButton";
import { HyperliquidAgentModal } from "@components/HyperliquidAgentModal";
import { usePrivy } from "@privy-io/react-auth";
import AgentsSection from "@components/home/AgentsSection";
import { AgentDrawer } from "@components/AgentDrawer";
import { HyperliquidConnect } from "@components/HyperliquidConnect";
import { MultiVenueSelector } from "@components/MultiVenueSelector";
import { db } from "../client/src/lib/db";
import { AgentSummary } from "@components/home/types";
import {
  Wallet,
  Activity,
  MessageCircle,
  CheckCircle,
  TrendingUp,
  Settings,
  X,
  Copy,
  Zap,
  ExternalLink,
} from "lucide-react";
import { FaPlus } from "react-icons/fa6";
import { useRouter } from "next/router";

interface Deployment {
  id: string;
  agentId: string;
  agent: {
    name: string;
    venue: string;
    description: string | null;
  };
  userWallet: string;
  safeWallet: string;
  moduleEnabled: boolean;
  status: string;
  telegramLinked?: boolean;
  enabledVenues?: string[];
}

interface DeploymentStatus {
  subActive: boolean;
  enabledVenues: string[];
  riskTolerance: number;
  tradeFrequency: number;
  socialSentimentWeight: number;
  priceMomentumFocus: number;
  marketRankPriority: number;
}

export default function MyDeployments() {
  const { authenticated, user, login, ready } = usePrivy();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>("");
  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [linkCode, setLinkCode] = useState<string>("");
  const [botUsername, setBotUsername] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { tab } = router.query;

  // Initialize activeTab from query string, default to "deployments"
  const [activeTab, setActiveTab] = useState<"deployments" | "agents">(
    (tab === "agents" ? "agents" : "deployments") as "deployments" | "agents"
  );

  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [hyperliquidAgentId, setHyperliquidAgentId] = useState<string>("");
  const [hyperliquidAgentName, setHyperliquidAgentName] = useState<string>("");
  const [hyperliquidAgentVenue, setHyperliquidAgentVenue] =
    useState<string>("");
  const [hyperliquidConnectOpen, setHyperliquidConnectOpen] = useState(false);
  const [multiVenueSelectorOpen, setMultiVenueSelectorOpen] = useState(false);
  const [multiVenueAgent, setMultiVenueAgent] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);
  const [userAgentAddresses, setUserAgentAddresses] = useState<{
    hyperliquid?: string | null;
    ostium?: string | null;
  } | null>(null);
  const [agentDeployments, setAgentDeployments] = useState<
    Record<string, string[]>
  >({});
  const [ostiumDelegationStatus, setOstiumDelegationStatus] = useState<{
    hasDelegation: boolean;
    delegatedAddress: string;
    isDelegatedToAgent: boolean;
  } | null>(null);
  const [ostiumUsdcAllowance, setOstiumUsdcAllowance] = useState<{
    usdcAllowance: number;
    hasApproval: boolean;
  } | null>(null);
  const [deploymentStatuses, setDeploymentStatuses] = useState<
    Record<string, DeploymentStatus>
  >({});
  const [deploymentStatusesLoading, setDeploymentStatusesLoading] = useState<
    Record<string, boolean>
  >({});
  const [creditBalance, setCreditBalance] = useState<number>(0);

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      fetchDeployments();
    } 
  }, [authenticated, user?.wallet?.address]);

  const fetchDeployments = async () => {
    if (!user?.wallet?.address) return;
    setDeploymentsLoading(true);

    try {
      const response = await fetch(
        `/api/deployments?userWallet=${user.wallet.address}`
      );

      if (!response.ok) throw new Error("Failed to fetch deployments");

      const data = await response.json();
      const deploymentsList = Array.isArray(data) ? data : [];
      setDeployments(deploymentsList);

      if (deploymentsList.length > 0) {
        fetchDeploymentStatuses(deploymentsList);
      }
      setDeploymentsLoading(false);
    } catch (error) {
      console.error("Failed to fetch deployments:", error);
      setDeployments([]);
    } finally {
      setDeploymentsLoading(false);
    }
  };

  const fetchDeploymentStatuses = async (deployments: Deployment[]) => {
    if (!user?.wallet?.address) return;

    const userWallet = user.wallet.address;

    const statusPromises = deployments.map(async (deployment) => {
      setDeploymentStatusesLoading((prev) => ({
        ...prev,
        [deployment.id]: true,
      }));

      try {
        const response = await fetch(
          `/api/agents/${deployment.agentId}/deployments?userWallet=${encodeURIComponent(userWallet)}`
        );

        if (response.ok) {
          const statusData: DeploymentStatus = await response.json();
          setDeploymentStatuses((prev) => ({
            ...prev,
            [deployment.id]: statusData,
          }));
        } else {
          console.error(
            `Failed to fetch deployment status for ${deployment.id}`
          );
        }
      } catch (error) {
        console.error(
          `Error fetching deployment status for ${deployment.id}:`,
          error
        );
      } finally {
        setDeploymentStatusesLoading((prev) => ({
          ...prev,
          [deployment.id]: false,
        }));
      }
    });

    await Promise.all(statusPromises);
  };

  const fetchAgents = async () => {
    try {
      setAgentsLoading(true);
      const userWallet =
        authenticated && user?.wallet?.address
          ? user.wallet.address.toLowerCase()
          : null;

      const [agentsData, addressesData, deploymentsData, creditData] = await Promise.all([
        fetch("/api/agents?status=PUBLIC&order=apr30d.desc&limit=20").then(
          (res) => res.json()
        ),
        userWallet
          ? db
            .get("user_agent_addresses", {
              userWallet: `eq.${userWallet}`,
            })
            .catch(() => null)
          : Promise.resolve(null),
        userWallet
          ? db
            .get("agent_deployments", {
              userWallet: `eq.${userWallet}`,
              status: "eq.ACTIVE",
            })
            .catch(() => [])
          : Promise.resolve([]),
        // Fetch credit balance if authenticated
        userWallet
          ? fetch(`/api/user/credits/balance?wallet=${user?.wallet?.address}`).then(res => res.ok ? res.json() : { balance: 0 }).catch(() => ({ balance: 0 }))
          : Promise.resolve({ balance: 0 }),
      ]);

      setAgents(agentsData || []);
      setCreditBalance(parseFloat(creditData?.balance || '0'));

      if (addressesData && Array.isArray(addressesData) && addressesData.length) {
        setUserAgentAddresses({
          hyperliquid: addressesData[0].hyperliquidAgentAddress || null,
          ostium: addressesData[0].ostiumAgentAddress || null,
        });
      } else if (addressesData && !Array.isArray(addressesData)) {
        setUserAgentAddresses({
          hyperliquid: addressesData.hyperliquidAgentAddress || null,
          ostium: addressesData.ostiumAgentAddress || null,
        });
      } else {
        setUserAgentAddresses(null);
      }

      if (deploymentsData && Array.isArray(deploymentsData)) {
        const deploymentsMap: Record<string, string[]> = {};
        deploymentsData.forEach((deployment: any) => {
          const agentId = deployment.agentId || deployment.agent_id;
          const enabledVenues =
            deployment.enabledVenues || deployment.enabled_venues || [];

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
      } else {
        setAgentDeployments({});
      }

      setAgentsError(null);
    } catch (error: any) {
      setAgentsError(error.message || "Failed to load agents");
    } finally {
      setAgentsLoading(false);
    }
  };

  // Sync activeTab with query string
  useEffect(() => {
    if (tab === "agents" && activeTab !== "agents") {
      setActiveTab("agents");
    } else if (tab !== "agents" && activeTab !== "deployments") {
      setActiveTab("deployments");
    }
  }, [tab]);

  // Update query string when tab changes
  const handleTabChange = (newTab: "deployments" | "agents") => {
    setActiveTab(newTab);
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, tab: newTab },
      },
      undefined,
      { shallow: true }
    );
  };

  useEffect(() => {
    if (activeTab === "agents") {
      fetchAgents();
    }
  }, [activeTab, authenticated, user?.wallet?.address]);

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

  const handleConnectTelegram = (deploymentId: string) => {
    setSelectedDeploymentId(deploymentId);
    setTelegramModalOpen(true);
    setLinkCode("");
    setBotUsername("");
    setGenerating(false);
  };

  const generateLinkCode = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/telegram/generate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deploymentId: selectedDeploymentId,
          userWallet: user?.wallet?.address || "",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate link code");
      }

      const data = await response.json();
      setLinkCode(data.linkCode);
      setBotUsername(data.botUsername);
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(`/link ${linkCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAgentCardClick = (agent: AgentSummary) => {
    if (agent.venue === "MULTI") {
      setMultiVenueAgent({ id: agent.id, name: agent.name, description: agent.description });
      setMultiVenueSelectorOpen(true);
    } else {
      setSelectedAgent(agent);
    }
  };

  const handleDeployClick = (agent: AgentSummary) => {
    if (agent.venue === "MULTI") {
      setMultiVenueAgent({ id: agent.id, name: agent.name, description: agent.description });
      setMultiVenueSelectorOpen(true);
      return;
    }
    setHyperliquidAgentId(agent.id);
    setHyperliquidAgentName(agent.name);
    setHyperliquidAgentVenue(agent.venue);
    setHyperliquidConnectOpen(true);
  };

  const handleSetupHyperliquid = (agentId: string, agentName: string) => {
    setSelectedDeploymentId(agentId);
    setSelectedAgentName(agentName);
    setHyperliquidModalOpen(true);
  };

  const copyBotLink = () => {
    navigator.clipboard.writeText(`https://t.me/${botUsername}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  return (
    <div className="min-h-screen bg-[var(--bg-deep)] border border-[var(--border)]">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        {/* Header */}
        <div className="mb-6 sm:mb-12">
          <p className="data-label mb-2 text-xs sm:text-sm">DASHBOARD</p>
          <h1 className="font-display text-2xl sm:text-4xl md:text-5xl mb-3 sm:mb-4">
            {activeTab === "deployments" ? "MY DEPLOYMENTS" : "ALPHA CLUBS"}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm sm:text-base">
            {activeTab === "deployments"
              ? "Manage your agent subscriptions and connect Telegram for manual trading"
              : "Browse alpha clubs and deploy directly from your dashboard"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row mb-6 sm:mb-10 justify-between items-start sm:items-center gap-3">
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => handleTabChange("deployments")}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold border ${activeTab === "deployments"
                ? "bg-[var(--accent)] text-[var(--bg-deep)] border-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)]"
                }`}
            >
              MY DEPLOYMENTS
            </button>
            <button
              onClick={() => handleTabChange("agents")}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold border ${activeTab === "agents"
                ? "bg-[var(--accent)] text-[var(--bg-deep)] border-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)]"
                }`}
            >
              ALPHA CLUBS
            </button>
          </div>
          {
            activeTab === "agents" && (
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 uppercase px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)]"
                onClick={() => router.push("/create-agent")}>
                <FaPlus className="w-4 h-4" /> <span className="whitespace-nowrap">Create Alpha Club</span>
              </button>
            )
          }
        </div>

        {activeTab === "agents" ? (
          <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
            <AgentsSection
              agents={agents}
              loading={agentsLoading}
              error={agentsError}
              onCardClick={handleAgentCardClick}
              onDeployClick={handleDeployClick}
              userAgentAddresses={userAgentAddresses}
              agentDeployments={agentDeployments}
              ostiumDelegationStatus={ostiumDelegationStatus}
              ostiumUsdcAllowance={ostiumUsdcAllowance}
              fromHome={false}
              creditBalance={creditBalance}
              userWallet={user?.wallet?.address || ''}
            />
          </div>
        ) : !authenticated ? (
          <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-16 h-16 border border-[var(--accent)] flex items-center justify-center mb-6">
                <Wallet className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl mb-2">CONNECT WALLET</h3>
              <p className="text-[var(--text-muted)] mb-6 text-center">
                Connect your wallet to view your deployments
              </p>
              <button
                onClick={login}
                className="px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
              >
                CONNECT WALLET
              </button>
            </div>
          </div>
        ) : deploymentsLoading ? (
          <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Activity className="w-8 h-8 animate-pulse text-[var(--accent)]" />
              <p className="text-[var(--text-muted)] mt-4">Loading deployments...</p>
            </div>
          </div>
        ) : deployments.length === 0 ? (
          <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Activity className="w-12 h-12 text-[var(--text-muted)] mb-6" />
              <h3 className="font-display text-xl mb-2">NO DEPLOYMENTS</h3>
              <p className="text-[var(--text-muted)] mb-6 text-center">
                Deploy an agent to start automated trading
              </p>
              <a
                href="/"
                className="px-8 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
              >
                BROWSE AGENTS
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {deployments.map((deployment, index) => (
              <div
                key={deployment.id}
                className="border border-[var(--border)] bg-[var(--bg-surface)]"
              >
                {/* Card Header */}
                <div className="border-b border-[var(--border)] p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[var(--accent)] font-mono text-xs sm:text-sm">
                        #{String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-display text-lg sm:text-xl mt-1 break-words">
                        {deployment.agent.name}
                      </h3>
                    </div>
                    {deploymentStatusesLoading[deployment.id] ? (
                      <Activity className="w-4 h-4 animate-pulse text-[var(--accent)] flex-shrink-0" />
                    ) : deploymentStatuses[deployment.id] ? (
                      <span
                        className={`text-xs px-2 py-1 font-bold whitespace-nowrap flex-shrink-0 ${deploymentStatuses[deployment.id].subActive
                          ? "bg-[var(--accent)] text-[var(--bg-deep)]"
                          : "border border-[var(--border)] text-[var(--text-muted)]"
                          }`}
                      >
                        {deploymentStatuses[deployment.id].subActive
                          ? "ACTIVE"
                          : "INACTIVE"}
                      </span>
                    ) : (
                      <span
                        className={`text-xs px-2 py-1 font-bold whitespace-nowrap flex-shrink-0 ${deployment.status === "ACTIVE"
                          ? "bg-[var(--accent)] text-[var(--bg-deep)]"
                          : "border border-[var(--border)] text-[var(--text-muted)]"
                          }`}
                      >
                        {deployment.status}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--text-muted)] border border-[var(--border)] px-2 py-0.5 inline-block mt-2">
                    {deployment.agent.venue}
                  </span>
                </div>

                {/* Card Content */}
                <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                  {/* Safe Wallet */}
                  <div className="flex justify-between items-center py-2 sm:py-3 border-b border-[var(--border)] gap-2">
                    <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-2">
                      <Wallet className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="truncate">Wallet</span>
                    </span>
                    <span className="font-mono text-xs sm:text-sm truncate ml-2">
                      {deployment.safeWallet.slice(0, 6)}...
                      {deployment.safeWallet.slice(-4)}
                    </span>
                  </div>

                  {/* Module Status */}
                  <div className="flex justify-between items-center py-2 sm:py-3 border-b border-[var(--border)] gap-2">
                    <span className="text-[var(--text-muted)] text-xs sm:text-sm flex items-center gap-2">
                      <Activity className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span>Module</span>
                    </span>
                    {deployment.moduleEnabled ? (
                      <span className="text-[var(--accent)] text-xs sm:text-sm font-bold flex items-center gap-1 whitespace-nowrap">
                        <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                        ENABLED
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)] text-xs sm:text-sm whitespace-nowrap">
                        NOT ENABLED
                      </span>
                    )}
                  </div>

                  {/* Trading Setup */}
                  {!deployment.moduleEnabled && (
                    <div className="pt-3 sm:pt-4">
                      <p className="data-label mb-2 sm:mb-3 text-xs">SETUP REQUIRED</p>
                      <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 sm:p-4 mb-3 sm:mb-4">
                        <p className="text-xs text-[var(--accent)]">
                          ⚡ Setup required before trading
                        </p>
                      </div>
                      {deployment.agent.venue === "MULTI" ? (
                        <div className="space-y-2">
                          {deployment.enabledVenues?.includes("SPOT") && (
                            <SPOTSetupButton
                              safeAddress={deployment.safeWallet}
                              onSetupComplete={() => fetchDeployments()}
                            />
                          )}
                          {deployment.enabledVenues?.includes(
                            "HYPERLIQUID"
                          ) && (
                              <HyperliquidSetupButton
                                safeAddress={deployment.safeWallet}
                                onSetupComplete={() => fetchDeployments()}
                              />
                            )}
                          {deployment.enabledVenues?.includes("OSTIUM") && (
                            <OstiumSetupButton
                              agentId={deployment.agentId}
                              agentName={deployment.agent.name}
                              onSetupComplete={() => fetchDeployments()}
                            />
                          )}
                        </div>
                      ) : deployment.agent.venue === "GMX" ? (
                        <GMXSetupButton
                          safeAddress={deployment.safeWallet}
                          onSetupComplete={() => fetchDeployments()}
                        />
                      ) : deployment.agent.venue === "HYPERLIQUID" ? (
                        <HyperliquidSetupButton
                          safeAddress={deployment.safeWallet}
                          onSetupComplete={() => fetchDeployments()}
                        />
                      ) : deployment.agent.venue === "OSTIUM" ? (
                        <OstiumSetupButton
                          agentId={deployment.agentId}
                          agentName={deployment.agent.name}
                          onSetupComplete={() => fetchDeployments()}
                        />
                      ) : (
                        <SPOTSetupButton
                          safeAddress={deployment.safeWallet}
                          onSetupComplete={() => fetchDeployments()}
                        />
                      )}
                    </div>
                  )}

                  {/* Telegram Connection */}
                  {/* <div className="pt-4">
                    <p className="data-label mb-3">MANUAL TRADING</p>
                    {deployment.telegramLinked ? (
                      <div className="flex items-center gap-2 text-[var(--accent)]">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-bold">
                          TELEGRAM CONNECTED
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectTelegram(deployment.id)}
                        className="w-full py-3 border border-[var(--border)] text-[var(--text-primary)] font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4" />
                        CONNECT TELEGRAM
                      </button>
                    )}
                  </div> */}

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 sm:pt-4">
                    <a
                      href={`/agent/${deployment.agentId}`}
                      className="flex-1 py-2 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-xs sm:text-sm hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
                    >
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                      VIEW
                    </a>
                    {/* <button
                      onClick={() =>
                        handleSetupHyperliquid(
                          deployment.agentId,
                          deployment.agent.name
                        )
                      }
                      className="py-3 px-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm hover:bg-[var(--accent-dim)] transition-colors flex items-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      <span className="hidden sm:inline">HYPERLIQUID</span>
                    </button>
                    <button className="py-3 px-4 border border-[var(--border)] hover:border-[var(--accent)] transition-colors">
                      <Settings className="w-4 h-4" />
                    </button> */}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedAgent && (
        <AgentDrawer
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          agentDescription={selectedAgent.description || null}
          agentVenue={selectedAgent.venue}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {hyperliquidConnectOpen && (
        <HyperliquidConnect
          agentId={hyperliquidAgentId}
          agentName={hyperliquidAgentName}
          agentVenue={hyperliquidAgentVenue || "HYPERLIQUID"}
          onClose={() => setHyperliquidConnectOpen(false)}
          onSuccess={() => {
            fetchAgents();
            fetchDeployments();
          }}
        />
      )}

      {multiVenueSelectorOpen && multiVenueAgent && (
        <MultiVenueSelector
          agentId={multiVenueAgent.id}
          agentName={multiVenueAgent.name}
          agentDescription={multiVenueAgent.description}
          onClose={() => {
            setMultiVenueSelectorOpen(false);
            setMultiVenueAgent(null);
          }}
          onComplete={() => {
            setMultiVenueSelectorOpen(false);
            setMultiVenueAgent(null);
            fetchAgents();
            fetchDeployments();
          }}
          userAgentAddresses={userAgentAddresses}
        />
      )}

      {/* Telegram Modal */}
      {telegramModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b border-[var(--border)] p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <MessageCircle className="w-5 h-5 text-[var(--accent)] flex-shrink-0" />
                  <div className="min-w-0">
                    <h2 className="font-display text-base sm:text-lg">CONNECT TELEGRAM</h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Link for manual trading
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setTelegramModalOpen(false)}
                  className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              {!linkCode ? (
                <button
                  onClick={generateLinkCode}
                  disabled={generating}
                  className="w-full py-3 sm:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {generating ? (
                    <>
                      <Activity className="w-5 h-5 animate-pulse" />
                      GENERATING...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-5 h-5" />
                      GENERATE LINK CODE
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {/* Step 1 */}
                  <div className="border border-[var(--border)] p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <span className="font-bold text-xs sm:text-sm">
                        STEP 1: OPEN BOT
                      </span>
                      <span className="text-xs text-[var(--accent)]">1/2</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          window.open(`https://t.me/${botUsername}`, "_blank")
                        }
                        className="flex-1 py-2 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm"
                      >
                        <span className="truncate">OPEN @{botUsername}</span>
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      </button>
                      <button
                        onClick={copyBotLink}
                        className="p-2 sm:p-3 border border-[var(--border)] hover:border-[var(--accent)] transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="border border-[var(--border)] p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <span className="font-bold text-xs sm:text-sm">
                        STEP 2: SEND COMMAND
                      </span>
                      <span className="text-xs text-[var(--accent)]">2/2</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[var(--bg-elevated)] px-2 sm:px-4 py-2 sm:py-3 font-mono text-center border border-[var(--border)] text-xs sm:text-sm break-all">
                        /link {linkCode}
                      </code>
                      <button
                        onClick={copyCommand}
                        className="p-2 sm:p-3 border border-[var(--border)] hover:border-[var(--accent)] transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Tip */}
                  <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-2 sm:p-3">
                    <p className="text-xs text-[var(--accent)]">
                      💡 After linking, trade with: "Buy 10 USDC of WETH"
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hyperliquid Modal */}
      {hyperliquidModalOpen && (
        <HyperliquidAgentModal
          agentId={selectedDeploymentId}
          agentName={selectedAgentName}
          onClose={() => setHyperliquidModalOpen(false)}
        />
      )}
    </div>
  );
}
