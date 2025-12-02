import { useEffect, useState } from 'react';
import { Header } from '@components/Header';
import GMXSetupButton from '@components/GMXSetupButton';
import { SPOTSetupButton } from '@components/SPOTSetupButton';
import { HyperliquidSetupButton } from '@components/HyperliquidSetupButton';
import { OstiumSetupButton } from '@components/OstiumSetupButton';
import { HyperliquidAgentModal } from '@components/HyperliquidAgentModal';
import { usePrivy } from '@privy-io/react-auth';
import { 
  Wallet, 
  Activity, 
  MessageCircle, 
  CheckCircle,
  TrendingUp,
  Settings,
  Loader2,
  X,
  Copy,
  Zap
} from 'lucide-react';

interface Deployment {
  id: string;
  agentId: string;
  agent: {
    name: string;
    venue: string;
  };
  userWallet: string;
  safeWallet: string;
  moduleEnabled: boolean;
  status: string;
  telegramLinked?: boolean;
  enabledVenues?: string[];
}

export default function MyDeployments() {
  const { authenticated, user, login } = usePrivy();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>('');
  const [selectedAgentName, setSelectedAgentName] = useState<string>('');
  const [linkCode, setLinkCode] = useState<string>('');
  const [botUsername, setBotUsername] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      fetchDeployments();
    } else {
      setLoading(false);
    }
  }, [authenticated, user?.wallet?.address]);

  const fetchDeployments = async () => {
    if (!user?.wallet?.address) {
      return;
    }

    try {
      // Fetch deployments for logged-in Privy wallet
      const response = await fetch(`/api/deployments?userWallet=${user.wallet.address}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch deployments');
      }

      const data = await response.json();
      
      // Ensure data is always an array
      if (Array.isArray(data)) {
        setDeployments(data);
      } else {
        console.error('Invalid response format:', data);
        setDeployments([]);
      }
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
      setDeployments([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleConnectTelegram = (deploymentId: string) => {
    setSelectedDeploymentId(deploymentId);
    setTelegramModalOpen(true);
    setLinkCode('');
    setBotUsername('');
    setGenerating(false);
  };

  const generateLinkCode = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/telegram/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deploymentId: selectedDeploymentId,
          userWallet: user?.wallet?.address || ''
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate link code');
      }

      const data = await response.json();
      setLinkCode(data.linkCode);
      setBotUsername(data.botUsername);
    } catch (error: any) {
      alert('Error: ' + error.message);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Deployments</h1>
          <p className="text-muted-foreground">
            Manage your agent subscriptions and connect Telegram for manual trading
          </p>
        </div>

        {!authenticated ? (
          <div className="border border-border rounded-lg bg-card">
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Wallet className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Connect Wallet</h3>
              <p className="text-muted-foreground mb-4 text-center">
                Please connect your wallet to view your deployments
              </p>
              <button 
                onClick={login}
                className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Connect Wallet
              </button>
            </div>
          </div>
        ) : deployments.length === 0 ? (
          <div className="border border-border rounded-lg bg-card">
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <Activity className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No deployments yet</h3>
              <p className="text-muted-foreground mb-4 text-center">
                Deploy an agent to start automated trading
              </p>
              <a 
                href="/"
                className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Browse Agents
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {deployments.map((deployment) => (
              <div key={deployment.id} className="border border-border rounded-lg bg-card overflow-hidden">
                {/* Header */}
                <div className="border-b border-border p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-semibold">{deployment.agent.name}</h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      deployment.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}>
                      {deployment.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {deployment.agent.venue}
                  </p>
                </div>
                
                {/* Content */}
                <div className="p-6 space-y-4">
                  {/* Safe Wallet */}
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Wallet className="w-4 h-4" />
                      Safe Wallet
                    </div>
                    <p className="font-mono text-sm">
                      {deployment.safeWallet.slice(0, 6)}...{deployment.safeWallet.slice(-4)}
                    </p>
                  </div>

                  {/* Module Status */}
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Activity className="w-4 h-4" />
                      Module Status
                    </div>
                    <div className="flex items-center gap-2">
                      {deployment.moduleEnabled ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm">Enabled</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not enabled</span>
                      )}
                    </div>
                  </div>

                  {/* Trading Setup (if module not enabled) */}
                  {!deployment.moduleEnabled && (
                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Zap className="w-4 h-4" />
                        {deployment.agent.venue === 'MULTI' 
                          ? 'Multi-Venue Trading Setup' 
                          : deployment.agent.venue === 'GMX' 
                            ? 'GMX Trading Setup' 
                            : deployment.agent.venue === 'HYPERLIQUID' 
                              ? 'Hyperliquid Trading Setup' 
                              : deployment.agent.venue === 'OSTIUM' 
                                ? 'Ostium Trading Setup' 
                                : 'Trading Module Setup'}
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-3">
                        <p className="text-xs text-orange-700 dark:text-orange-300 mb-2">
                          ⚡ Setup required before trading
                        </p>
                        <ul className="text-xs text-orange-600 dark:text-orange-400 space-y-1 ml-4">
                          {deployment.agent.venue === 'MULTI' ? (
                            <>
                              <li>• Connect to all available trading venues</li>
                              <li>• Setup Hyperliquid and Ostium for trading</li>
                              <li>• Agent will route trades intelligently</li>
                            </>
                          ) : (
                            <>
                              <li>• Enable Maxxit Trading Module on your Safe</li>
                              {deployment.agent.venue === 'GMX' && (
                                <li>• Authorize GMX executor</li>
                              )}
                              {deployment.agent.venue === 'HYPERLIQUID' && (
                                <>
                                  <li>• Approve USDC for Hyperliquid bridge</li>
                                  <li>• Register agent wallet for trading</li>
                                </>
                              )}
                              {deployment.agent.venue === 'OSTIUM' && (
                                <>
                                  <li>• Connect your Arbitrum wallet</li>
                                  <li>• Generate agent wallet for trading</li>
                                  <li>• Approve agent to trade on your behalf</li>
                                </>
                              )}
                              <li>• {deployment.agent.venue === 'GMX' ? 'Sign ONE transaction and you\'re ready!' : deployment.agent.venue === 'HYPERLIQUID' ? 'Sign ONE transaction and bridge USDC to start trading!' : deployment.agent.venue === 'OSTIUM' ? 'Quick setup - start trading on Arbitrum!' : 'Then the system will auto-setup on first trade'}</li>
                            </>
                          )}
                        </ul>
                      </div>
                      {deployment.agent.venue === 'MULTI' ? (
                        <div className="space-y-2">
                          {deployment.enabledVenues?.includes('SPOT') && (
                            <SPOTSetupButton 
                              safeAddress={deployment.safeWallet}
                              onSetupComplete={() => fetchDeployments()}
                            />
                          )}
                          {deployment.enabledVenues?.includes('HYPERLIQUID') && (
                            <HyperliquidSetupButton 
                              safeAddress={deployment.safeWallet}
                              onSetupComplete={() => fetchDeployments()}
                            />
                          )}
                          {deployment.enabledVenues?.includes('OSTIUM') && (
                            <OstiumSetupButton 
                              agentId={deployment.agentId}
                              agentName={deployment.agent.name}
                              onSetupComplete={() => fetchDeployments()}
                            />
                          )}
                        </div>
                      ) : deployment.agent.venue === 'GMX' ? (
                        <GMXSetupButton 
                          safeAddress={deployment.safeWallet}
                          onSetupComplete={() => fetchDeployments()}
                        />
                      ) : deployment.agent.venue === 'HYPERLIQUID' ? (
                        <HyperliquidSetupButton 
                          safeAddress={deployment.safeWallet}
                          onSetupComplete={() => fetchDeployments()}
                        />
                      ) : deployment.agent.venue === 'OSTIUM' ? (
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
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <MessageCircle className="w-4 h-4" />
                      Manual Trading
                    </div>
                    {deployment.telegramLinked ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Telegram Connected</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectTelegram(deployment.id)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-input bg-background rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Connect Telegram
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <a
                      href={`/agent/${deployment.agentId}`}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 border border-input bg-background rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    >
                      <TrendingUp className="w-4 h-4" />
                      View Agent
                    </a>
                    <button
                      onClick={() => handleSetupHyperliquid(deployment.agentId, deployment.agent.name)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md text-sm font-medium hover:shadow-lg transition-all"
                      title="Setup Hyperliquid Trading"
                    >
                      <Zap className="w-4 h-4" />
                      <span className="hidden sm:inline">Hyperliquid</span>
                    </button>
                    <button className="inline-flex items-center justify-center px-4 py-2 border border-input bg-background rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telegram Connect Modal */}
      {telegramModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] p-4">
            <div className="bg-card border border-border rounded-lg shadow-lg">
              {/* Modal Header */}
              <div className="border-b border-border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-blue-500" />
                      Connect Telegram
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Link your Safe wallet to Telegram for manual trading
                    </p>
                  </div>
                  <button
                    onClick={() => setTelegramModalOpen(false)}
                    className="rounded-sm opacity-70 hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4">
                {!linkCode && (
                  <button
                    onClick={generateLinkCode}
                    disabled={generating}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4" />
                        Generate Link Code
                      </>
                    )}
                  </button>
                )}

                {linkCode && (
                  <div className="space-y-4">
                    {/* Step 1: Open Bot */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Step 1: Open Telegram Bot</span>
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                          1 of 2
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => window.open(`https://t.me/${botUsername}`, '_blank')}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Open @{botUsername}
                        </button>
                        <button
                          onClick={copyBotLink}
                          className="shrink-0 inline-flex items-center justify-center w-10 h-10 border border-input bg-background rounded-md hover:bg-accent"
                          title="Copy bot link"
                        >
                          {copied ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Step 2: Send Command */}
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Step 2: Send This Command</span>
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                          2 of 2
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted px-4 py-3 rounded font-mono text-center">
                          /link {linkCode}
                        </code>
                        <button
                          onClick={copyCommand}
                          className="shrink-0 inline-flex items-center justify-center w-10 h-10 border border-input bg-background rounded-md hover:bg-accent"
                          title="Copy command"
                        >
                          {copied ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Tip */}
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        💡 After linking, trade with natural language: "Buy 10 USDC of WETH"
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hyperliquid Setup Modal */}
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
