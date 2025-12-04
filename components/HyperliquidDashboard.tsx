/**
 * Hyperliquid Agent Dashboard
 * Manage agent funds, view positions, and monitor performance
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface HyperliquidDashboardProps {
  deploymentId: string;
  agentAddress: string;
  userAddress: string;
}

export function HyperliquidDashboard({
  deploymentId,
  agentAddress,
  userAddress,
}: HyperliquidDashboardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userBalance, setUserBalance] = useState(0);
  const [agentBalance, setAgentBalance] = useState(0);
  const [positions, setPositions] = useState<any[]>([]);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'transfer'>('overview');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      // Load balances
      const serviceUrl = process.env.NEXT_PUBLIC_HYPERLIQUID_SERVICE_URL || 'http://localhost:5001';
      
      const [userBalRes, agentBalRes, positionsRes] = await Promise.all([
        fetch(`${serviceUrl}/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress }),
        }),
        fetch(`${serviceUrl}/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: agentAddress }),
        }),
        fetch(`${serviceUrl}/positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: agentAddress }),
        }),
      ]);

      const userData = await userBalRes.json();
      const agentData = await agentBalRes.json();
      const posData = await positionsRes.json();

      if (userData.success) setUserBalance(userData.withdrawable);
      if (agentData.success) setAgentBalance(agentData.withdrawable);
      if (posData.success) setPositions(posData.positions);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) return;

    try {
      setTransferring(true);
      // This would call your transfer API
      const response = await fetch('/api/hyperliquid/transfer-to-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deploymentId,
          amount: parseFloat(transferAmount),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTransferAmount('');
        await loadData();
      }
    } catch (err) {
      console.error('Transfer failed:', err);
    } finally {
      setTransferring(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium opacity-90">Your Balance</h3>
            <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-3xl font-bold">${(userBalance || 0).toFixed(2)}</p>
          <p className="text-xs opacity-75 mt-1">Available on Hyperliquid</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium opacity-90">Agent Balance</h3>
            <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-3xl font-bold">${(agentBalance || 0).toFixed(2)}</p>
          <p className="text-xs opacity-75 mt-1">Trading capital</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium opacity-90">Active Positions</h3>
            <svg className="w-8 h-8 opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <p className="text-3xl font-bold">{positions.length}</p>
          <p className="text-xs opacity-75 mt-1">Open positions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'positions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Positions
            </button>
            <button
              onClick={() => setActiveTab('transfer')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'transfer'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Transfer Funds
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Wallet Addresses
                </h3>
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">Your Wallet</p>
                    <code className="text-xs bg-white px-3 py-1 rounded border block break-all">
                      {userAddress}
                    </code>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">Agent Wallet</p>
                    <code className="text-xs bg-white px-3 py-1 rounded border block break-all">
                      {agentAddress}
                    </code>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Your wallet holds the main funds on Hyperliquid</li>
                  <li>• Transfer funds to agent for trading</li>
                  <li>• Agent trades automatically based on signals</li>
                  <li>• Withdraw profits back to your wallet anytime</li>
                </ul>
              </div>
            </div>
          )}

          {/* Positions Tab */}
          {activeTab === 'positions' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Active Positions
              </h3>
              {positions.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-600">No active positions</p>
                  <p className="text-sm text-gray-500 mt-1">Positions will appear here when agent starts trading</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {positions.map((pos, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold">{pos.coin}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            parseFloat(pos.szi) > 0
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {parseFloat(pos.szi) > 0 ? 'LONG' : 'SHORT'}
                          </span>
                        </div>
                        <span className={`font-semibold ${
                          parseFloat(pos.unrealizedPnl) >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          {parseFloat(pos.unrealizedPnl) >= 0 ? '+' : ''}${parseFloat(pos.unrealizedPnl).toFixed(2)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Size:</span>
                          <span className="ml-2 font-medium">{Math.abs(parseFloat(pos.szi))}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Entry:</span>
                          <span className="ml-2 font-medium">${parseFloat(pos.entryPx).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Value:</span>
                          <span className="ml-2 font-medium">${parseFloat(pos.positionValue).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Leverage:</span>
                          <span className="ml-2 font-medium">{pos.leverage}x</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transfer Tab */}
          {activeTab === 'transfer' && (
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Transfer Funds to Agent
              </h3>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Available Balance:</span>
                  <span className="font-semibold">${(userBalance || 0).toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Agent Balance:</span>
                  <span className="font-semibold">${(agentBalance || 0).toFixed(2)} USDC</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount (USDC)
                  </label>
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    max={userBalance || 0}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  />
                  <div className="flex gap-2 mt-2">
                    {[25, 50, 75, 100].map((percent) => (
                      <button
                        key={percent}
                        onClick={() => setTransferAmount((((userBalance || 0) * percent) / 100).toFixed(2))}
                        className="flex-1 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={transferring || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > (userBalance || 0)}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {transferring ? 'Transferring...' : 'Transfer to Agent'}
                </button>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> Funds transferred to agent can be used for trading. You can withdraw profits back anytime.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => window.open('https://app.hyperliquid-testnet.xyz', '_blank')}
          className="bg-white border border-gray-300 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">View on Hyperliquid</h4>
              <p className="text-sm text-gray-600 mt-1">See your positions on Hyperliquid</p>
            </div>
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
        </button>

        <button
          onClick={() => router.push('/my-deployments')}
          className="bg-white border border-gray-300 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">All Deployments</h4>
              <p className="text-sm text-gray-600 mt-1">Manage all your trading agents</p>
            </div>
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}

