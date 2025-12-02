/**
 * Ostium Setup Button - Connect Arbitrum Wallet + Generate Agent + Approve
 * Used for deploying Ostium agents
 */

import { useState } from 'react';
import { Zap, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { OstiumConnect } from './OstiumConnect';

interface OstiumSetupButtonProps {
  agentId: string;
  agentName: string;
  onSetupComplete?: () => void;
}

export function OstiumSetupButton({ agentId, agentName, onSetupComplete }: OstiumSetupButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-md text-sm font-medium hover:from-orange-700 hover:to-red-700 transition-all"
      >
        <Zap className="w-4 h-4" />
        Setup Ostium Trading
      </button>

      {showModal && (
        <OstiumConnect
          agentId={agentId}
          agentName={agentName}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            onSetupComplete?.();
          }}
        />
      )}
    </>
  );
}

