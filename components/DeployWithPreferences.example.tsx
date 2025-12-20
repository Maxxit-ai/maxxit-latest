/**
 * Example: How to integrate TradingPreferencesModal into deployment flow
 * 
 * This is an EXAMPLE file showing how to integrate the Agent HOW preferences modal.
 * Copy this pattern into your actual deployment components.
 */

import { useState, useEffect } from 'react';
import { TradingPreferencesModal } from './TradingPreferencesModal';

interface DeployWithPreferencesProps {
  agentId: string;
  userWallet: string;
  onDeployComplete?: () => void;
}

export function DeployWithPreferences({
  agentId,
  userWallet,
  onDeployComplete,
}: DeployWithPreferencesProps) {
  const [showPreferences, setShowPreferences] = useState(false);
  const [hasPreferences, setHasPreferences] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  // Check if user has set trading preferences
  useEffect(() => {
    if (!userWallet) return;

    fetch(`/api/user/trading-preferences?wallet=${userWallet}`)
      .then((res) => res.json())
      .then((data) => {
        // If all preferences are at default (50), user hasn't customized
        const prefs = data.preferences;
        const hasCustomized =
          prefs.risk_tolerance !== 50 ||
          prefs.trade_frequency !== 50 ||
          prefs.social_sentiment_weight !== 50 ||
          prefs.price_momentum_focus !== 50 ||
          prefs.market_rank_priority !== 50;

        setHasPreferences(hasCustomized);
      })
      .catch((err) => {
        console.error('Failed to check preferences:', err);
        setHasPreferences(false);
      });
  }, [userWallet]);

  const handleDeploy = async () => {
    // First-time user - show preferences modal
    if (!hasPreferences) {
      setShowPreferences(true);
      return;
    }

    // User has preferences - deploy directly
    await proceedWithDeployment();
  };

  const proceedWithDeployment = async () => {
    setIsDeploying(true);

    try {
      // Your deployment logic here
      // Example:
      const response = await fetch(`/api/agents/${agentId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userWallet }),
      });

      if (!response.ok) {
        throw new Error('Deployment failed');
      }

      if (onDeployComplete) {
        onDeployComplete();
      }
    } catch (error) {
      console.error('Deployment error:', error);
      alert('Failed to deploy agent');
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Agent details, venue selection, etc. */}
      
      {/* Deploy button with smart preferences flow */}
      <button
        onClick={handleDeploy}
        disabled={isDeploying}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isDeploying ? 'Deploying...' : 'Deploy Agent'}
      </button>

      {/* Option to customize preferences (for existing users) */}
      {hasPreferences && (
        <button
          onClick={() => setShowPreferences(true)}
          className="w-full px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-semibold hover:bg-secondary/80 transition-colors"
        >
          ⚙️ Customize Trading Style
        </button>
      )}

      {/* Trading Preferences Modal */}
      {showPreferences && (
        <TradingPreferencesModal
          userWallet={userWallet}
          onClose={() => setShowPreferences(false)}
          onSave={() => {
            setShowPreferences(false);
            setHasPreferences(true);
            
            // If this was first-time setup, proceed with deployment
            if (!hasPreferences) {
              proceedWithDeployment();
            }
          }}
        />
      )}

      {/* Explanation for first-time users */}
      {!hasPreferences && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-primary mb-2">
            🎯 Personalize Your Trading
          </h4>
          <p className="text-xs text-muted-foreground">
            Before deploying, we'll help you customize your trading style with 5 simple sliders.
            This creates a "trade clone" that matches your risk tolerance and strategy preferences.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Alternative: Add to Settings/Dashboard
 * 
 * For users who want to adjust preferences later:
 */
export function TradingStyleSettings({ userWallet }: { userWallet: string }) {
  const [showPreferences, setShowPreferences] = useState(false);

  return (
    <div className="border border-border rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Trading Style</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Personalize how your agents size positions
          </p>
        </div>
        <button
          onClick={() => setShowPreferences(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Edit Preferences
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Risk Tolerance:</span>
          <span className="ml-2 font-medium">Moderate</span>
        </div>
        <div>
          <span className="text-muted-foreground">Trade Frequency:</span>
          <span className="ml-2 font-medium">Active</span>
        </div>
        <div>
          <span className="text-muted-foreground">Social Weight:</span>
          <span className="ml-2 font-medium">High</span>
        </div>
        <div>
          <span className="text-muted-foreground">Momentum Focus:</span>
          <span className="ml-2 font-medium">Balanced</span>
        </div>
      </div>

      {showPreferences && (
        <TradingPreferencesModal
          userWallet={userWallet}
          onClose={() => setShowPreferences(false)}
          onSave={() => {
            setShowPreferences(false);
            // Optionally refetch preferences to update display
          }}
        />
      )}
    </div>
  );
}

