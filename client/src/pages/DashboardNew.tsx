import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ThemeToggle from "@/components/ThemeToggle";
import StatusBadge from "@/components/StatusBadge";
import { 
  TrendingUp, 
  DollarSign, 
  Activity, 
  BarChart3, 
  Wallet, 
  CreditCard, 
  Settings, 
  Loader2, 
  AlertCircle,
  X,
  Check,
  Zap
} from "lucide-react";

export default function DashboardNew() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState<"positions" | "signals" | "deployments">("positions");
  const queryClient = useQueryClient();

  // Fetch real positions
  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ["/api/db/positions?_limit=20&_sort=-createdAt"],
  });

  // Fetch signals
  const { data: signals, isLoading: signalsLoading } = useQuery({
    queryKey: ["/api/db/signals?_limit=20&_sort=-createdAt"],
  });

  // Fetch deployments
  const { data: deployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ["/api/deployments"],
  });

  // Execute trade mutation
  const executeTrade = useMutation({
    mutationFn: async (signalId: string) => {
      const response = await fetch("/api/admin/execute-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Trade execution failed");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/db/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/db/signals"] });
    },
  });

  // Close position mutation
  const closePosition = useMutation({
    mutationFn: async (positionId: string) => {
      const response = await fetch("/api/admin/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to close position");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/db/positions"] });
    },
  });

  // Calculate metrics
  const openPositions = positions?.filter((p: any) => p.status === "OPEN") || [];
  const activeDeployments = deployments?.filter((d: any) => d.status === "ACTIVE") || [];
  const readySignals = signals?.filter((s: any) => !positions?.some((p: any) => p.signalId === s.id)) || [];

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 border-r border-border p-4 space-y-2">
        <Link href="/">
          <a className="text-2xl font-bold mb-8 block">
            Maxxit
          </a>
        </Link>

        <nav className="space-y-1">
          <Button variant="ghost" className="w-full justify-start" asChild>
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
      </aside>

      <main className="flex-1">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border px-6 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Open Positions</p>
                    <p className="text-2xl font-bold">{openPositions.length}</p>
                  </div>
                  <Activity className="h-8 w-8 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ready Signals</p>
                    <p className="text-2xl font-bold">{readySignals.length}</p>
                  </div>
                  <Zap className="h-8 w-8 text-yellow-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Agents</p>
                    <p className="text-2xl font-bold">{activeDeployments.length}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Positions</p>
                    <p className="text-2xl font-bold">{positions?.length || 0}</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            <Button
              variant={activeTab === "positions" ? "default" : "ghost"}
              onClick={() => setActiveTab("positions")}
            >
              Positions
            </Button>
            <Button
              variant={activeTab === "signals" ? "default" : "ghost"}
              onClick={() => setActiveTab("signals")}
            >
              Ready Signals ({readySignals.length})
            </Button>
            <Button
              variant={activeTab === "deployments" ? "default" : "ghost"}
              onClick={() => setActiveTab("deployments")}
            >
              Deployments
            </Button>
          </div>

          {/* Positions Tab */}
          {activeTab === "positions" && (
            <Card>
              <CardHeader>
                <CardTitle>Trading Positions</CardTitle>
              </CardHeader>
              <CardContent>
                {positionsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !positions || positions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No positions yet. Execute signals to start trading!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {positions.map((position: any) => (
                      <div
                        key={position.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-lg">
                              {position.tokenSymbol}
                            </span>
                            <StatusBadge status={position.side} />
                            <StatusBadge status={position.status} />
                            <span className="text-sm text-muted-foreground">
                              {position.venue}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Size</p>
                              <p className="font-medium">${position.size?.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Collateral</p>
                              <p className="font-medium">${position.collateral?.toFixed(2)}</p>
                            </div>
                            {position.leverage && (
                              <div>
                                <p className="text-muted-foreground">Leverage</p>
                                <p className="font-medium">{position.leverage}x</p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {position.status === "OPEN" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => closePosition.mutate(position.id)}
                            disabled={closePosition.isPending}
                          >
                            {closePosition.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <X className="h-4 w-4 mr-1" />
                                Close
                              </>
                            )}
                          </Button>
                        )}

                        {position.txHash && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a
                              href={`https://arbiscan.io/tx/${position.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View TX
                            </a>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Signals Tab */}
          {activeTab === "signals" && (
            <Card>
              <CardHeader>
                <CardTitle>Ready to Execute</CardTitle>
              </CardHeader>
              <CardContent>
                {signalsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !readySignals || readySignals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No signals ready for execution
                  </div>
                ) : (
                  <div className="space-y-3">
                    {readySignals.map((signal: any) => (
                      <div
                        key={signal.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-bold text-lg">
                              {signal.tokenSymbol}
                            </span>
                            <StatusBadge status={signal.side} />
                            <span className="text-sm text-muted-foreground">
                              {signal.venue}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Confidence</p>
                              <p className="font-medium">
                                {((signal.sizeModel?.confidence || 0) * 100).toFixed(0)}%
                              </p>
                            </div>
                            {signal.sizeModel?.leverage && (
                              <div>
                                <p className="text-muted-foreground">Leverage</p>
                                <p className="font-medium">{signal.sizeModel.leverage}x</p>
                              </div>
                            )}
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p className="font-medium">
                                {new Date(signal.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          onClick={() => executeTrade.mutate(signal.id)}
                          disabled={executeTrade.isPending}
                          className="ml-4"
                        >
                          {executeTrade.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-1" />
                              Execute
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {executeTrade.error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {executeTrade.error.message}
                    </AlertDescription>
                  </Alert>
                )}

                {executeTrade.isSuccess && (
                  <Alert className="mt-4 border-green-500 bg-green-500/10">
                    <Check className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-green-700 dark:text-green-400">
                      Trade executed successfully!
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Deployments Tab */}
          {activeTab === "deployments" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deploymentsLoading ? (
                <div className="col-span-2 flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !deployments || deployments.length === 0 ? (
                <div className="col-span-2 text-center py-8 text-muted-foreground">
                  No deployments yet. Create and deploy an agent to start!
                </div>
              ) : (
                deployments.map((deployment: any) => (
                  <Card key={deployment.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {deployment.agent?.name || "Agent"}
                        </CardTitle>
                        <StatusBadge status={deployment.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Safe Wallet</p>
                        <p className="font-mono text-sm">{deployment.safeWallet}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Venue</p>
                        <p className="font-medium">{deployment.agent?.venue}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          asChild
                        >
                          <a
                            href={`https://app.safe.global/home?safe=arb1:${deployment.safeWallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Wallet className="h-4 w-4 mr-1" />
                            View Safe
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
