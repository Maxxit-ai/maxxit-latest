import React, { useState, useEffect } from 'react';
import { Shield, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Header } from '@components/Header';
import { ExecutorAgreementModal } from '@components/ExecutorAgreementModal';

interface Signal {
  id: string;
  tokenSymbol: string;
  side: string;
  createdAt: string;
  sizeModel: any;
  agent: {
    id: string;
    name: string;
    creatorWallet: string;
  };
}

export default function ExecutorAgreementsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/signals-needing-executor-agreement');
      const result = await response.json();
      
      if (result.success) {
        setSignals(result.signals);
      } else {
        console.error('Failed to fetch signals:', result.error);
      }
    } catch (error) {
      console.error('Error fetching signals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, []);

  const handleSignAgreement = (signal: Signal) => {
    setSelectedSignal(signal);
    setShowAgreementModal(true);
  };

  const handleAgreementSigned = (agreement: any) => {
    console.log('Executor agreement signed:', agreement);
    // Refresh the signals list
    fetchSignals();
  };

  const handleCloseModal = () => {
    setShowAgreementModal(false);
    setSelectedSignal(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Executor Agreements</h1>
              <p className="mt-2 text-gray-600">
                Review and sign executor agreements for pending signals. 
                Agents have already provided proof of intent during creation - you just need to authorize execution.
              </p>
            </div>
            <button
              onClick={fetchSignals}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Agreements</p>
                <p className="text-2xl font-bold text-gray-900">{signals.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Ready for Execution</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Completed Today</p>
                <p className="text-2xl font-bold text-gray-900">0</p>
              </div>
            </div>
          </div>
        </div>

        {/* Signals List */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Signals Requiring Executor Agreement</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-gray-600">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading signals...
              </div>
            </div>
          ) : signals.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No signals pending</h3>
              <p className="text-gray-600">All signals have executor agreements or are not ready for execution.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {signals.map((signal) => (
                <div key={signal.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{signal.agent.name}</span>
                          <span className="text-xs text-gray-500">•</span>
                          <span className="text-sm text-gray-600">{signal.tokenSymbol}</span>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                          signal.side === 'BUY' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {signal.side}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Amount: {signal.sizeModel?.value || '1'}</span>
                        <span>•</span>
                        <span>Created: {new Date(signal.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-yellow-600">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-medium">Pending Agreement</span>
                      </div>
                      
                      <button
                        onClick={() => handleSignAgreement(signal)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        <Shield className="h-4 w-4" />
                        Sign Agreement
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Executor Agreement Modal */}
      {selectedSignal && (
        <ExecutorAgreementModal
          isOpen={showAgreementModal}
          onClose={handleCloseModal}
          signal={selectedSignal}
          onAgreementSigned={handleAgreementSigned}
        />
      )}
    </div>
  );
}
