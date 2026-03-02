/**
 * Avantis Setup Button - Connect Base Wallet + Generate Agent + Approve
 * Used for deploying Avantis agents on Base chain
 */

import { useState } from 'react';
import { Zap } from 'lucide-react';
import { AvantisConnect } from './AvantisConnect';

interface AvantisSetupButtonProps {
    agentId: string;
    agentName: string;
    onSetupComplete?: () => void;
}

export function AvantisSetupButton({ agentId, agentName, onSetupComplete }: AvantisSetupButtonProps) {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
                <Zap className="w-4 h-4" />
                Setup Avantis Trading
            </button>

            {showModal && (
                <AvantisConnect
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
