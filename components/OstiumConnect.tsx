/**
 * Ostium Connection Flow - Brutalist Design
 */

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Zap, Activity, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';

interface OstiumConnectProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const OSTIUM_TRADING_CONTRACT = '0x2A9B9c988393f46a2537B0ff11E98c2C15a95afe';
const OSTIUM_TRADING_ABI = ['function setDelegate(address delegate) external'];

const USDC_TOKEN = '0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548';
const USDC_ABI = [
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

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
  
  // Guard refs to prevent duplicate API calls
  const isCheckingRef = useRef(false);
  const isAssigningRef = useRef(false);
  const [hasInitialized, setHasInitialized] = useState(false); // Persists in state, not ref

  useEffect(() => {
    // Only run ONCE when authenticated and on 'connect' step
    // Don't re-run after flow has started (step changed from 'connect')
    if (authenticated && user?.wallet?.address && step === 'connect' && !hasInitialized && !isCheckingRef.current) {
      setHasInitialized(true);
      checkSetupStatus();
    }
  }, [authenticated, user?.wallet?.address, step, hasInitialized]);

  const checkSetupStatus = async () => {
    if (!user?.wallet?.address) return;
    
    // Prevent duplicate calls
    if (isCheckingRef.current) {
      console.log('[OstiumConnect] checkSetupStatus already in progress, skipping');
      return;
    }
    isCheckingRef.current = true;

    try {
      console.log('[OstiumConnect] Checking setup status for wallet:', user.wallet.address);
      const setupResponse = await fetch(`/api/user/check-setup-status?userWallet=${user.wallet.address}&agentId=${agentId}`);
      
      if (setupResponse.ok) {
        const setupData = await setupResponse.json();
        console.log('[OstiumConnect] Setup data:', setupData);
        
        /*
         * FLOW LOGIC:
         * - Agent address (O1) is per-WALLET, not per-agent
         * - If wallet W1 already has Ostium address O1, it means:
         *   - User has previously deployed at least one agent with this wallet
         *   - setDelegate(O1) was already called
         *   - USDC was already approved
         * - So for any NEW agent deployment with SAME wallet, skip approval steps!
         */
        
        if (setupData.hasOstiumAddress) {
          // Wallet already has an Ostium agent address assigned
          // This means user has previously completed the approval flow with this wallet
          
          console.log('[OstiumConnect] Wallet has existing Ostium address:', setupData.addresses.ostium);
          
          // Verify approvals are still valid on-chain
          const approvalResponse = await fetch(`/api/ostium/check-approval-status?userWallet=${user.wallet.address}`);
          
          if (approvalResponse.ok) {
            const approvalData = await approvalResponse.json();
            console.log('[OstiumConnect] On-chain approval status:', approvalData);
            
            if (approvalData.hasApproval) {
              // User has valid USDC approval - they've done the flow before
              // Skip ALL approval steps and just create the deployment
              console.log('[OstiumConnect] ✅ Wallet already has approvals - skipping to deployment');
              setAgentAddress(setupData.addresses.ostium);
              setDelegateApproved(true);
              setUsdcApproved(true);
              
              // Create deployment for this new agent
              await createDeploymentDirectly(user.wallet.address);
              return;
            } else {
              // User has address but USDC approval was revoked - need to re-approve
              console.log('[OstiumConnect] ⚠️ USDC approval revoked - need to re-approve');
              setAgentAddress(setupData.addresses.ostium);
              // Skip delegate (already done) but need USDC approval
              setDelegateApproved(true); // setDelegate is permanent
              setStep('usdc');
            }
          } else {
            // Couldn't check approval status - go through full flow to be safe
            console.log('[OstiumConnect] Could not check approval status - showing delegate step');
            setAgentAddress(setupData.addresses.ostium);
            setStep('delegate');
          }
        } else {
          // No Ostium address for this wallet - FIRST TIME user with this wallet
          // Need to generate new address and go through full approval flow
          console.log('[OstiumConnect] 🆕 First time for this wallet - generating new address');
          setStep('agent');
          await assignAgent();
        }
      } else {
        console.log('[OstiumConnect] Setup check failed - starting from agent step');
        setStep('agent');
        await assignAgent();
      }
    } catch (err) {
      console.error('[OstiumConnect] Error checking setup status:', err);
      setStep('agent');
      await assignAgent();
    } finally {
      isCheckingRef.current = false;
    }
  };

  const createDeploymentDirectly = async (wallet: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet: wallet }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      const data = await response.json();
      setDeploymentId(data.deployment.id);
      setStep('complete');
      setDelegateApproved(true);
      setUsdcApproved(true);
      
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
    // Prevent duplicate calls
    if (isAssigningRef.current) {
      console.log('[OstiumConnect] assignAgent already in progress, skipping');
      return;
    }
    isAssigningRef.current = true;
    
    setLoading(true);
    setError('');

    try {
      console.log('[OstiumConnect] Assigning agent for:', { agentId, userWallet: user?.wallet?.address });
      
      const addressResponse = await fetch(`/api/agents/${agentId}/generate-deployment-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet: user?.wallet?.address,
          venue: 'OSTIUM',
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

      console.log('[OstiumConnect] Agent address assigned:', agentAddr);
      setAgentAddress(agentAddr);

      const deployResponse = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          userWallet: user?.wallet?.address,
        }),
      });

      if (!deployResponse.ok) {
        const errorData = await deployResponse.json();
        throw new Error(errorData.error || 'Failed to create deployment');
      }

      const deployData = await deployResponse.json();
      console.log('[OstiumConnect] Deployment created:', deployData.deployment.id);
      setDeploymentId(deployData.deployment.id);
      setStep('delegate');
    } catch (err: any) {
      console.error('[OstiumConnect] Failed to assign agent:', err);
      setError(err.message || 'Failed to assign agent wallet');
    } finally {
      setLoading(false);
      isAssigningRef.current = false;
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

      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error('No wallet provider found. Please install MetaMask.');
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const network = await ethersProvider.getNetwork();
      
      const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
      if (network.chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${ARBITRUM_SEPOLIA_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            throw new Error('Please add Arbitrum Sepolia to your wallet');
          }
          throw new Error('Please switch to Arbitrum Sepolia network');
        }
      }
      
      const signer = ethersProvider.getSigner();
      const contract = new ethers.Contract(OSTIUM_TRADING_CONTRACT, OSTIUM_TRADING_ABI, signer);

      // Estimate gas with 50% buffer for reliability
      const gasEstimate = await contract.estimateGas.setDelegate(agentAddress);
      const gasLimit = gasEstimate.mul(150).div(100); // 50% buffer
      
      console.log(`[OstiumConnect] Gas estimate: ${gasEstimate.toString()}, with 50% buffer: ${gasLimit.toString()}`);

      const tx = await contract.setDelegate(agentAddress, { gasLimit });
      setTxHash(tx.hash);

      await tx.wait();

      console.log('[OstiumConnect] ✅ Delegate approved, moving to USDC step');
      setDelegateApproved(true);
      setStep('usdc');
      setTxHash(null); // Clear tx hash for next transaction

    } catch (err: any) {
      console.error('[OstiumConnect] Approval error:', err);
      
      if (err.code === 4001) {
        setError('Transaction rejected');
      } else if (err.code === 'CALL_EXCEPTION') {
        setError('Contract call failed. Please check network and try again.');
      } else {
        setError(err.message || 'Failed to approve agent');
      }
    } finally {
      setLoading(false);
    }
  };

  const approveUsdc = async () => {
    console.log('[OstiumConnect] approveUsdc called - starting USDC approval flow');
    setLoading(true);
    setError('');

    try {
      if (!authenticated || !user?.wallet?.address) {
        throw new Error('Please connect your wallet');
      }

      const provider = (window as any).ethereum;
      if (!provider) {
        throw new Error('No wallet provider found.');
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      await ethersProvider.send('eth_requestAccounts', []);
      
      const network = await ethersProvider.getNetwork();
      const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
      if (network.chainId !== ARBITRUM_SEPOLIA_CHAIN_ID) {
        throw new Error('Please switch to Arbitrum Sepolia');
      }
      
      const signer = ethersProvider.getSigner();
      const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);

      const currentAllowanceStorage = await usdcContract.allowance(user.wallet.address, OSTIUM_STORAGE);
      const currentAllowanceTrading = await usdcContract.allowance(user.wallet.address, OSTIUM_TRADING_CONTRACT);
      const allowanceAmount = ethers.utils.parseUnits('1000000', 6);
      
      const storageAllowance = parseFloat(ethers.utils.formatUnits(currentAllowanceStorage, 6));
      const tradingAllowance = parseFloat(ethers.utils.formatUnits(currentAllowanceTrading, 6));
      const requiredAmount = parseFloat(ethers.utils.formatUnits(allowanceAmount, 6));
      
      console.log('[OstiumConnect] USDC Approval Check:');
      console.log('  Storage allowance:', storageAllowance, 'USDC');
      console.log('  Trading allowance:', tradingAllowance, 'USDC');
      console.log('  Required amount:', requiredAmount, 'USDC');
      
      // Use a lower threshold - only skip if user has genuinely high approval
      // This ensures first-time users always go through the approval flow
      const MIN_REQUIRED_APPROVAL = 100; // $100 minimum to skip (not $10)
      const needsStorageApproval = storageAllowance < MIN_REQUIRED_APPROVAL;
      const needsTradingApproval = tradingAllowance < MIN_REQUIRED_APPROVAL;
      
      console.log('  Needs Storage approval:', needsStorageApproval, `(current: ${storageAllowance}, required: ${MIN_REQUIRED_APPROVAL})`);
      console.log('  Needs Trading approval:', needsTradingApproval, `(current: ${tradingAllowance}, required: ${MIN_REQUIRED_APPROVAL})`);
      
      if (!needsStorageApproval && !needsTradingApproval) {
        console.log('[OstiumConnect] USDC already sufficiently approved, skipping to complete');
        setUsdcApproved(true);
        setStep('complete');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
        return;
      }
      
      // At least one approval is needed
      console.log('[OstiumConnect] USDC approval needed, proceeding with transaction(s)');

      if (needsStorageApproval) {
        const approveData = usdcContract.interface.encodeFunctionData('approve', [OSTIUM_STORAGE, allowanceAmount]);
        const gasEstimate = await ethersProvider.estimateGas({
          to: USDC_TOKEN,
          from: user.wallet.address,
          data: approveData,
        });
        
        // 50% gas buffer for reliability
        const gasWithBuffer = gasEstimate.mul(150).div(100);
        console.log(`[OstiumConnect] USDC Storage approval - Gas estimate: ${gasEstimate.toString()}, with 50% buffer: ${gasWithBuffer.toString()}`);
        
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: user.wallet.address,
            to: USDC_TOKEN,
            data: approveData,
            gas: gasWithBuffer.toHexString(),
          }],
        });
        
        setTxHash(txHash);
        await ethersProvider.waitForTransaction(txHash);
      }

      if (needsTradingApproval) {
        const approveDataTrading = usdcContract.interface.encodeFunctionData('approve', [OSTIUM_TRADING_CONTRACT, allowanceAmount]);
        const gasEstimateTrading = await ethersProvider.estimateGas({
          to: USDC_TOKEN,
          from: user.wallet.address,
          data: approveDataTrading,
        });
        
        // 50% gas buffer for reliability
        const gasWithBufferTrading = gasEstimateTrading.mul(150).div(100);
        console.log(`[OstiumConnect] USDC Trading approval - Gas estimate: ${gasEstimateTrading.toString()}, with 50% buffer: ${gasWithBufferTrading.toString()}`);
        
        const txHashTrading = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: user.wallet.address,
            to: USDC_TOKEN,
            data: approveDataTrading,
            gas: gasWithBufferTrading.toHexString(),
          }],
        });
        
        setTxHash(txHashTrading);
        await ethersProvider.waitForTransaction(txHashTrading);
      }

      setUsdcApproved(true);
      setStep('complete');
      
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1000);

    } catch (err: any) {
      console.error('USDC approval error:', err);
      
      if (err.code === 4001 || err.message?.includes('rejected')) {
        setError('Transaction rejected');
      } else {
        setError(err.message || 'Failed to approve USDC');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!authenticated) {
      login();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                <Zap className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="font-display text-xl">OSTIUM SETUP</h2>
                <p className="text-xs text-[var(--text-muted)]">{agentName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
              <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <span className="text-sm text-[var(--danger)]">{error}</span>
            </div>
          )}

          {/* Step Indicator */}
          {step !== 'connect' && (
            <div className="flex items-center justify-between text-xs font-bold mb-4">
              <div className={`flex items-center gap-1 ${delegateApproved ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                <span className={`w-6 h-6 flex items-center justify-center border ${delegateApproved ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)]' : 'border-[var(--border)]'}`}>
                  {delegateApproved ? '✓' : '1'}
                </span>
                DELEGATE
              </div>
              <div className={`flex-1 h-px mx-2 ${delegateApproved ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
              <div className={`flex items-center gap-1 ${usdcApproved ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                <span className={`w-6 h-6 flex items-center justify-center border ${usdcApproved ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-deep)]' : 'border-[var(--border)]'}`}>
                  {usdcApproved ? '✓' : '2'}
                </span>
                USDC
              </div>
            </div>
          )}

          {step === 'connect' ? (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 mx-auto border border-[var(--accent)] flex items-center justify-center">
                <Wallet className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-display text-lg mb-2">CONNECT WALLET</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Connect your Arbitrum wallet to whitelist the agent
                </p>
              </div>
              <button
                onClick={handleConnect}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"
              >
                <Wallet className="w-5 h-5" />
                CONNECT WALLET
              </button>
            </div>
          ) : step === 'agent' ? (
            <div className="text-center space-y-4 py-8">
              <Activity className="w-16 h-16 mx-auto text-[var(--accent)] animate-pulse" />
              <div>
                <h3 className="font-display text-lg mb-2">ASSIGNING AGENT...</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  Getting your agent wallet from the pool
                </p>
              </div>
            </div>
          ) : step === 'delegate' ? (
            <>
              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4 space-y-2">
                <p className="text-sm text-[var(--accent)]">AGENT ASSIGNED</p>
                <p className="text-xs font-mono break-all text-[var(--text-primary)]">{agentAddress}</p>
              </div>

              <div className="border border-[var(--border)] p-4 space-y-3 text-sm">
                <p className="font-bold">STEP 1: APPROVE AGENT ACCESS</p>
                <div className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span className="text-[var(--accent)]">→</span>
                  <span>Sign transaction to whitelist agent</span>
                </div>
                <div className="flex items-start gap-2 text-[var(--text-muted)]">
                  <span>→</span>
                  <span>Then approve USDC spending</span>
                </div>
              </div>

              <div className="border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">NOTE:</strong> Agent can only trade - cannot withdraw funds. You remain in control.
              </div>

              {txHash && (
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3">
                  <p className="text-[var(--accent)] text-sm mb-2">✓ Transaction confirmed</p>
                  <a
                    href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    View on Arbiscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <button
                onClick={approveAgent}
                disabled={loading}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Activity className="w-5 h-5 animate-pulse" />
                    SIGNING...
                  </>
                ) : delegateApproved ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    DELEGATE APPROVED
                  </>
                ) : (
                  'APPROVE AGENT ACCESS →'
                )}
              </button>
            </>
          ) : step === 'usdc' ? (
            <>
              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4">
                <p className="text-sm text-[var(--accent)]">✓ DELEGATE APPROVED</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Agent whitelisted to trade on your behalf
                </p>
              </div>

              <div className="border border-[var(--border)] p-4 space-y-3 text-sm">
                <p className="font-bold">STEP 2: APPROVE USDC SPENDING</p>
                <div className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span className="text-[var(--accent)]">→</span>
                  <span>Sign transaction to approve USDC</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-3">
                  This allows Ostium to use your USDC for trading.
                </p>
              </div>

              <div className="border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">TIP:</strong> We're approving $1M to prevent repeated approvals.
              </div>

              {txHash && (
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3">
                  <p className="text-[var(--accent)] text-sm mb-2">✓ Transaction confirmed</p>
                  <a
                    href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                  >
                    View on Arbiscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <button
                onClick={approveUsdc}
                disabled={loading}
                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Activity className="w-5 h-5 animate-pulse" />
                    SIGNING...
                  </>
                ) : (
                  'APPROVE USDC →'
                )}
              </button>
            </>
          ) : (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 mx-auto border border-[var(--accent)] bg-[var(--accent)] flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-[var(--bg-deep)]" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-2">DEPLOYED</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Agent is ready to trade on Ostium
                </p>
              </div>

              {txHash && (
                <a
                  href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline flex items-center justify-center gap-1"
                >
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              )}

              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4 space-y-2 text-sm text-left">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span>Agent whitelisted</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                  <span>USDC approved</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
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

