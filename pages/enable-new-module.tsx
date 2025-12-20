import { useState } from "react";
import { Check, AlertCircle, Loader2, Rocket, ExternalLink, Copy } from "lucide-react";

const NEW_MODULE_ADDRESS = '0xf934Cbb5667EF2F5d50f9098F9B2A8d018354c19';
const SAFE_ADDRESS = '0xC613Df8883852667066a8a08c65c18eDe285678D';

export default function EnableNewModule() {
  const [checking, setChecking] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [error, setError] = useState("");
  const [transactionData, setTransactionData] = useState("");
  const [copied, setCopied] = useState(false);

  const checkModuleStatus = async () => {
    setChecking(true);
    setError("");

    try {
      const response = await fetch('/api/safe/enable-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          safeAddress: SAFE_ADDRESS,
          moduleAddress: NEW_MODULE_ADDRESS 
        }),
      });

      const data = await response.json();

      if (data.success && data.alreadyEnabled) {
        setIsEnabled(true);
      } else if (data.success && data.needsEnabling) {
        setIsEnabled(false);
        setTransactionData(data.transaction.data);
      } else {
        setError(data.error || 'Failed to check module status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check module status');
    } finally {
      setChecking(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const openSafeUI = () => {
    const txBuilderAppUrl = 'https://apps-portal.safe.global/tx-builder';
    const safeUrl = `https://app.safe.global/apps/open?safe=sep:${SAFE_ADDRESS}&appUrl=${encodeURIComponent(txBuilderAppUrl)}`;
    window.open(safeUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Enable New Trading Module
            </h1>
            <p className="text-gray-300">
              Module with one-time token approval feature
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-8 shadow-2xl">
            
            {/* Module Info */}
            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-300">Safe Address:</span>
                <span className="text-white font-mono text-sm">{SAFE_ADDRESS}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-300">New Module:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{NEW_MODULE_ADDRESS}</span>
                  <a 
                    href={`https://sepolia.etherscan.io/address/${NEW_MODULE_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </div>

            {/* Check Status Button */}
            {!isEnabled && !transactionData && (
              <button
                onClick={checkModuleStatus}
                disabled={checking}
                className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {checking ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Checking...
                  </>
                ) : (
                  <>
                    <Rocket size={20} />
                    Check Module Status
                  </>
                )}
              </button>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-red-200">
                  <p className="font-medium">Error</p>
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              </div>
            )}

            {/* Already Enabled */}
            {isEnabled && (
              <div className="mt-4 p-6 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="text-green-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Module Already Enabled!</h3>
                    <p className="text-green-200">You can now run the setup script</p>
                  </div>
                </div>
                <div className="bg-black/30 p-4 rounded-lg">
                  <p className="text-sm text-gray-300 mb-2">Next step:</p>
                  <code className="text-green-400 text-sm">
                    npx tsx scripts/approve-and-init-new-module.ts
                  </code>
                </div>
              </div>
            )}

            {/* Enable Instructions */}
            {transactionData && !isEnabled && (
              <div className="mt-6 space-y-6">
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <AlertCircle className="text-blue-400" size={20} />
                    Module Not Enabled Yet
                  </h3>
                  <p className="text-blue-200 text-sm">
                    Follow these steps to enable the module via Safe Transaction Builder:
                  </p>
                </div>

                {/* Step 1 */}
                <div className="bg-white/5 p-5 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-2">Copy Transaction Data</h4>
                      <div className="relative">
                        <textarea
                          readOnly
                          value={transactionData}
                          className="w-full h-32 p-3 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-xs resize-none"
                        />
                        <button
                          onClick={() => copyToClipboard(transactionData)}
                          className="absolute top-2 right-2 p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                        >
                          {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-white/5 p-5 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-2">Open Safe Transaction Builder</h4>
                      <button
                        onClick={openSafeUI}
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <ExternalLink size={18} />
                        Open Transaction Builder
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-white/5 p-5 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-3">In Transaction Builder:</h4>
                      <ol className="space-y-2 text-gray-300 text-sm list-decimal list-inside">
                        <li>Select <span className="text-purple-400 font-medium">"Transaction Builder"</span> app</li>
                        <li>Click <span className="text-purple-400 font-medium">"New Batch"</span></li>
                        <li>Under "Enter ABI", click <span className="text-purple-400 font-medium">"Use Contract ABI"</span></li>
                        <li>Select <span className="text-purple-400 font-medium">"Custom ABI"</span></li>
                        <li>In "To Address", enter: <code className="text-white bg-black/30 px-2 py-1 rounded text-xs">{SAFE_ADDRESS}</code></li>
                        <li>Paste the copied transaction data in the <span className="text-purple-400 font-medium">"Encoded Data"</span> field</li>
                        <li>Click <span className="text-purple-400 font-medium">"Add Transaction"</span></li>
                        <li>Click <span className="text-purple-400 font-medium">"Create Batch"</span></li>
                        <li>Review and <span className="text-purple-400 font-medium">"Send Batch"</span></li>
                        <li>Sign the transaction with your Safe owner wallet</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-white/5 p-5 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      4
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-2">After Transaction Confirms</h4>
                      <p className="text-gray-300 text-sm mb-3">Run this command to complete the setup:</p>
                      <div className="bg-black/30 p-3 rounded-lg">
                        <code className="text-green-400 text-sm">
                          npx tsx scripts/approve-and-init-new-module.ts
                        </code>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={checkModuleStatus}
                  disabled={checking}
                  className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  {checking ? 'Checking...' : 'Check If Enabled'}
                </button>
              </div>
            )}

          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-white/5 backdrop-blur p-4 rounded-xl border border-white/10">
              <h3 className="text-white font-semibold mb-1">✅ One-Time Setup</h3>
              <p className="text-gray-400 text-sm">Approve once, trade forever</p>
            </div>
            <div className="bg-white/5 backdrop-blur p-4 rounded-xl border border-white/10">
              <h3 className="text-white font-semibold mb-1">⚡ Gas Efficient</h3>
              <p className="text-gray-400 text-sm">20% less gas per trade</p>
            </div>
            <div className="bg-white/5 backdrop-blur p-4 rounded-xl border border-white/10">
              <h3 className="text-white font-semibold mb-1">🔒 Secure</h3>
              <p className="text-gray-400 text-sm">Standard DeFi pattern</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
