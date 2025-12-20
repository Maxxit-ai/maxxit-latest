/**
 * Debug page to check why deployments aren't showing
 */

import { useEffect, useState } from 'react';
import { Header } from '@components/Header';
import { usePrivy } from '@privy-io/react-auth';
import { Loader2 } from 'lucide-react';

export default function DebugDeployments() {
  const { authenticated, user, login } = usePrivy();
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testAPI = async () => {
    if (!user?.wallet?.address) {
      setError('No wallet address found');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/deployments?userWallet=${user.wallet.address}`);
      const data = await response.json();
      
      setApiResponse({
        status: response.status,
        ok: response.ok,
        data: data,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      testAPI();
    }
  }, [authenticated, user?.wallet?.address]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Debug: My Deployments</h1>

        <div className="space-y-6">
          {/* Authentication Status */}
          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="text-xl font-semibold mb-4">🔐 Authentication Status</h2>
            <div className="space-y-2 font-mono text-sm">
              <div>
                <span className="text-muted-foreground">Authenticated: </span>
                <span className={authenticated ? 'text-green-500' : 'text-red-500'}>
                  {authenticated ? '✅ Yes' : '❌ No'}
                </span>
              </div>
              {authenticated && (
                <>
                  <div>
                    <span className="text-muted-foreground">Wallet Address: </span>
                    <span className="text-primary">{user?.wallet?.address || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Wallet Type: </span>
                    <span>{user?.wallet?.walletClientType || 'N/A'}</span>
                  </div>
                </>
              )}
            </div>
            {!authenticated && (
              <button
                onClick={login}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
              >
                Connect Wallet
              </button>
            )}
          </div>

          {/* API Response */}
          {authenticated && (
            <div className="border border-border rounded-lg p-6 bg-card">
              <h2 className="text-xl font-semibold mb-4">📡 API Response</h2>
              
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : error ? (
                <div className="text-red-500">❌ Error: {error}</div>
              ) : apiResponse ? (
                <div className="space-y-4">
                  <div className="font-mono text-sm space-y-2">
                    <div>
                      <span className="text-muted-foreground">Status: </span>
                      <span className={apiResponse.ok ? 'text-green-500' : 'text-red-500'}>
                        {apiResponse.status} {apiResponse.ok ? '✅' : '❌'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Deployments Found: </span>
                      <span className="text-primary">
                        {Array.isArray(apiResponse.data) ? apiResponse.data.length : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {Array.isArray(apiResponse.data) && apiResponse.data.length > 0 ? (
                    <div className="space-y-4">
                      <h3 className="font-semibold">✅ Deployments:</h3>
                      {apiResponse.data.map((dep: any, i: number) => (
                        <div key={i} className="border border-border rounded p-4 bg-background space-y-1 text-sm">
                          <div><strong>Agent:</strong> {dep.agent?.name || dep.agentId}</div>
                          <div><strong>Venue:</strong> {dep.agent?.venue}</div>
                          <div><strong>User Wallet:</strong> {dep.userWallet}</div>
                          <div><strong>Status:</strong> {dep.status}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-yellow-600">
                      ⚠️  No deployments returned from API
                    </div>
                  )}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Show Raw Response
                    </summary>
                    <pre className="mt-2 p-4 bg-background rounded border border-border overflow-auto text-xs">
                      {JSON.stringify(apiResponse, null, 2)}
                    </pre>
                  </details>

                  <button
                    onClick={testAPI}
                    className="mt-4 px-4 py-2 border border-border rounded-md hover:bg-accent"
                  >
                    🔄 Refresh
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Expected Deployments */}
          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="text-xl font-semibold mb-4">📊 Expected Deployments (from DB)</h2>
            <div className="space-y-2 text-sm">
              <div className="p-3 bg-background rounded border border-border">
                <div><strong>User:</strong> 0xa10846a81528d429b50b0dcbf8968938a572fac5</div>
                <div><strong>Agent:</strong> Lisp (HYPERLIQUID)</div>
                <div><strong>Status:</strong> ACTIVE</div>
              </div>
              <div className="p-3 bg-background rounded border border-border">
                <div><strong>User:</strong> 0x796a837c78326ba693847deebd7811d6b6854c56</div>
                <div><strong>Agent:</strong> Lisp (HYPERLIQUID)</div>
                <div><strong>Status:</strong> ACTIVE</div>
              </div>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="text-xl font-semibold mb-4">🔧 Troubleshooting</h2>
            <div className="space-y-2 text-sm">
              <div>✅ Code pushed to GitHub: <code>931b7ef</code></div>
              <div>⏳ Check if production deployed the latest commit</div>
              <div>🔄 Try hard refresh: <code>Ctrl+Shift+R</code> or <code>Cmd+Shift+R</code></div>
              <div>🧹 Clear browser cache</div>
              <div>📱 Try incognito/private mode</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

