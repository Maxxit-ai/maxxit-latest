import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ThemeToggle from "@/components/ThemeToggle";
import MetricCard from "@/components/MetricCard";
import PositionRow from "@/components/PositionRow";
import StatusBadge from "@/components/StatusBadge";
import TelegramConnectModal from "@/components/TelegramConnectModal";
import TelegramStatus from "@/components/TelegramStatus";
import { TrendingUp, DollarSign, Activity, BarChart3, Wallet, CreditCard, Settings } from "lucide-react";

export default function Dashboard() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState<"positions" | "deployments" | "billing">("positions");
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>("");

  const handleConnectTelegram = (deploymentId: string) => {
    setSelectedDeploymentId(deploymentId);
    setTelegramModalOpen(true);
  };

  const deployments = [
    {
      id: "1",
      agentName: "Momentum Trader",
      safeWallet: "0x1234...5678",
      status: "ACTIVE" as const,
      subActive: true,
      trialEndsAt: "2025-10-15",
      telegramLinked: false,
    },
    {
      id: "2",
      agentName: "Volatility Hunter",
      safeWallet: "0x8765...4321",
      status: "ACTIVE" as const,
      subActive: true,
      trialEndsAt: null,
      telegramLinked: true,
    },
  ];

  const positions = [
    {
      id: "1",
      tokenSymbol: "BTC",
      side: "LONG",
      entryPrice: 42000,
      currentPrice: 45000,
      qty: 0.5,
      pnl: 1500,
      pnlPercent: 7.14,
      status: "OPEN" as const,
      openedAt: "2025-10-01T10:00:00Z",
    },
    {
      id: "2",
      tokenSymbol: "ETH",
      side: "SHORT",
      entryPrice: 2800,
      currentPrice: 2700,
      qty: 5.0,
      pnl: 500,
      pnlPercent: 3.57,
      status: "OPEN" as const,
      openedAt: "2025-10-02T14:30:00Z",
    },
    {
      id: "3",
      tokenSymbol: "SOL",
      side: "LONG",
      entryPrice: 140,
      qty: 10.0,
      pnl: -200,
      pnlPercent: -1.43,
      status: "CLOSED" as const,
      openedAt: "2025-09-28T09:15:00Z",
    },
  ];

  const billingEvents = [
    {
      id: "1",
      kind: "SUBSCRIPTION" as const,
      amount: 20,
      status: "CHARGED" as const,
      occurredAt: "2025-10-01T00:00:00Z",
    },
    {
      id: "2",
      kind: "INFRA_FEE" as const,
      amount: 0.2,
      status: "CHARGED" as const,
      occurredAt: "2025-10-01T10:00:00Z",
    },
    {
      id: "3",
      kind: "PROFIT_SHARE" as const,
      amount: 150,
      status: "CHARGED" as const,
      occurredAt: "2025-10-01T10:00:00Z",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 border-r border-border p-4 space-y-2">
        <Link href="/">
          <a className="text-2xl font-bold mb-8 block" data-testid="link-logo">
            Maxxit
          </a>
        </Link>

        <nav className="space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start"
            asChild
          >
            <Link href="/agents">
              <BarChart3 className="h-4 w-4 mr-2" />
              Agents
            </Link>
          </Button>
          <Button
            variant={location === "/dashboard" ? "secondary" : "ghost"}
            className="w-full justify-start"
            asChild
          >
            <Link href="/dashboard">
              <Activity className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </nav>

        <div className="pt-4 mt-auto">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Wallet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-mono text-muted-foreground" data-testid="text-wallet-address">
                0x1234...5678
              </p>
              <Button variant="outline" size="sm" className="w-full mt-2" data-testid="button-disconnect">
                Disconnect
              </Button>
            </CardContent>
          </Card>
        </div>
      </aside>

      <main className="flex-1">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="heading-dashboard">
            Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Total PnL"
              value="$1,800"
              subtitle="+12.3% this month"
              icon={DollarSign}
              trend="up"
            />
            <MetricCard
              title="Open Positions"
              value="2"
              subtitle="across 2 agents"
              icon={Activity}
              trend="neutral"
            />
            <MetricCard
              title="Active Agents"
              value="2"
              subtitle="1 in trial"
              icon={TrendingUp}
              trend="neutral"
            />
            <MetricCard
              title="Monthly Fees"
              value="$40.40"
              subtitle="next billing Oct 15"
              icon={CreditCard}
              trend="neutral"
            />
          </div>

          <div className="flex gap-2 border-b border-border">
            <Button
              variant={activeTab === "positions" ? "default" : "ghost"}
              onClick={() => setActiveTab("positions")}
              data-testid="button-tab-positions"
            >
              Positions
            </Button>
            <Button
              variant={activeTab === "deployments" ? "default" : "ghost"}
              onClick={() => setActiveTab("deployments")}
              data-testid="button-tab-deployments"
            >
              Deployments
            </Button>
            <Button
              variant={activeTab === "billing" ? "default" : "ghost"}
              onClick={() => setActiveTab("billing")}
              data-testid="button-tab-billing"
            >
              Billing
            </Button>
          </div>

          {activeTab === "positions" && (
            <Card>
              <CardHeader>
                <CardTitle>Open & Recent Positions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Token
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Entry
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Current
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Qty
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          PnL
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="py-3 px-4 text-left text-sm font-medium text-muted-foreground">
                          Opened
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position) => (
                        <PositionRow key={position.id} {...position} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "deployments" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deployments.map((deployment) => (
                <Card key={deployment.id} data-testid={`card-deployment-${deployment.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{deployment.agentName}</CardTitle>
                      <StatusBadge status={deployment.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Safe Wallet</p>
                      <p className="font-mono text-sm" data-testid="text-safe-wallet">
                        {deployment.safeWallet}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Subscription</p>
                        <p className="text-sm font-medium">
                          {deployment.subActive ? "Active" : "Inactive"}
                        </p>
                      </div>
                      {deployment.trialEndsAt && (
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground mb-1">Trial Ends</p>
                          <p className="text-sm font-medium">
                            {new Date(deployment.trialEndsAt).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground mb-2">Manual Trading</p>
                      <TelegramStatus
                        isLinked={deployment.telegramLinked}
                        onConnect={() => handleConnectTelegram(deployment.id)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" data-testid="button-pause">
                        Pause
                      </Button>
                      <Button variant="ghost" size="sm" data-testid="button-settings">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeTab === "billing" && (
            <Card>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {billingEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                      data-testid={`billing-event-${event.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {event.kind === "SUBSCRIPTION"
                              ? "Monthly Subscription"
                              : event.kind === "INFRA_FEE"
                              ? "Infrastructure Fee"
                              : "Profit Share"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(event.occurredAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div className="font-mono font-semibold">
                          ${event.amount.toFixed(2)}
                        </div>
                        <StatusBadge status={event.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <TelegramConnectModal
        open={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
        deploymentId={selectedDeploymentId}
      />
    </div>
  );
}
