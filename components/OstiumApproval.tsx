import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ethers } from 'ethers';

interface OstiumApprovalProps {
  deploymentId: string;
  agentAddress: string;
  userWallet: string;
  onApprovalComplete: () => void;
  onClose: () => void;
}

// Ostium Trading Contract on Arbitrum Sepolia
const OSTIUM_TRADING_CONTRACT = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411';
const OSTIUM_TRADING_ABI = [
  'function setDelegate(address delegate) external',
  'function delegations(address delegator) view returns (address)',
  'function removeDelegate() external',
];

export function OstiumApproval({
  deploymentId,
  agentAddress,
  userWallet,
  onApprovalComplete,
  onClose,
}: OstiumApprovalProps) {
  const { authenticated, user } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const approveAgent = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!authenticated || !user?.wallet?.address) {
        setError('Please connect your wallet');
        return;
      }

      console.log('[Ostium Approval] Starting approval...');
      console.log('   User:', userWallet);
      console.log('   Agent:', agentAddress);

      // Get provider from Privy
      const provider = await (window as any).ethereum;
      if (!provider) {
        throw new Error('No wallet provider found. Please install MetaMask or connect wallet.');
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const signer = ethersProvider.getSigner();

      // Create contract instance
      const contract = new ethers.Contract(
        OSTIUM_TRADING_CONTRACT,
        OSTIUM_TRADING_ABI,
        signer
      );

      console.log('[Ostium Approval] Calling setDelegate...');

      // Call setDelegate (user signs this transaction)
      const tx = await contract.setDelegate(agentAddress);
      console.log('[Ostium Approval] Transaction sent:', tx.hash);
      setTxHash(tx.hash);

      // Wait for confirmation
      console.log('[Ostium Approval] Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('[Ostium Approval] Confirmed! Block:', receipt.blockNumber);

      setApproved(true);
      
      // Call completion callback after a short delay
      setTimeout(() => {
        onApprovalComplete();
      }, 2000);

    } catch (err: any) {
      console.error('[Ostium Approval] Error:', err);
      
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else if (err.code === -32603) {
        setError('Transaction failed. Please try again.');
      } else {
        setError(err.message || 'Failed to approve agent');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">
          {approved ? '✅ Agent Approved!' : '🔐 Approve Ostium Agent'}
        </h2>

        {!approved ? (
          <>
            <div className="mb-6 space-y-3">
              <p className="text-gray-700">
                Your Ostium agent has been assigned! Now you need to approve it to trade on your behalf.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-semibold text-sm text-blue-900 mb-2">Agent Address:</p>
                <p className="text-xs font-mono text-blue-700 break-all">{agentAddress}</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-900">
                  <strong>⚠️ Important:</strong> You will sign a transaction with your wallet to approve this agent. 
                  The agent will then be able to:
                </p>
                <ul className="text-sm text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                  <li>Open positions on your behalf</li>
                  <li>Close positions</li>
                  <li>Manage your trades</li>
                </ul>
                <p className="text-sm text-yellow-900 mt-2">
                  ✅ <strong>You remain in control:</strong> You can revoke access anytime, and the agent cannot withdraw your funds.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {txHash && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 text-sm mb-2">Transaction submitted!</p>
                <a
                  href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs break-all"
                >
                  View on Arbiscan →
                </a>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={approveAgent}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Approving...' : '✍️ Sign Approval Transaction'}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              This is a one-time approval. Your wallet will prompt you to sign.
            </p>
          </>
        ) : (
          <>
            <div className="text-center space-y-4">
              <div className="text-6xl">🎉</div>
              <p className="text-lg text-gray-700">
                Agent approved successfully! Your Ostium agent can now trade on your behalf.
              </p>
              
              {txHash && (
                <a
                  href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  View transaction →
                </a>
              )}

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-green-900">
                  ✅ Your agent is now ready to execute trades automatically!
                </p>
              </div>

              <button
                onClick={onApprovalComplete}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg mt-4"
              >
                Continue to Dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

