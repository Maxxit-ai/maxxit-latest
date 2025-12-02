/**
 * Ostium Connection Flow - SIMPLIFIED (Like Monolith)
 * 1. Connect wallet
 * 2. Generate dedicated agent wallet
 * 3. User signs setDelegate transaction
 * 4. Done!
 */

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Loader2, Zap } from 'lucide-react';
import { ethers } from 'ethers';

interface OstiumConnectProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// Ostium Trading Contract on Arbitrum Sepolia
const OSTIUM_TRADING_CONTRACT = '0x2A9B9c988393f46a2537B0ff11E98c2C15a95afe';
const OSTIUM_TRADING_ABI = [
  'function setDelegate(address delegate) external',
  // Note: delegations() view function may not be public, so we just call setDelegate directly
];

// USDC on Arbitrum Sepolia (testnet)
const USDC_TOKEN = '0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548';
const USDC_ABI = [
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Ostium Trading Storage (where USDC is held)
const OSTIUM_STORAGE = '0x0b9F5243B29938668c9Cfbd7557A389EC7Ef88b8';

export function OstiumConnect({
  agentId,
  agentName,
  onClose,
  onSuccess,
}: OstiumConnectProps) {
  const { user, authenticated, login } = usePrivy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agentAddress, setAgentAddress] = useState<string>('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [delegateApproved, setDelegateApproved] = useState(false);
  const [usdcApproved, setUsdcApproved] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string>('');
  const [step, setStep] = useState<'connect' | 'agent' | 'delegate' | 'usdc' | 'complete'>('connect');

  // Auto-assign agent when wallet is connected
  useEffect(() => {
    if (authenticated && user?.wallet?.address && !agentAddress && !loading) {
      // Check if user already has addresses first
      checkSetupStatus();
    }
  }, [authenticated, user?.wallet?.address]);

  const checkSetupStatus = async () => {
    if (!user?.wallet?.address) return;

    try {
      // Check if user already has addresses (from previous deployments)
      const setupResponse = await fetch(`/api/user/check-setup-status?userWallet=${user.wallet.address}`);
      
      if (setupResponse.ok) {
        const setupData = await setupResponse.json();
        
        if (setupData.setupComplete && setupData.hasOstiumAddress) {
          // User has address, but check if they've actually approved on-chain
          console.log('[OstiumConnect] User has Ostium address, checking on-chain approvals...');
          
          const approvalResponse = await fetch(`/api/ostium/check-approval-status?userWallet=${user.wallet.address}`);
          
          if (approvalResponse.ok) {
            const approvalData = await approvalResponse.json();
            
            console.log('[OstiumConnect] Approval status:', {
              hasApproval: approvalData.hasApproval,
              allowance: approvalData.usdcAllowance,
              balance: approvalData.usdcBalance,
            });
            
            if (approvalData.hasApproval && approvalData.hasSufficientBalance) {
              // User has address AND on-chain approval - skip setup
              console.log('[OstiumConnect] ✅ User has valid approvals - skipping setup');
              setAgentAddress(setupData.addresses.ostium);
              await createDeploymentDirectly(user.wallet.address);
            } else {
              // User has address but MISSING approval - force approval flow
              console.log('[OstiumConnect] ⚠️  User missing on-chain approval - showing approval flow');
              setAgentAddress(setupData.addresses.ostium);
              setStep('delegate'); // Skip to approval steps
            }
          } else {
            // Can't check approval - assume needs setup
            console.log('[OstiumConnect] Could not check approval status - showing full flow');
            setStep('agent');
            assignAgent();
          }
        } else {
          // First time Ostium user - show full setup flow
          setStep('agent');
          assignAgent();
        }
      } else {
        // Fallback to full setup
        setStep('agent');
        assignAgent();
      }
    } catch (err) {
      console.error('Error checking setup status:', err);
      // Fallback to full setup
      setStep('agent');
      assignAgent();
    }
  };

  const createDeploymentDirectly = async (wallet: string) => {
    setLoading(true);
    setError('');

    try {
      console.log('[OstiumConnect] Creating deployment directly (user already has address and delegation)');
      
      // User already has addresses - just create deployment
      const response = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userWallet: wallet,
          // Backend will fetch addresses from user_agent_addresses
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      const data = await response.json();
      setDeploymentId(data.deployment.id);
      console.log('[OstiumConnect] ✅ Deployment created:', data.deployment.id);
      
      // Show success immediately
      setStep('complete');
      setDelegateApproved(true);
      setUsdcApproved(true);
      
      // Notify parent
      if (onSuccess) {
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err: any) {
      console.error('Error creating deployment:', err);
      setError(err.message || 'Failed to create deployment');
    } finally {
      setLoading(false);
    }
  };

  const assignAgent = async () => {
    setLoading(true);
    setError('');

    try {
      console.log('[Ostium] Getting/generating agent address for user:', user?.wallet?.address);

      // Step 1: Generate/get user's agent address (NEW API)
      const addressResponse = await fetch(`/api/agents/${agentId}/generate-deployment-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet: user?.wallet?.address,
          venue: 'OSTIUM', // Or 'MULTI' if agent supports multi-venue
        }),
      });

      if (!addressResponse.ok) {
        const errorData = await addressResponse.json();
        throw new Error(errorData.error || 'Failed to generate agent address');
      }

      const addressData = await addressResponse.json();
      const agentAddr = addressData.address || addressData.addresses?.ostium?.address;
      
      if (!agentAddr) {
        throw new Error('No Ostium agent address returned');
      }

      setAgentAddress(agentAddr);
      console.log('[Ostium] Agent address:', agentAddr);

      // Step 2: Create deployment (NEW API)
      const deployResponse = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userWallet: user?.wallet?.address,
          // No need to send agentAddress - backend gets it from user_agent_addresses
        }),
      });

      if (!deployResponse.ok) {
        const errorData = await deployResponse.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      const deployData = await deployResponse.json();
      setDeploymentId(deployData.deployment.id);
      console.log('[Ostium] Deployment created:', deployData.deployment.id);
      setStep('delegate');
    } catch (err: any) {
      console.error('[Ostium] Failed to assign agent:', err);
      setError(err.message || 'Failed to assign agent wallet');
    } finally {
      setLoading(false);
    }
  };

  const approveAgent = async () => {
    setLoading(true);
    setError('');

    try {
      if (!authenticated || !user?.wallet?.address) {
        throw new Error('Please connect your wallet');
      }

      if (!agentAddress) {
        throw new Error('Agent not assigned yet');
      }

      console.log('[Ostium] Starting approval...');
      console.log('   User:', user.wallet.address);
      console.log('   Agent:', agentAddress);

      // Get provider
      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error('No wallet provider found. Please install MetaMask.');
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      
      // ⚠️ CRITICAL: Check network - MUST be Arbitrum Sepolia
      const network = await ethersProvider.getNetwork();
      console.log('[Ostium] Current network:', network.name, 'Chain ID:', network.chainId);
      
      const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
      if (network.chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
        // Attempt to switch networks automatically
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${ARBITRUM_SEPOLIA_CHAIN_ID.toString(16)}` }],
          });
          console.log('[Ostium] Switched to Arbitrum Sepolia');
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            throw new Error(
              'Arbitrum Sepolia not found in your wallet. Please add it manually:\n' +
              'Network: Arbitrum Sepolia\n' +
              'Chain ID: 421614\n' +
              'RPC: https://sepolia-rollup.arbitrum.io/rpc'
            );
          }
          throw new Error(
            `Please switch to Arbitrum Sepolia network in your wallet.\n` +
            `Current: ${network.name} (Chain ID: ${network.chainId})\n` +
            `Required: Arbitrum Sepolia (Chain ID: ${ARBITRUM_SEPOLIA_CHAIN_ID})`
          );
        }
      }
      
      const signer = ethersProvider.getSigner();

      // Create contract instance
      const contract = new ethers.Contract(
        OSTIUM_TRADING_CONTRACT,
        OSTIUM_TRADING_ABI,
        signer
      );

      console.log('[Ostium] Contract:', OSTIUM_TRADING_CONTRACT);
      console.log('[Ostium] User:', user.wallet.address);
      console.log('[Ostium] Agent:', agentAddress);
      console.log('[Ostium] Calling setDelegate...');

      // Call setDelegate (user signs this transaction)
      // Note: setDelegate is idempotent - safe to call multiple times
      const tx = await contract.setDelegate(agentAddress);
      console.log('[Ostium] Transaction sent:', tx.hash);
      setTxHash(tx.hash);

      // Wait for confirmation
      console.log('[Ostium] Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('[Ostium] Confirmed! Block:', receipt.blockNumber);

      setDelegateApproved(true);
      setStep('usdc');
      console.log('[Ostium] Delegate approved! Now need USDC approval...');

    } catch (err: any) {
      console.error('[Ostium] Approval error:', err);
      
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else if (err.code === 'CALL_EXCEPTION') {
        setError(
          'Contract call failed. Please ensure:\n' +
          '1. You are on Arbitrum Sepolia network\n' +
          '2. You have some ETH for gas (~$0.01)\n' +
          '3. The contract is deployed at the correct address'
        );
      } else if (err.code === -32603) {
        setError('Transaction failed. Please try again.');
      } else {
        setError(err.message || 'Failed to approve agent');
      }
    } finally {
      setLoading(false);
    }
  };

  const approveUsdc = async () => {
    console.log('[Ostium] 🔴 approveUsdc CALLED');
    console.log('[Ostium] Current step:', step);
    console.log('[Ostium] Loading:', loading);
    console.log('[Ostium] Authenticated:', authenticated);
    console.log('[Ostium] User:', user?.wallet?.address);
    
    setLoading(true);
    setError('');

    try {
      if (!authenticated || !user?.wallet?.address) {
        throw new Error('Please connect your wallet');
      }

      console.log('[Ostium] Starting USDC approval...');
      console.log('   User:', user.wallet.address);
      console.log('   USDC Token:', USDC_TOKEN);
      console.log('   Trading Contract (spender):', OSTIUM_TRADING_CONTRACT);

      // Get provider
      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error('No wallet provider found. Please install MetaMask.');
      }

      console.log('[Ostium] Provider found:', !!provider);
      console.log('[Ostium] Requesting accounts...');
      
      const ethersProvider = new ethers.providers.Web3Provider(provider);
      
      // CRITICAL: Request accounts first - this triggers MetaMask popup
      await ethersProvider.send('eth_requestAccounts', []);
      console.log('[Ostium] Accounts requested');
      
      // Verify still on Arbitrum Sepolia
      const network = await ethersProvider.getNetwork();
      console.log('[Ostium] Network:', network.name, 'Chain ID:', network.chainId);
      const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
      if (network.chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
        throw new Error(`Please switch to Arbitrum Sepolia (Chain ID: ${ARBITRUM_SEPOLIA_CHAIN_ID})`);
      }
      
      const signer = ethersProvider.getSigner();
      const signerAddress = await signer.getAddress();
      console.log('[Ostium] Signer address:', signerAddress);

      // Create USDC contract instance
      const usdcContract = new ethers.Contract(
        USDC_TOKEN,
        USDC_ABI,
        signer
      );

      console.log('[Ostium] Checking current USDC allowance...');
      
      // CRITICAL FIX: SDK checks OSTIUM_STORAGE, not OSTIUM_TRADING_CONTRACT
      // The SDK's __approve method checks allowance for OSTIUM_STORAGE
      // We need to approve BOTH contracts to be safe, but SDK specifically checks STORAGE
      const currentAllowanceStorage = await usdcContract.allowance(
        user.wallet.address,
        OSTIUM_STORAGE  // ✅ SDK checks this one
      );
      
      const currentAllowanceTrading = await usdcContract.allowance(
        user.wallet.address,
        OSTIUM_TRADING_CONTRACT  // Also check this for completeness
      );
      
      const allowanceAmount = ethers.utils.parseUnits('1000000', 6); // $1M
      
      console.log('[Ostium] Current allowance to STORAGE:', ethers.utils.formatUnits(currentAllowanceStorage, 6), 'USDC');
      console.log('[Ostium] Current allowance to TRADING_CONTRACT:', ethers.utils.formatUnits(currentAllowanceTrading, 6), 'USDC');
      
      // SDK checks STORAGE, but we should approve BOTH to be safe
      // The working wallet has both approved, so approve both
      const needsStorageApproval = currentAllowanceStorage.lt(allowanceAmount);
      const needsTradingApproval = currentAllowanceTrading.lt(allowanceAmount);
      
      if (!needsStorageApproval && !needsTradingApproval) {
        console.log('[Ostium] ✅ Both contracts already approved');
        setUsdcApproved(true);
        setStep('complete');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1000);
        return;
      }

      console.log('[Ostium] ⚠️  Need to approve USDC...');
      console.log('[Ostium]   STORAGE approved:', !needsStorageApproval);
      console.log('[Ostium]   TRADING_CONTRACT approved:', !needsTradingApproval);
      console.log('[Ostium] Approval amount:', ethers.utils.formatUnits(allowanceAmount, 6), 'USDC');

      // Approve STORAGE first (SDK requirement)
      let lastTxHash = '';
      if (needsStorageApproval) {
        console.log('[Ostium] Approving STORAGE (SDK requirement)...');
        console.log('[Ostium] Spender:', OSTIUM_STORAGE);
        console.log('[Ostium] ⏳ Triggering MetaMask popup for STORAGE approval...');
        
        // CRITICAL: Use provider.request() directly to ensure MetaMask popup
        // This bypasses any ethers.js caching that might prevent popup
        const approveData = usdcContract.interface.encodeFunctionData('approve', [
          OSTIUM_STORAGE,
          allowanceAmount,
        ]);
        
        // Estimate gas first
        const gasEstimate = await ethersProvider.estimateGas({
          to: USDC_TOKEN,
          from: user.wallet.address,
          data: approveData,
        });
        console.log('[Ostium] Gas estimate:', gasEstimate.toString());
        
        // Calculate gas with 20% buffer
        // BigNumber.toString() doesn't accept parameters in ethers v5, use toHexString() instead
        const gasWithBuffer = gasEstimate.mul(120).div(100);
        const gasHex = gasWithBuffer.toHexString(); // toHexString() already includes '0x' prefix
        
        // Use provider.request() directly - this ensures MetaMask popup
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: user.wallet.address,
            to: USDC_TOKEN,
            data: approveData,
            gas: gasHex, // Use hex string with buffer
          }],
        });
        
        console.log('[Ostium] ✅ STORAGE approval transaction sent:', txHash);
        setTxHash(txHash);
        
        // Wait for confirmation
        const receipt = await ethersProvider.waitForTransaction(txHash);
        console.log('[Ostium] ✅ STORAGE approval confirmed:', receipt.transactionHash);
        lastTxHash = receipt.transactionHash;
      }

      // Also approve TRADING_CONTRACT (for completeness - original code did this)
      if (needsTradingApproval) {
        console.log('[Ostium] Approving TRADING_CONTRACT (for completeness)...');
        console.log('[Ostium] Spender:', OSTIUM_TRADING_CONTRACT);
        console.log('[Ostium] ⏳ Triggering MetaMask popup for TRADING_CONTRACT approval...');
        
        // Use same approach for TRADING_CONTRACT
        const approveDataTrading = usdcContract.interface.encodeFunctionData('approve', [
          OSTIUM_TRADING_CONTRACT,
          allowanceAmount,
        ]);
        
        const gasEstimateTrading = await ethersProvider.estimateGas({
          to: USDC_TOKEN,
          from: user.wallet.address,
          data: approveDataTrading,
        });
        console.log('[Ostium] Gas estimate:', gasEstimateTrading.toString());
        
        // Calculate gas with 20% buffer
        // BigNumber.toString() doesn't accept parameters in ethers v5, use toHexString() instead
        const gasWithBufferTrading = gasEstimateTrading.mul(120).div(100);
        const gasHexTrading = gasWithBufferTrading.toHexString(); // toHexString() already includes '0x' prefix
        
        // Use provider.request() directly - this ensures MetaMask popup
        const txHashTrading = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: user.wallet.address,
            to: USDC_TOKEN,
            data: approveDataTrading,
            gas: gasHexTrading, // Use hex string with buffer
          }],
        });
        
        console.log('[Ostium] ✅ TRADING_CONTRACT approval transaction sent:', txHashTrading);
        setTxHash(txHashTrading);
        
        const receiptTrading = await ethersProvider.waitForTransaction(txHashTrading);
        console.log('[Ostium] ✅ TRADING_CONTRACT approval confirmed:', receiptTrading.transactionHash);
        lastTxHash = receiptTrading.transactionHash;
      }

      setUsdcApproved(true);
      setStep('complete');
      
      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);

    } catch (err: any) {
      console.error('[Ostium] ❌ USDC approval error:', err);
      console.error('[Ostium] Error code:', err.code);
      console.error('[Ostium] Error message:', err.message);
      console.error('[Ostium] Error stack:', err.stack);
      
      if (err.code === 4001) {
        setError('Transaction rejected by user');
        console.log('[Ostium] User rejected transaction');
      } else if (err.code === -32603) {
        setError('Transaction failed. Please try again.');
      } else if (err.message?.includes('User rejected')) {
        setError('Transaction rejected by user');
      } else if (err.message?.includes('user rejected')) {
        setError('Transaction rejected by user');
      } else {
        const errorMsg = err.message || 'Failed to approve USDC';
        setError(errorMsg);
        console.error('[Ostium] Unexpected error:', errorMsg);
      }
    } finally {
      setLoading(false);
      console.log('[Ostium] approveUsdc function completed');
    }
  };

  const handleConnect = () => {
    if (!authenticated) {
      login();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-t-lg">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5" />
              <h2 className="text-xl font-bold">Setup Ostium</h2>
            </div>
            <p className="text-sm text-blue-100">{agentName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Step Indicator */}
          {step !== 'connect' && (
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-4">
              <div className={`flex items-center gap-1 ${delegateApproved ? 'text-green-600' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center ${delegateApproved ? 'bg-green-600 text-white' : 'bg-muted'}`}>
                  {delegateApproved ? '✓' : '1'}
                </span>
                Delegate
              </div>
              <div className={`flex-1 h-0.5 mx-2 ${delegateApproved ? 'bg-green-600' : 'bg-muted'}`}></div>
              <div className={`flex items-center gap-1 ${usdcApproved ? 'text-green-600' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center ${usdcApproved ? 'bg-green-600 text-white' : 'bg-muted'}`}>
                  {usdcApproved ? '✓' : '2'}
                </span>
                USDC
              </div>
            </div>
          )}

          {step === 'connect' ? (
            /* Step 1: Not Connected */
            <div className="text-center space-y-4">
              <Wallet className="w-16 h-16 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your Arbitrum wallet to whitelist the agent
                </p>
              </div>
              <button
                onClick={handleConnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90"
              >
                <Wallet className="w-5 h-5" />
                Connect Wallet
              </button>
            </div>
          ) : step === 'agent' ? (
            /* Step 2: Loading Agent */
            <div className="text-center space-y-4 py-8">
              <Loader2 className="w-16 h-16 mx-auto text-primary animate-spin" />
              <div>
                <h3 className="text-lg font-semibold mb-2">Assigning Agent...</h3>
                <p className="text-sm text-muted-foreground">
                  Getting your agent wallet from the pool
                </p>
              </div>
            </div>
          ) : step === 'delegate' ? (
            /* Step 3: Approve Delegate */
            <>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                <div>
                  <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-1">
                    🤖 Agent Assigned
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono break-all">
                    {agentAddress}
                  </p>
                </div>
                {deploymentId && (
                  <div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                      Deployment ID:
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-mono break-all">
                      {deploymentId.substring(0, 8)}...{deploymentId.substring(deploymentId.length - 6)}
                    </p>
                  </div>
                )}
                <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                  <button
                    onClick={assignAgent}
                    disabled={loading}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    {loading ? 'Refreshing...' : '🔄 Refresh Deployment'}
                  </button>
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold mb-2">Step 1: Approve Agent Access</p>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">→</span>
                  <span>Sign transaction to whitelist agent</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-400">→</span>
                  <span className="text-muted-foreground">Then approve USDC spending</span>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-xs text-green-800 dark:text-green-200">
                <strong>✅ Deployment Created:</strong> Your agent is registered in the system and ready to be approved on-chain.
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-200">
                <strong>⚠️ You remain in control:</strong> Agent can only trade - cannot withdraw funds. You can revoke access anytime.
              </div>

              {txHash && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-green-700 dark:text-green-300 text-sm mb-2">✓ Transaction confirmed!</p>
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

              <button
                onClick={approveAgent}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-md font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing...
                  </>
                ) : delegateApproved ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    ✓ Delegate Approved
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    ✍️ Approve Agent Access
                  </>
                )}
              </button>
            </>
          ) : step === 'usdc' ? (
            /* Step 4: Approve USDC */
            <>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-900 dark:text-green-100 font-medium mb-2">
                  ✓ Delegate Approved
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  Agent has been whitelisted to trade on your behalf
                </p>
              </div>

              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <p className="font-semibold mb-2">Step 2: Approve USDC Spending</p>
                <div className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">→</span>
                  <span>Sign transaction to approve USDC</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  This allows Ostium to use your USDC for trading. The agent cannot withdraw funds directly.
                </p>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-200">
                <strong>💡 Tip:</strong> We're approving $1M. This is a standard amount and prevents repeated approvals.
              </div>

              {txHash && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-green-700 dark:text-green-300 text-sm mb-2">✓ Transaction confirmed!</p>
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

              <button
                onClick={() => {
                  console.log('[Ostium] 🔵 Button clicked!');
                  approveUsdc();
                }}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-md font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    ✍️ Approve USDC
                  </>
                )}
              </button>
            </>
          ) : (
            /* Complete */
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">All Set! 🎉</h3>
                <p className="text-sm text-muted-foreground">
                  Your agent is ready to trade on Ostium
                </p>
              </div>

              {txHash && (
                <a
                  href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  View last transaction →
                </a>
              )}

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-md space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Agent whitelisted</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>USDC approved for trading</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>Ready to execute signals</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}