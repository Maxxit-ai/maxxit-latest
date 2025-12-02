/**
 * Hyperliquid Agent Approval Component
 * Shows instructions for whitelisting agent on Hyperliquid UI
 */

import { useState } from 'react';
import { ExternalLink, Copy, Check, RefreshCw, CheckCircle } from 'lucide-react';

interface HyperliquidAgentApprovalProps {
  deploymentId: string;
  agentAddress: string;
  userHyperliquidWallet: string;
  isTestnet?: boolean;
  onApprovalComplete?: () => void;
}

export function HyperliquidAgentApproval({
  deploymentId,
  agentAddress,
  userHyperliquidWallet,
  isTestnet = true,
  onApprovalComplete,
}: HyperliquidAgentApprovalProps) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const hyperliquidUrl = isTestnet 
    ? 'https://app.hyperliquid-testnet.xyz'
    : 'https://app.hyperliquid.xyz';

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(agentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const checkApprovalStatus = async () => {
    try {
      setChecking(true);
      
      // Check if agent is whitelisted by querying Hyperliquid API
      const response = await fetch('/api/hyperliquid/check-agent-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: userHyperliquidWallet,
          agentAddress: agentAddress,
        }),
      });

      const data = await response.json();

      if (data.isApproved) {
        setIsApproved(true);
        
        // Update agent status in database
        await fetch(`/api/agents/${deploymentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ACTIVE' }),
        });

        onApprovalComplete?.();
      } else {
        alert('Agent not yet approved. Please whitelist the agent address on Hyperliquid first.');
      }
    } catch (error: any) {
      console.error('Error checking approval:', error);
      alert('Failed to check approval status: ' + error.message);
    } finally {
      setChecking(false);
    }
  };

  if (isApproved) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-6">
        <div className="flex items-start">
          <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-green-800">
              Agent Approved Successfully!
            </h3>
            <div className="mt-2 text-sm text-green-700">
              <p>The agent is now whitelisted and can trade on your behalf on Hyperliquid.</p>
              <p className="mt-1">Agent will use your funds but cannot withdraw them.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 p-6">
      <h3 className="text-lg font-semibold text-purple-900 mb-4">
        🔐 Whitelist Agent on Hyperliquid
      </h3>

      <div className="space-y-4 mb-6">
        <div className="bg-white rounded-lg p-4 border border-purple-200">
          <p className="font-medium text-gray-900 mb-3">Your Agent Address:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 px-3 py-2 rounded text-sm break-all font-mono text-gray-800">
              {agentAddress}
            </code>
            <button
              onClick={copyAddress}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
              title="Copy address"
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-blue-200">
          <h4 className="font-semibold text-blue-900 mb-3">📋 Step-by-Step Instructions:</h4>
          <ol className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                1
              </span>
              <span>
                <strong>Copy the agent address</strong> above (click the copy icon)
              </span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                2
              </span>
              <span>
                <strong>Open Hyperliquid</strong> {isTestnet ? 'Testnet' : 'Mainnet'}
              </span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                3
              </span>
              <span>
                <strong>Connect</strong> with wallet: 
                <code className="ml-1 text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {userHyperliquidWallet.slice(0, 6)}...{userHyperliquidWallet.slice(-4)}
                </code>
              </span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                4
              </span>
              <span>
                Go to <strong>Settings → API/Agent</strong> or <strong>Account → Agents</strong>
              </span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                5
              </span>
              <span>
                <strong>Add/Whitelist new agent</strong> and paste the agent address
              </span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                6
              </span>
              <span>
                <strong>Confirm</strong> the transaction in your wallet
              </span>
            </li>
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs mr-3 mt-0.5 flex-shrink-0">
                7
              </span>
              <span>
                Come back here and click <strong>"Verify Approval"</strong> below
              </span>
            </li>
          </ol>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <p className="font-medium text-blue-900 mb-2">🛡️ What this approval allows:</p>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>✅ Open perpetual positions using your funds</li>
            <li>✅ Close positions and manage trades</li>
            <li>✅ Manage leverage and position sizing</li>
            <li>❌ <strong>Cannot</strong> withdraw your funds</li>
            <li>❌ <strong>Cannot</strong> transfer assets</li>
          </ul>
        </div>
      </div>

      <div className="flex gap-3">
        <a
          href={hyperliquidUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <span>Open Hyperliquid {isTestnet ? 'Testnet' : 'Mainnet'}</span>
          <ExternalLink className="h-4 w-4" />
        </a>

        <button
          onClick={checkApprovalStatus}
          disabled={checking}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-purple-600 text-purple-600 rounded-lg font-medium hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {checking ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              <span>Verify Approval</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-4 text-xs text-purple-700 bg-purple-50 rounded p-3 border border-purple-200">
        <p>💡 <strong>Tip:</strong> You can revoke agent access anytime from Hyperliquid settings.</p>
        <p className="mt-1">📖 Need help? Check <a href="https://hyperliquid.gitbook.io/" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-900">Hyperliquid docs</a></p>
      </div>
    </div>
  );
}
