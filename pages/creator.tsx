import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { db } from "../client/src/lib/db";
import type {
  Agent,
  AgentDeployment,
  Position,
  BillingEvent,
} from "@shared/schema";
import {
  Bot,
  Rocket,
  TrendingUp,
  DollarSign,
  Plus,
  Activity,
  BarChart3,
  CheckCircle,
  Pause,
  Zap,
} from "lucide-react";
import { Header } from "@components/Header";
import { usePrivy } from "@privy-io/react-auth";
import { useToast } from "@/hooks/use-toast";
import { MultiVenueSelector } from "@components/MultiVenueSelector";
import { Settings } from "lucide-react";

export default function Creator() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deployments, setDeployments] = useState<AgentDeployment[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activatingAgentId, setActivatingAgentId] = useState<string | null>(
    null
  );
  const [deactivatingAgentId, setDeactivatingAgentId] = useState<string | null>(
    null
  );
  const [deployingAgent, setDeployingAgent] = useState<Agent | null>(null);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [userAgentAddresses, setUserAgentAddresses] = useState<{
    hyperliquid?: string | null;
    ostium?: string | null;
  } | null>(null);

  // Extract fetchDashboardData so it can be called after deployment
  const fetchDashboardData = async () => {
    if (!authenticated || !user?.wallet?.address) {
      setLoading(false);
      return;
    }

    try {
      // Fetch agents created by this wallet and user agent addresses in parallel
      const [agentsData, addressesData] = await Promise.all([
        db.get("agents", {
          creatorWallet: `eq.${user.wallet.address}`,
          order: "apr30d.desc.nullslast",
          select: "*",
        }),
        db
          .get("user_agent_addresses", {
            userWallet: `eq.${user.wallet.address.toLowerCase()}`,
          })
          .catch(() => null),
      ]);

      setAgents(agentsData || []);

      // Set user agent addresses if available (API converts snake_case to camelCase)
      if (
        addressesData &&
        Array.isArray(addressesData) &&
        addressesData.length > 0
      ) {
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

      // Fetch YOUR deployments (agents you subscribed to) - ALWAYS run this
      const myDeploymentsPromise = db.get("agent_deployments", {
        userWallet: `eq.${user.wallet.address}`,
        select: "*",
      });

      // If we have agents, also fetch deployments BY OTHERS for agents you created
      let allDeployments = await myDeploymentsPromise;

      if (agentsData && agentsData.length > 0) {
        const agentIds = agentsData.map((a: Agent) => a.id);

        // Fetch deployments by others for these agents (to track subscribers)
        const othersDeploymentsPromise = db.get("agent_deployments", {
          agentId: `in.(${agentIds.join(",")})`,
          userWallet: `neq.${user.wallet.address}`, // Exclude your own
          select: "*",
        });

        const othersDeployments = await othersDeploymentsPromise;

        // Combine: YOUR deployments + deployments by OTHERS for your agents
        allDeployments = [
          ...(allDeployments || []),
          ...(othersDeployments || []),
        ];
      }

      setDeployments(allDeployments || []);

      // Fetch positions and billing events for all deployments
      if (allDeployments && allDeployments.length > 0) {
        const deploymentIds = allDeployments.map((d: AgentDeployment) => d.id);

        // Fetch positions and billing events IN PARALLEL (not sequential)
        const [positionsData, billingData] = await Promise.all([
          db.get("positions", {
            deploymentId: `in.(${deploymentIds.join(",")})`,
            order: "openedAt.desc",
            limit: "10",
            select: "*",
          }),
          db.get("billing_events", {
            deploymentId: `in.(${deploymentIds.join(",")})`,
            order: "occurredAt.desc",
            limit: "20",
            select: "*",
          }),
        ]);

        setPositions(positionsData || []);
        setBillingEvents(billingData || []);
      }

      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [authenticated, user?.wallet?.address]);

  async function activateAgent(agentId: string) {
    setActivatingAgentId(agentId);
    try {
      await db.patch(`agents?id=eq.${agentId}`, {
        status: "PUBLIC", // Changed from ACTIVE to PUBLIC
      });

      // Update local state
      setAgents(
        agents.map((a) =>
          a.id === agentId ? { ...a, status: "PUBLIC" as const } : a
        )
      );

      toast({
        title: "Agent Activated",
        description: "Your agent is now live on the marketplace!",
      });
    } catch (err: any) {
      toast({
        title: "Activation Failed",
        description: err.message || "Failed to activate agent",
        variant: "destructive",
      });
    } finally {
      setActivatingAgentId(null);
    }
  }

  async function deactivateAgent(agentId: string) {
    setDeactivatingAgentId(agentId);
    try {
      await db.patch(`agents?id=eq.${agentId}`, {
        status: "PRIVATE", // Changed from PAUSED to PRIVATE
      });

      // Update local state
      setAgents(
        agents.map((a) =>
          a.id === agentId ? { ...a, status: "PRIVATE" as const } : a
        )
      );

      toast({
        title: "Agent Deactivated",
        description:
          "Your agent has been paused and is no longer active on the marketplace.",
      });
    } catch (err: any) {
      toast({
        title: "Deactivation Failed",
        description: err.message || "Failed to deactivate agent",
        variant: "destructive",
      });
    } finally {
      setDeactivatingAgentId(null);
    }
  }

  const handleEditAgent = (agentId: string) => {
    router.push(`/edit-agent/${agentId}`);
  };

  function handleDeployAgent(agent: Agent) {
    setDeployingAgent(agent);
    setShowDeploymentModal(true);
  }

  async function handleDeploymentComplete() {
    setShowDeploymentModal(false);
    setDeployingAgent(null);

    // Show success toast
    toast({
      title: "Deployment Successful",
      description: "Your agent has been deployed successfully!",
    });

    // Smoothly refresh dashboard data to show new deployment without page reload
    if (authenticated && user?.wallet?.address) {
      await fetchDashboardData();

      // Also refresh user agent addresses separately to ensure they're updated
      const userWallet = user.wallet.address.toLowerCase();
      const addressesData = await db
        .get("user_agent_addresses", {
          userWallet: `eq.${userWallet}`,
        })
        .catch(() => null);

      if (
        addressesData &&
        Array.isArray(addressesData) &&
        addressesData.length > 0
      ) {
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
    }
  }

  // Calculate totals
  const totalRevenue = billingEvents
    .filter((e) => e.kind === "PROFIT_SHARE")
    .reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);

  const totalFees = billingEvents
    .filter((e) => e.kind === "INFRA_FEE")
    .reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);

  const activeDeploymentCount = deployments.filter(
    (d) => d.status === "ACTIVE"
  ).length;
  const openPositionsCount = positions.filter(
    (p) => p.status === "OPEN"
  ).length;

  // Loading skeleton component
  const LoadingSkeleton = () => (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-96 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center mt-16">
            <div className="inline-flex p-4 bg-primary/10 rounded-full mb-6">
              <Bot className="h-16 w-16 text-primary" />
            </div>
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Connect Your Wallet
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Connect your wallet to view your trading agents and deployments
            </p>
            <button
              onClick={login}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover-elevate active-elevate-2 transition-all"
              data-testid="button-connect-wallet"
            >
              <Rocket className="h-5 w-5" />
              Connect Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background border border-[var(--border)]">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-12">
          <h1 className="font-display text-5xl font-bold text-foreground mb-8 uppercase">
            Creator Dashboard
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="h-4 bg-muted rounded mb-3 w-1/2 animate-pulse" />
                <div className="h-8 bg-muted rounded w-3/4 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="h-6 bg-muted rounded mb-4 w-1/3 animate-pulse" />
                <div className="space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div
                      key={j}
                      className="h-20 bg-muted rounded animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background border border-[var(--border)]">
      <Header />
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1
              className="text-4xl md:text-5xl font-display font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent mb-2"
              data-testid="text-title"
            >
              CREATOR DASHBOARD
            </h1>
            <p className="text-muted-foreground">
              Monitor your agents' performance and earnings
            </p>
          </div>
          <Link
            href="/create-agent"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
            data-testid="link-create-agent"
          >
            <Plus className="h-5 w-5" />
            Create Agent
          </Link>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-destructive text-sm">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Make sure NEON_REST_URL and NEON_REST_TOKEN are configured
            </p>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bot className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-sm text-muted-foreground mb-1">Total Agents</h3>
            <p
              className="text-3xl font-bold text-foreground"
              data-testid="text-total-agents"
            >
              {agents.length}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Rocket className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-sm text-muted-foreground mb-1">
              Active Deployments
            </h3>
            <p
              className="text-3xl font-bold text-foreground"
              data-testid="text-active-deployments"
            >
              {activeDeploymentCount}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-sm text-muted-foreground mb-1">
              Open Positions
            </h3>
            <p
              className="text-3xl font-bold text-foreground"
              data-testid="text-open-positions"
            >
              {openPositionsCount}
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-sm text-muted-foreground mb-1">
              Profit Share Earned
            </h3>
            <p
              className="text-3xl font-bold text-primary"
              data-testid="text-profit-share"
            >
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="inline-flex p-4 bg-primary/10 rounded-full mb-4">
              <Bot className="h-12 w-12 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              No Agents Yet
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first autonomous trading agent to start earning from
              crypto Twitter signals and technical indicators
            </p>
            <Link
              href="/create-agent"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Create Your First Agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Widget 1: My Agents */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold text-foreground">
                  My Agents
                </h2>
              </div>
              <div className="space-y-4">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-4 bg-background border border-border rounded-md hover:border-primary transition-colors"
                    data-testid={`card-agent-${agent.id}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">
                          {agent.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {agent.venue}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-md ${
                            agent.status === "PUBLIC"
                              ? "bg-primary/20 text-primary"
                              : agent.status === "PRIVATE"
                              ? "bg-yellow-500/20 text-yellow-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {agent.status}
                        </span>

                        {/* Edit button */}
                        <button
                          onClick={() => handleEditAgent(agent.id)}
                          className="flex items-center gap-1 px-3 py-1 border border-border text-xs rounded-md hover:border-primary transition-all"
                          data-testid={`button-edit-${agent.id}`}
                        >
                          <Settings className="h-3 w-3" />
                          Edit
                        </button>

                        {/* Deploy button - available for all agent statuses */}
                        <button
                          onClick={() => handleDeployAgent(agent)}
                          className="flex items-center gap-1 px-3 py-1 bg-[var(--accent)] text-[var(--bg-deep)] text-xs rounded-md hover:bg-[var(--accent-dim)] transition-all font-bold"
                          data-testid={`button-deploy-${agent.id}`}
                        >
                          <Zap className="h-3 w-3" />
                          Deploy
                        </button>

                        {/* Status toggle buttons */}
                        {agent.status === "PUBLIC" ? (
                          <button
                            onClick={() => deactivateAgent(agent.id)}
                            disabled={deactivatingAgentId === agent.id}
                            className="flex items-center gap-1 px-3 py-1 bg-yellow-500 text-white text-xs rounded-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            <Pause className="h-3 w-3" />
                            {deactivatingAgentId === agent.id ? "Switching..." : "Private"}
                          </button>
                        ) : (
                          <button
                            onClick={() => activateAgent(agent.id)}
                            disabled={activatingAgentId === agent.id}
                            className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-xs rounded-md hover-elevate disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            <CheckCircle className="h-3 w-3" />
                            {activatingAgentId === agent.id ? "Switching..." : "Public"}
                          </button>
                        )}
                      </div>
                    </div>
                    {agent.apr30d !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          APR (30d):
                        </span>
                        <span className="font-semibold text-foreground">
                          {agent.apr30d.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Widget 2: Active Deployments */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Rocket className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold text-foreground">
                  Active Deployments
                </h2>
              </div>
              {deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deployments yet
                </p>
              ) : (
                <div className="space-y-4">
                  {deployments.slice(0, 5).map((deployment) => {
                    const agent = agents.find(
                      (a) => a.id === deployment.agentId
                    );
                    return (
                      <div
                        key={deployment.id}
                        className="p-4 bg-background border border-border rounded-md"
                        data-testid={`card-deployment-${deployment.id}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {agent?.name || "Unknown Agent"}
                            </h3>
                            <p className="text-xs text-muted-foreground font-mono">
                              {deployment.safeWallet.slice(0, 10)}...
                            </p>
                          </div>
                          <span
                            className={`px-2 py-1 text-xs rounded-md ${
                              deployment.status === "ACTIVE"
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {deployment.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            Subscription:
                          </span>
                          <span className="text-foreground">
                            {deployment.subActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Widget 3: Recent Positions */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold text-foreground">
                  Recent Positions
                </h2>
              </div>
              {positions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No positions yet
                </p>
              ) : (
                <div className="space-y-4">
                  {positions.slice(0, 5).map((position) => (
                    <div
                      key={position.id}
                      className="p-4 bg-background border border-border rounded-md"
                      data-testid={`card-position-${position.id}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {position.tokenSymbol}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {position.venue} • {position.side}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs rounded-md ${
                            position.status === "OPEN"
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {position.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Entry:</span>
                          <span className="ml-2 text-foreground font-mono">
                            ${parseFloat(position.entryPrice).toFixed(2)}
                          </span>
                        </div>
                        {position.pnl && (
                          <div>
                            <span className="text-muted-foreground">PnL:</span>
                            <span
                              className={`ml-2 font-semibold ${
                                parseFloat(position.pnl) >= 0
                                  ? "text-primary"
                                  : "text-destructive"
                              }`}
                            >
                              ${parseFloat(position.pnl).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Widget 4: Billing Summary */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold text-foreground">
                  Billing Summary
                </h2>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-background border border-border rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Total Fees Paid
                    </span>
                    <span
                      className="text-lg font-semibold text-foreground"
                      data-testid="text-total-fees"
                    >
                      ${totalFees.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-background border border-border rounded-md">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Profit Share Earned
                    </span>
                    <span className="text-lg font-semibold text-primary">
                      ${totalRevenue.toFixed(2)}
                    </span>
                  </div>
                </div>
                {billingEvents.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-foreground mb-2">
                      Recent Events
                    </h3>
                    <div className="space-y-2">
                      {billingEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="flex justify-between text-xs"
                          data-testid={`billing-event-${event.id}`}
                        >
                          <span className="text-muted-foreground">
                            {event.kind}
                          </span>
                          <span className="text-foreground font-mono">
                            ${parseFloat(event.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deployment Modal */}
      {showDeploymentModal && deployingAgent && (
        <MultiVenueSelector
          agentId={deployingAgent.id}
          agentName={deployingAgent.name}
          agentDescription={deployingAgent.description || null}
          onClose={() => {
            setShowDeploymentModal(false);
            setDeployingAgent(null);
          }}
          onComplete={handleDeploymentComplete}
          userAgentAddresses={userAgentAddresses}
        />
      )}
    </div>
  );
}
