import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { Header } from "@components/Header";

interface AgentWithStats {
  id: string;
  name: string;
  venue: string;
  creatorWallet: string;
  profitReceiverAddress: string;
  status: string | null;
  apr30d: number | null;
  apr90d: number | null;
  sharpe30d: number | null;
  subscriberCount: number;
  activeSubscribers: number;
  totalPositions: number;
  openPositions: number;
  totalSignals: number;
  totalPnl: number;
  walletBalance: string | null;
}

interface VenueBreakdown {
  venue: string;
  agentCount: number;
  deploymentCount: number;
  positionCount: number;
}

interface DailyStats {
  date: string;
  signals: number;
  positions: number;
  pnl: number;
}

interface RecentActivity {
  type: string;
  description: string;
  timestamp: string;
  metadata?: any;
}

interface WalletBalance {
  address: string;
  type: "profit_receiver" | "safe_wallet" | "agent_address";
  agentId?: string;
  agentName?: string;
  deploymentId?: string;
  userWallet?: string;
  ethBalance: string;
  tokenBalances: Record<string, string>;
}

interface WalletData {
  wallets: WalletBalance[];
  totals: {
    totalEth: number;
    totalByToken: Record<string, number>;
    walletCount: number;
  };
}

interface DashboardStats {
  overview: {
    totalAgents: number;
    publicAgents: number;
    privateAgents: number;
    draftAgents: number;
    totalDeployments: number;
    activeDeployments: number;
    pausedDeployments: number;
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    totalSignals: number;
    totalPnl: number;
    totalBillingEvents: number;
    totalTelegramUsers: number;
    totalCtAccounts: number;
    totalResearchInstitutes: number;
  };
  agents: AgentWithStats[];
  recentActivity: RecentActivity[];
  venueBreakdown: VenueBreakdown[];
  dailyStats: DailyStats[];
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatPnl(pnl: number): string {
  const formatted = Math.abs(pnl).toFixed(2);
  return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
}

function formatEth(balance: string | null): string {
  if (!balance) return "—";
  const num = parseFloat(balance);
  if (num < 0.0001) return "< 0.0001";
  return num.toFixed(4);
}

function StatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    PUBLIC: "bg-accent/20 text-accent border-accent/30",
    PRIVATE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    ACTIVE: "bg-accent/20 text-accent border-accent/30",
    PAUSED: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 border ${
        colors[status || "DRAFT"] || colors.DRAFT
      }`}
    >
      {status || "DRAFT"}
    </span>
  );
}

function StatCard({
  label,
  value,
  subValue,
  trend,
  icon,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  icon?: string;
}) {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-6 hover:border-accent/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <p className="data-label">{label}</p>
        {icon && <span className="text-2xl opacity-50">{icon}</span>}
      </div>
      <p
        className={`font-display text-4xl ${
          trend === "up"
            ? "text-accent"
            : trend === "down"
            ? "text-[var(--danger)]"
            : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
      {subValue && (
        <p className="text-sm text-[var(--text-muted)] mt-2">{subValue}</p>
      )}
    </div>
  );
}

function MiniChart({ data, height = 60 }: { data: number[]; height?: number }) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((value, i) => (
        <div
          key={i}
          className="flex-1 bg-accent/30 hover:bg-accent/50 transition-colors rounded-t"
          style={{
            height: `${Math.max(((value - min) / range) * 100, 5)}%`,
          }}
          title={`${value}`}
        />
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [mounted, setMounted] = useState(false);
  const [selectedTab, setSelectedTab] = useState<
    "overview" | "agents" | "wallets" | "activity"
  >("overview");
  const [sortBy, setSortBy] = useState<
    "subscribers" | "pnl" | "positions" | "name"
  >("subscribers");
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Set mounted flag on client only
  useEffect(() => {
    setMounted(true);
    setLastUpdated(new Date().toLocaleString());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [mounted]);

  // Load data once on mount only
  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/dashboard-stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
        setError(null);
        setLastUpdated(new Date().toLocaleString());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Fetch stats function - can be called manually from refresh button
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard-stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
      setError(null);
      setLastUpdated(new Date().toLocaleString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch wallet data when wallets tab is selected
  useEffect(() => {
    if (selectedTab === "wallets" && !walletData && !walletLoading) {
      setWalletLoading(true);
      fetch("/api/admin/wallet-balances")
        .then((res) => res.json())
        .then((data) => {
          setWalletData(data);
        })
        .catch((err) => {
          console.error("Failed to fetch wallet data:", err);
        })
        .finally(() => {
          setWalletLoading(false);
        });
    }
  }, [selectedTab, walletData, walletLoading]);

  const sortedAgents = stats?.agents.slice().sort((a, b) => {
    switch (sortBy) {
      case "subscribers":
        return b.subscriberCount - a.subscriberCount;
      case "pnl":
        return b.totalPnl - a.totalPnl;
      case "positions":
        return b.totalPositions - a.totalPositions;
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  return (
    <>
      <Head>
        <title>Admin Dashboard - Maxxit</title>
      </Head>

      <div className="min-h-screen bg-[var(--bg-deep)] text-[var(--text-primary)]">
        {/* Header */}
        <Header />

        <main className="pt-20 px-6 pb-12">
          <div className="max-w-[1800px] mx-auto">
            {/* Page Title */}
            <div className="flex items-end justify-between mb-8 pt-6">
              <div>
                <p className="data-label mb-2">SYSTEM OVERVIEW</p>
                <h1 className="font-display text-4xl md:text-5xl">
                  ADMIN <span className="text-accent">DASHBOARD</span>
                </h1>
              </div>
              <div className="hidden md:block text-right">
                <p className="text-sm text-[var(--text-muted)]">Last updated</p>
                <p className="font-mono text-accent" suppressHydrationWarning>
                  {lastUpdated || "Never"}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="border border-[var(--border)] p-6 animate-pulse"
                  >
                    <div className="h-4 w-1/2 bg-[var(--border)] mb-4" />
                    <div className="h-10 w-2/3 bg-[var(--border)]" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="border border-[var(--danger)] p-8 text-center">
                <p className="text-[var(--danger)] font-mono">ERROR: {error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-[var(--danger)] text-white"
                >
                  RETRY
                </button>
              </div>
            ) : stats ? (
              <>
                {/* Overview Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <StatCard
                    label="TOTAL AGENTS"
                    value={stats.overview.totalAgents}
                    subValue={`${stats.overview.publicAgents} public, ${stats.overview.privateAgents} private`}
                    icon="🤖"
                  />
                  <StatCard
                    label="ACTIVE DEPLOYMENTS"
                    value={stats.overview.activeDeployments}
                    subValue={`${stats.overview.totalDeployments} total, ${stats.overview.pausedDeployments} paused`}
                    trend="up"
                    icon="🚀"
                  />
                  <StatCard
                    label="OPEN POSITIONS"
                    value={stats.overview.openPositions}
                    subValue={`${stats.overview.totalPositions} total positions`}
                    icon="📊"
                  />
                  <StatCard
                    label="TOTAL PNL"
                    value={formatPnl(stats.overview.totalPnl)}
                    trend={stats.overview.totalPnl >= 0 ? "up" : "down"}
                    icon="💰"
                  />
                </div>

                {/* Secondary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="data-label mb-2">SIGNALS</p>
                    <p className="font-display text-2xl text-accent">
                      {stats.overview.totalSignals}
                    </p>
                  </div>
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="data-label mb-2">TELEGRAM USERS</p>
                    <p className="font-display text-2xl">
                      {stats.overview.totalTelegramUsers}
                    </p>
                  </div>
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="data-label mb-2">CT ACCOUNTS</p>
                    <p className="font-display text-2xl">
                      {stats.overview.totalCtAccounts}
                    </p>
                  </div>
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="data-label mb-2">RESEARCH INST.</p>
                    <p className="font-display text-2xl">
                      {stats.overview.totalResearchInstitutes}
                    </p>
                  </div>
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="data-label mb-2">BILLING EVENTS</p>
                    <p className="font-display text-2xl">
                      {stats.overview.totalBillingEvents}
                    </p>
                  </div>
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <p className="data-label mb-2">CLOSED TRADES</p>
                    <p className="font-display text-2xl">
                      {stats.overview.closedPositions}
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-4 mb-6 border-b border-[var(--border)]">
                  {(["overview", "agents", "wallets", "activity"] as const).map(
                    (tab) => (
                      <button
                        key={tab}
                        onClick={() => setSelectedTab(tab)}
                        className={`px-4 py-3 text-sm font-bold uppercase transition-colors border-b-2 -mb-px ${
                          selectedTab === tab
                            ? "border-accent text-accent"
                            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {tab}
                      </button>
                    )
                  )}
                </div>

                {selectedTab === "overview" && (
                  <div className="grid lg:grid-cols-2 gap-6">
                    {/* Daily Activity Chart */}
                    <div className="lg:col-span-2 border border-[var(--border)] bg-[var(--bg-surface)] p-6">
                      <div className="flex items-center justify-between mb-4">
                        <p className="data-label">SIGNALS (LAST 30 DAYS)</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {stats.dailyStats.reduce(
                            (sum, d) => sum + d.signals,
                            0
                          )}{" "}
                          total
                        </p>
                      </div>
                      <MiniChart
                        data={stats.dailyStats.map((d) => d.signals)}
                        height={100}
                      />
                      <div className="flex justify-between mt-2 text-xs text-[var(--text-muted)]">
                        <span>{stats.dailyStats[0]?.date}</span>
                        <span>
                          {stats.dailyStats[stats.dailyStats.length - 1]?.date}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTab === "agents" && (
                  <div>
                    {/* Sort Controls */}
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-sm text-[var(--text-muted)]">
                        Sort by:
                      </span>
                      {(
                        ["subscribers", "pnl", "positions", "name"] as const
                      ).map((sort) => (
                        <button
                          key={sort}
                          onClick={() => setSortBy(sort)}
                          className={`px-3 py-1 text-xs uppercase ${
                            sortBy === sort
                              ? "bg-accent text-[var(--bg-deep)]"
                              : "border border-[var(--border)] hover:border-accent"
                          }`}
                        >
                          {sort}
                        </button>
                      ))}
                    </div>

                    {/* Agents Table */}
                    <div className="border border-[var(--border)] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                            <tr>
                              <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                Agent
                              </th>
                              <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                Venue
                              </th>
                              <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                Status
                              </th>
                              <th className="px-4 py-3 text-center font-mono text-xs text-[var(--text-muted)] uppercase">
                                Subscribers
                              </th>
                              <th className="px-4 py-3 text-center font-mono text-xs text-[var(--text-muted)] uppercase">
                                Positions
                              </th>
                              <th className="px-4 py-3 text-center font-mono text-xs text-[var(--text-muted)] uppercase">
                                Signals
                              </th>
                              <th className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)] uppercase">
                                Total PnL
                              </th>
                              <th className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)] uppercase">
                                30D APR
                              </th>
                              <th className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)] uppercase">
                                Wallet (ETH)
                              </th>
                              <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                Profit Wallet
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {sortedAgents?.map((agent, idx) => (
                              <tr
                                key={agent.id}
                                className="hover:bg-[var(--bg-surface)] transition-colors"
                              >
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-[var(--text-muted)] font-mono">
                                      #{String(idx + 1).padStart(2, "0")}
                                    </span>
                                    <div>
                                      <p className="font-bold">{agent.name}</p>
                                      <p className="text-xs text-[var(--text-muted)]">
                                        {formatAddress(agent.creatorWallet)}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <span className="text-xs px-2 py-1 border border-[var(--border)]">
                                    {agent.venue}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <StatusBadge status={agent.status} />
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="font-display text-xl">
                                    {agent.subscriberCount}
                                  </span>
                                  {agent.activeSubscribers > 0 && (
                                    <span className="text-xs text-accent ml-1">
                                      ({agent.activeSubscribers} active)
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="font-display text-xl">
                                    {agent.totalPositions}
                                  </span>
                                  {agent.openPositions > 0 && (
                                    <span className="text-xs text-accent ml-1">
                                      ({agent.openPositions} open)
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-4 text-center font-mono">
                                  {agent.totalSignals}
                                </td>
                                <td
                                  className={`px-4 py-4 text-right font-mono ${
                                    agent.totalPnl >= 0
                                      ? "text-accent"
                                      : "text-[var(--danger)]"
                                  }`}
                                >
                                  {formatPnl(agent.totalPnl)}
                                </td>
                                <td
                                  className={`px-4 py-4 text-right font-mono ${
                                    agent.apr30d && agent.apr30d > 0
                                      ? "text-accent"
                                      : ""
                                  }`}
                                >
                                  {agent.apr30d != null
                                    ? `${
                                        agent.apr30d > 0 ? "+" : ""
                                      }${agent.apr30d.toFixed(1)}%`
                                    : "—"}
                                </td>
                                <td className="px-4 py-4 text-right font-mono">
                                  {formatEth(agent.walletBalance)}
                                </td>
                                <td className="px-4 py-4">
                                  <a
                                    href={`https://arbiscan.io/address/${agent.profitReceiverAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-accent hover:underline"
                                  >
                                    {formatAddress(agent.profitReceiverAddress)}
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {sortedAgents?.length === 0 && (
                      <div className="border border-[var(--border)] p-12 text-center">
                        <p className="text-[var(--text-muted)]">
                          No agents found
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedTab === "wallets" && (
                  <div>
                    {walletLoading ? (
                      <div className="border border-[var(--border)] p-12 text-center">
                        <div className="animate-pulse">
                          <div className="h-6 w-1/4 bg-[var(--border)] mx-auto mb-4" />
                          <p className="text-[var(--text-muted)]">
                            Loading wallet balances...
                          </p>
                        </div>
                      </div>
                    ) : walletData ? (
                      <>
                        {/* Wallet Totals */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <div className="border border-accent bg-accent/10 p-4">
                            <p className="data-label mb-2">TOTAL WALLETS</p>
                            <p className="font-display text-3xl text-accent">
                              {walletData.totals?.walletCount || 0}
                            </p>
                          </div>
                          <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                            <p className="data-label mb-2">TOTAL ETH</p>
                            <p className="font-display text-3xl">
                              {(walletData.totals?.totalEth || 0).toFixed(4)}
                            </p>
                          </div>
                          {Object.entries(
                            walletData.totals?.totalByToken || {}
                          ).map(([symbol, amount]) => (
                            <div
                              key={symbol}
                              className="border border-[var(--border)] bg-[var(--bg-surface)] p-4"
                            >
                              <p className="data-label mb-2">TOTAL {symbol}</p>
                              <p className="font-display text-3xl">
                                {amount.toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Wallet Table */}
                        <div className="border border-[var(--border)] overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                                <tr>
                                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                    Type
                                  </th>
                                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                    Address
                                  </th>
                                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--text-muted)] uppercase">
                                    Agent/User
                                  </th>
                                  <th className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)] uppercase">
                                    ETH Balance
                                  </th>
                                  <th className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)] uppercase">
                                    Tokens
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border)]">
                                {walletData.wallets.map((wallet, idx) => (
                                  <tr
                                    key={`${wallet.address}-${idx}`}
                                    className="hover:bg-[var(--bg-surface)] transition-colors"
                                  >
                                    <td className="px-4 py-4">
                                      <span
                                        className={`text-xs px-2 py-1 border ${
                                          wallet.type === "profit_receiver"
                                            ? "border-accent text-accent"
                                            : wallet.type === "safe_wallet"
                                            ? "border-blue-500 text-blue-400"
                                            : "border-purple-500 text-purple-400"
                                        }`}
                                      >
                                        {wallet.type
                                          .replace("_", " ")
                                          .toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4">
                                      <a
                                        href={`https://arbiscan.io/address/${wallet.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-accent hover:underline"
                                      >
                                        {formatAddress(wallet.address)}
                                      </a>
                                    </td>
                                    <td className="px-4 py-4">
                                      {wallet.agentName ? (
                                        <div>
                                          <p className="font-bold">
                                            {wallet.agentName}
                                          </p>
                                          {wallet.userWallet && (
                                            <p className="text-xs text-[var(--text-muted)]">
                                              User:{" "}
                                              {formatAddress(wallet.userWallet)}
                                            </p>
                                          )}
                                        </div>
                                      ) : wallet.userWallet ? (
                                        <p className="text-xs text-[var(--text-muted)]">
                                          {formatAddress(wallet.userWallet)}
                                        </p>
                                      ) : (
                                        <span className="text-[var(--text-muted)]">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                      <span
                                        className={`font-mono ${
                                          parseFloat(wallet.ethBalance) > 0.01
                                            ? "text-accent"
                                            : ""
                                        }`}
                                      >
                                        {parseFloat(wallet.ethBalance).toFixed(
                                          4
                                        )}{" "}
                                        ETH
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 text-right">
                                      <div className="flex flex-wrap gap-2 justify-end">
                                        {Object.entries(wallet.tokenBalances)
                                          .length > 0 ? (
                                          Object.entries(
                                            wallet.tokenBalances
                                          ).map(([symbol, balance]) => (
                                            <span
                                              key={symbol}
                                              className="text-xs px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border)]"
                                            >
                                              {parseFloat(balance).toFixed(2)}{" "}
                                              {symbol}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-[var(--text-muted)]">
                                            —
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {walletData.wallets.length === 0 && (
                          <div className="border border-[var(--border)] p-12 text-center mt-4">
                            <p className="text-[var(--text-muted)]">
                              No wallets found
                            </p>
                          </div>
                        )}

                        <div className="mt-4 text-right">
                          <button
                            onClick={() => {
                              setWalletData(null);
                              setWalletLoading(true);
                              fetch("/api/admin/wallet-balances")
                                .then((res) => res.json())
                                .then(setWalletData)
                                .finally(() => setWalletLoading(false));
                            }}
                            className="px-4 py-2 text-sm border border-[var(--border)] hover:border-accent hover:text-accent transition-colors"
                          >
                            🔄 Refresh Balances
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="border border-[var(--border)] p-12 text-center">
                        <p className="text-[var(--text-muted)]">
                          Failed to load wallet data
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedTab === "activity" && (
                  <div className="border border-[var(--border)] bg-[var(--bg-surface)]">
                    <div className="p-4 border-b border-[var(--border)]">
                      <p className="data-label">RECENT ACTIVITY LOG</p>
                    </div>
                    <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
                      {stats.recentActivity.length > 0 ? (
                        stats.recentActivity.map((activity, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors flex items-center justify-between"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-2 h-2 bg-accent rounded-full" />
                              <div>
                                <p className="font-mono text-sm">
                                  {activity.type}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {activity.description}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-[var(--text-muted)] font-mono">
                              {new Date(activity.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-[var(--text-muted)]">
                          No recent activity
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="mt-8 border-t border-[var(--border)] pt-8">
                  <p className="data-label mb-4">QUICK ACTIONS</p>
                  <div className="flex flex-wrap gap-4">
                    <Link href="/admin/database">
                      <button className="px-6 py-3 border border-[var(--border)] hover:border-accent hover:text-accent transition-colors">
                        📊 View Database
                      </button>
                    </Link>
                    <Link href="/admin/executor-agreements">
                      <button className="px-6 py-3 border border-[var(--border)] hover:border-accent hover:text-accent transition-colors">
                        📝 Executor Agreements
                      </button>
                    </Link>
                    <Link href="/create-agent">
                      <button className="px-6 py-3 border border-[var(--border)] hover:border-accent hover:text-accent transition-colors">
                        ➕ Create Agent
                      </button>
                    </Link>
                    <button
                      onClick={handleRefresh}
                      disabled={loading}
                      className="px-6 py-3 bg-accent text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "⏳ Loading..." : "🔄 Refresh Data"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--border)] py-6 px-6">
          <div className="max-w-[1800px] mx-auto flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>MAXXIT ADMIN DASHBOARD</span>
            <span>© 2025</span>
          </div>
        </footer>
      </div>
    </>
  );
}
