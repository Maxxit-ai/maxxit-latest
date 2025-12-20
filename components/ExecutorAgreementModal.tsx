import React, { useState } from 'react';
import { X, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { createExecutorAgreementWithMetaMask } from '@lib/executor-agreement';

interface ExecutorAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  signal: {
    id: string;
    agentId: string;
    tokenSymbol: string;
    side: string;
    sizeModel: any;
    agent: {
      name: string;
      creatorWallet: string;
    };
  };
  onAgreementSigned: (agreement: any) => void;
}

export function ExecutorAgreementModal({
  isOpen,
  onClose,
  signal,
  onAgreementSigned
}: ExecutorAgreementModalProps) {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<any>(null);

  if (!isOpen) return null;

  const handleSignAgreement = async () => {
    if (!window.ethereum) {
      setError('MetaMask is not installed or not detected.');
      return;
    }

    setIsSigning(true);
    setError(null);

    try {
      // Get the executor wallet address
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        throw new Error('No wallet connected. Please connect MetaMask.');
      }

      const executorWallet = accounts[0];
      const amount = signal.sizeModel?.value || '1'; // Default amount if not specified

      const agreement = await createExecutorAgreementWithMetaMask(
        signal.id,
        signal.agentId,
        signal.tokenSymbol,
        signal.side,
        amount,
        executorWallet
      );

      setAgreement(agreement);
      onAgreementSigned(agreement);
      
      console.log('✅ Executor agreement signed successfully');
    } catch (error: any) {
      console.error('❌ Failed to sign executor agreement:', error);
      setError(`Failed to sign executor agreement: ${error.message}`);
    } finally {
      setIsSigning(false);
    }
  };

  const handleSubmitAgreement = async () => {
    if (!agreement) return;

    try {
      const response = await fetch('/api/admin/executor-agreement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signalId: signal.id,
          executorAgreement: agreement
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Executor agreement submitted successfully');
        onClose();
      } else {
        setError(result.error || 'Failed to submit executor agreement');
      }
    } catch (error: any) {
      console.error('❌ Failed to submit executor agreement:', error);
      setError(`Failed to submit executor agreement: ${error.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Executor Agreement Required
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Signal Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3">Signal Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Agent:</span>
                <span className="ml-2 font-medium">{signal.agent.name}</span>
              </div>
              <div>
                <span className="text-gray-500">Token:</span>
                <span className="ml-2 font-medium">{signal.tokenSymbol}</span>
              </div>
              <div>
                <span className="text-gray-500">Side:</span>
                <span className="ml-2 font-medium">{signal.side}</span>
              </div>
              <div>
                <span className="text-gray-500">Amount:</span>
                <span className="ml-2 font-medium">{signal.sizeModel?.value || '1'}</span>
              </div>
            </div>
          </div>

          {/* Agreement Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 mb-2">Why do I need to sign?</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Proves you agree to execute this specific trade</li>
                  <li>• Creates transparency in the trading process</li>
                  <li>• Shows human oversight of automated signals</li>
                  <li>• Required for all signal executions</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-red-900 mb-1">Error</h3>
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Display */}
          {agreement && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-900 mb-2">Agreement Signed</h3>
                  <p className="text-sm text-green-800 mb-3">
                    Your executor agreement has been signed successfully.
                  </p>
                  <div className="text-xs text-green-700 font-mono">
                    <div>Signature: {agreement.signature.slice(0, 20)}...{agreement.signature.slice(-20)}</div>
                    <div>Timestamp: {agreement.timestamp.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!agreement ? (
              <button
                onClick={handleSignAgreement}
                disabled={isSigning}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSigning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing Agreement...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Sign Executor Agreement
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSubmitAgreement}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Submit Agreement
              </button>
            )}
            
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
