import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wallet, Check, AlertCircle, Loader2, Rocket, Shield } from "lucide-react";

export default function DeployAgent() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [safeAddress, setSafeAddress] = useState("");
  const [userWallet, setUserWallet] = useState("");
  const [validationStatus, setValidationStatus] = useState<{
    checking: boolean;
    valid: boolean;
    error?: string;
    balances?: any;
  }>({ checking: false, valid: false });

  // Fetch agent details
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: [`/api/agents/${id}`],
  });

  // Validate Safe wallet
  const validateSafe = async (address: string) => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setValidationStatus({
        checking: false,
        valid: false,
        error: "Invalid Ethereum address format",
      });
      return;
    }

    setValidationStatus({ checking: true, valid: false });

    try {
      const response = await fetch(
        `/api/safe/status?safeAddress=${address}&chainId=${agent?.venue === 'GMX' || agent?.venue === 'SPOT' ? 42161 : 42161}`
      );
      
      const data = await response.json();

      if (data.valid && data.readiness.ready) {
        setValidationStatus({
          checking: false,
          valid: true,
          balances: data.balances,
        });
      } else {
        setValidationStatus({
          checking: false,
          valid: false,
          error: data.readiness.warnings?.join(", ") || "Safe wallet not ready for trading",
        });
      }
    } catch (error: any) {
      setValidationStatus({
        checking: false,
        valid: false,
        error: error.message || "Failed to validate Safe wallet",
      });
    }
  };

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/deployments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: id,
          userWallet,
          safeWallet: safeAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Deployment failed");
      }

      return response.json();
    },
    onSuccess: () => {
      setLocation("/dashboard");
    },
  });

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Deploy Your Agent</h1>
          <p className="text-muted-foreground">
            Connect your Safe wallet to start trading with <strong>{agent?.name}</strong>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Agent Details</CardTitle>
            <CardDescription>Venue: {agent?.venue}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* User Wallet */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Your Wallet Address *
              </label>
              <Input
                type="text"
                value={userWallet}
                onChange={(e) => setUserWallet(e.target.value)}
                placeholder="0x..."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The wallet address that owns this agent
              </p>
            </div>

            {/* Safe Wallet */}
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Safe Wallet Address *
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={safeAddress}
                  onChange={(e) => {
                    setSafeAddress(e.target.value);
                    setValidationStatus({ checking: false, valid: false });
                  }}
                  placeholder="0x..."
                  className="font-mono"
                />
                <Button
                  type="button"
                  onClick={() => validateSafe(safeAddress)}
                  disabled={validationStatus.checking || !safeAddress}
                >
                  {validationStatus.checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Validate"
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Your Safe multisig wallet on Arbitrum that will hold trading funds
              </p>
            </div>

            {/* Validation Status */}
            {validationStatus.checking && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>Validating Safe wallet...</AlertDescription>
              </Alert>
            )}

            {validationStatus.valid && (
              <Alert className="border-green-500 bg-green-500/10">
                <Check className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium text-green-700 dark:text-green-400">
                      Safe wallet is ready for trading!
                    </p>
                    {validationStatus.balances && (
                      <div className="text-sm space-y-1">
                        <p>
                          USDC: {validationStatus.balances.usdc.formatted}
                        </p>
                        <p>
                          ETH: {validationStatus.balances.eth.formatted}
                        </p>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {validationStatus.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationStatus.error}</AlertDescription>
              </Alert>
            )}

            {/* Deploy Button */}
            <div className="pt-4">
              <Button
                className="w-full"
                size="lg"
                onClick={() => deployMutation.mutate()}
                disabled={
                  !validationStatus.valid ||
                  !userWallet ||
                  !safeAddress ||
                  deployMutation.isPending
                }
              >
                {deployMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy Agent
                  </>
                )}
              </Button>

              {deployMutation.error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {deployMutation.error.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                About Safe Wallets
              </h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Non-custodial: You maintain full control</li>
                <li>• Multi-sig capable: Optional extra security</li>
                <li>• Used by $100B+ in crypto assets</li>
                <li>• Agent can only trade, not withdraw</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            onClick={() => setLocation("/creator")}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
