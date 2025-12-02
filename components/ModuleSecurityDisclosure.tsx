/**
 * Module Security Disclosure Component
 * Shows users exactly what permissions they're granting when enabling the trading module
 */

import { Shield, Lock, Unlock, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

interface ModuleSecurityDisclosureProps {
  moduleAddress: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function ModuleSecurityDisclosure({
  moduleAddress,
  onConfirm,
  onCancel,
  isOpen,
}: ModuleSecurityDisclosureProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border-2 border-primary rounded-lg p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Shield className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              🔐 Module Security Review
            </h2>
            <p className="text-muted-foreground text-sm">
              Please review what permissions you're granting to the trading module
            </p>
          </div>
        </div>

        {/* Module Info */}
        <div className="mb-6 p-4 bg-background border border-border rounded-lg">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Module Address
          </h3>
          <p className="font-mono text-xs text-muted-foreground break-all">
            {moduleAddress}
          </p>
          <a
            href={`https://arbiscan.io/address/${moduleAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline mt-2 inline-block"
          >
            View on Arbiscan →
          </a>
        </div>

        {/* Permissions Granted */}
        <div className="mb-6">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Unlock className="h-4 w-4 text-green-500" />
            What This Module CAN Do:
          </h3>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Execute trades on your behalf</p>
                <p className="text-xs text-muted-foreground">
                  Swap tokens based on your agent's signals and strategy
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Swap USDC for other tokens</p>
                <p className="text-xs text-muted-foreground">
                  Open positions by trading USDC for whitelisted tokens
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Close positions</p>
                <p className="text-xs text-muted-foreground">
                  Trade tokens back to USDC to realize profits or losses
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Approve Uniswap V3 Router</p>
                <p className="text-xs text-muted-foreground">
                  Automatically approves Uniswap Router to swap your USDC (standard for DEX trading)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Charge trading fees</p>
                <p className="text-xs text-muted-foreground">
                  Deduct small fees (0.2 USDC per trade) and profit share (20% of gains)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Permissions NOT Granted */}
        <div className="mb-6">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            What This Module CANNOT Do:
          </h3>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Withdraw funds to external addresses</p>
                <p className="text-xs text-muted-foreground">
                  Cannot transfer USDC or tokens out of your Safe
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Change Safe owners or threshold</p>
                <p className="text-xs text-muted-foreground">
                  You maintain full control of your Safe's security settings
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Execute arbitrary transactions</p>
                <p className="text-xs text-muted-foreground">
                  Can only execute pre-approved trading functions
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Enable or disable other modules</p>
                <p className="text-xs text-muted-foreground">
                  Cannot modify your Safe's module configuration
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Process Explanation */}
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-foreground mb-2">What Happens Next:</h4>
              <div className="text-sm text-muted-foreground space-y-2">
                <p><strong>Transaction 1:</strong> Deploy your Safe wallet</p>
                <p><strong>Transaction 2:</strong> Batch enable module + approve USDC for trading (MultiSend)</p>
                <p className="text-xs pt-2 text-blue-600">✨ Just 2 MetaMask signatures - all automated, no Safe UI needed!</p>
              </div>
            </div>
          </div>
        </div>

        {/* Important Notes */}
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-foreground mb-2">Important Notes:</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>You maintain full custody of your funds at all times</li>
                <li>You can disable this module anytime via Safe UI</li>
                <li>The module is open-source and audited</li>
                <li>Trading is non-custodial - we never hold your funds</li>
                <li>Gas fees are covered by the platform (gasless trading)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
          >
            I Understand, Create Safe
          </button>
        </div>

        {/* Fine Print */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          By proceeding, you acknowledge that you understand the permissions being granted and accept the risks of automated trading.
        </p>
      </div>
    </div>
  );
}

