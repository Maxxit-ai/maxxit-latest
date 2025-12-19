/**
 * Ostium Connection Flow - Brutalist Design
 */

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Zap, Activity, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import { TradingPreferencesForm, TradingPreferences } from './TradingPreferencesModal';
import { getOstiumConfig } from '../lib/ostium-config';
// import { TradingPreferencesModal, TradingPreferences } from './TradingPreferencesModal';

interface OstiumConnectProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// Get Ostium configuration based on environment
const { tradingContract: OSTIUM_TRADING_CONTRACT, usdcContract: USDC_TOKEN, storageContract: OSTIUM_STORAGE } = getOstiumConfig();
const OSTIUM_TRADING_ABI = ['function setDelegate(address delegate) external'];
const USDC_ABI = [
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

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
  const [step, setStep] = useState<'connect' | 'preferences' | 'agent' | 'delegate' | 'usdc' | 'complete'>('connect');

  // Trading preferences stored locally until all approvals complete
  const [tradingPreferences, setTradingPreferences] = useState<TradingPreferences | null>(null);
  const tradingPreferencesRef = useRef<TradingPreferences | null>(null); // ensures latest prefs are used in async flows
  const [firstDeploymentPreferences, setFirstDeploymentPreferences] = useState<TradingPreferences | null>(null);
  const [loadingFirstDeploymentPreferences, setLoadingFirstDeploymentPreferences] = useState(false);

  // Guard refs to prevent duplicate API calls
  const isCheckingRef = useRef(false);
  const isAssigningRef = useRef(false);
  const [hasInitialized, setHasInitialized] = useState(false); // Persists in state, not ref

  useEffect(() => {
    // If already authenticated when component mounts, go to preferences step first
    if (authenticated && user?.wallet?.address && step === 'connect' && !hasInitialized) {
      setHasInitialized(true);
      // Load first deployment preferences if they exist
      setLoadingFirstDeploymentPreferences(true);
      loadFirstDeploymentPreferences().then((prefs) => {
        if (prefs) {
          setFirstDeploymentPreferences(prefs);
          console.log('[OstiumConnect] Set first deployment preferences:', prefs);
        }
        setLoadingFirstDeploymentPreferences(false);
      });
      // Always show preferences as first step for new deployments
      setStep('preferences');
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

              // Create deployment for this new agent with trading preferences
              await createDeploymentDirectly(user.wallet.address);
              return;
            } else {
              // User has address but USDC approval was revoked - need to re-approve
              console.log('[OstiumConnect] ⚠️ USDC approval revoked - need to re-approve');
              setAgentAddress(setupData.addresses.ostium);
              // Skip delegate (already done) but need USDC approval
              setDelegateApproved(true); // setDelegate is permanent
              setStep('usdc');
              setLoading(false);
            }
          } else {
            // Couldn't check approval status - go through full flow to be safe
            console.log('[OstiumConnect] Could not check approval status - showing delegate step');
            setAgentAddress(setupData.addresses.ostium);
            setStep('delegate');
            setLoading(false);
          }
        } else {
          // No Ostium address for this wallet - FIRST TIME user with this wallet
          // Need to generate new address and go through full approval flow
          console.log('[OstiumConnect] 🆕 First time for this wallet - generating new address');
          setStep('agent');
          setLoading(false);
          await assignAgent();
        }
      } else {
        console.log('[OstiumConnect] Setup check failed - starting from agent step');
        setStep('agent');
        setLoading(false);
        await assignAgent();
      }
    } catch (err) {
      console.error('[OstiumConnect] Error checking setup status:', err);
      setStep('agent');
      setLoading(false);
      await assignAgent();
    } finally {
      isCheckingRef.current = false;
    }
  };

  const createDeploymentDirectly = async (wallet: string) => {
    setLoading(true);
    setError('');

    try {
      const requestBody: Record<string, unknown> = {
        agentId,
        userWallet: wallet,
      };

      // Include trading preferences if available (always use ref to avoid stale state)
      if (tradingPreferencesRef.current) {
        requestBody.tradingPreferences = tradingPreferencesRef.current;
        console.log('[OstiumConnect] Creating deployment directly with preferences:', tradingPreferencesRef.current);
      } else {
        console.warn('[OstiumConnect] Creating deployment without preferences - will use defaults');
      }

      console.log('[OstiumConnect] Request body:', requestBody);

      const response = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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

      // Call onSuccess immediately to refresh setup status, but don't auto-close
      if (onSuccess) {
        onSuccess();
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

      const deployRequestBody: Record<string, unknown> = {
        agentId,
        userWallet: user?.wallet?.address,
      };

      // Include trading preferences if available (use ref to avoid stale values)
      if (tradingPreferencesRef.current) {
        deployRequestBody.tradingPreferences = tradingPreferencesRef.current;
        console.log('[OstiumConnect] Including trading preferences in deployment:', tradingPreferencesRef.current);
      } else {
        console.warn('[OstiumConnect] No trading preferences found - using defaults');
      }

      console.log('[OstiumConnect] Sending deployment request:', deployRequestBody);

      const deployResponse = await fetch('/api/ostium/create-deployment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deployRequestBody),
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

      const ARBITRUM_CHAIN_ID = 421614;
      if (network.chainId !== ARBITRUM_CHAIN_ID) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            throw new Error('Please add Arbitrum to your wallet');
          }
          throw new Error('Please switch to Arbitrum network');
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
      const ARBITRUM_CHAIN_ID = 421614;
      if (network.chainId !== ARBITRUM_CHAIN_ID) {
        throw new Error('Please switch to Arbitrum');
      }

      const signer = ethersProvider.getSigner();
      const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);

      const currentAllowanceStorage = await usdcContract.allowance(user.wallet.address, OSTIUM_STORAGE);
      // const currentAllowanceTrading = await usdcContract.allowance(user.wallet.address, OSTIUM_TRADING_CONTRACT);
      const allowanceAmount = ethers.utils.parseUnits('1000000', 6);

      const storageAllowance = parseFloat(ethers.utils.formatUnits(currentAllowanceStorage, 6));
      // const tradingAllowance = parseFloat(ethers.utils.formatUnits(currentAllowanceTrading, 6));
      const requiredAmount = parseFloat(ethers.utils.formatUnits(allowanceAmount, 6));

      console.log('[OstiumConnect] USDC Approval Check:');
      console.log('  Storage allowance:', storageAllowance, 'USDC');
      // console.log('  Trading allowance:', tradingAllowance, 'USDC');
      console.log('  Required amount:', requiredAmount, 'USDC');

      // Use a lower threshold - only skip if user has genuinely high approval
      // This ensures first-time users always go through the approval flow
      const MIN_REQUIRED_APPROVAL = 100; // $100 minimum to skip (not $10)
      const needsStorageApproval = storageAllowance < MIN_REQUIRED_APPROVAL;
      // const needsTradingApproval = tradingAllowance < MIN_REQUIRED_APPROVAL;

      console.log('  Needs Storage approval:', needsStorageApproval, `(current: ${storageAllowance}, required: ${MIN_REQUIRED_APPROVAL})`);
      // console.log('  Needs Trading approval:', needsTradingApproval, `(current: ${tradingAllowance}, required: ${MIN_REQUIRED_APPROVAL})`);

      if (!needsStorageApproval) {
        console.log('[OstiumConnect] USDC already sufficiently approved, skipping to complete');
        setUsdcApproved(true);
        setStep('complete');

        // Call onSuccess but don't auto-close - let user close manually
        if (onSuccess) {
          onSuccess();
        }
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

      // if (needsTradingApproval) {
      //   const approveDataTrading = usdcContract.interface.encodeFunctionData('approve', [OSTIUM_TRADING_CONTRACT, allowanceAmount]);
      //   const gasEstimateTrading = await ethersProvider.estimateGas({
      //     to: USDC_TOKEN,
      //     from: user.wallet.address,
      //     data: approveDataTrading,
      //   });

      //   // 50% gas buffer for reliability
      //   const gasWithBufferTrading = gasEstimateTrading.mul(150).div(100);
      //   console.log(`[OstiumConnect] USDC Trading approval - Gas estimate: ${gasEstimateTrading.toString()}, with 50% buffer: ${gasWithBufferTrading.toString()}`);

      //   const txHashTrading = await provider.request({
      //     method: 'eth_sendTransaction',
      //     params: [{
      //       from: user.wallet.address,
      //       to: USDC_TOKEN,
      //       data: approveDataTrading,
      //       gas: gasWithBufferTrading.toHexString(),
      //     }],
      //   });

      //   setTxHash(txHashTrading);
      //   await ethersProvider.waitForTransaction(txHashTrading);
      // }

      setUsdcApproved(true);
      setStep('complete');

      // Call onSuccess but don't auto-close - let user close manually
      if (onSuccess) {
        onSuccess();
      }

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

  const handlePreferencesSet = (preferences: TradingPreferences) => {
    console.log('[OstiumConnect] Trading preferences set:', preferences);
    tradingPreferencesRef.current = preferences;
    setTradingPreferences(preferences);

    // After preferences are set, proceed to check setup status with fresh prefs
    setLoading(true);
    checkSetupStatus();
  };

  const loadFirstDeploymentPreferences = async () => {
    if (!user?.wallet?.address) return null;

    try {
      const response = await fetch(
        `/api/user/first-deployment-preferences?userWallet=${user.wallet.address}&agentId=${agentId}`
      );

      if (!response.ok) {
        console.warn('[OstiumConnect] Failed to load first deployment preferences');
        return null;
      }

      const data = await response.json();

      if (data.isFirstDeployment) {
        console.log('[OstiumConnect] This is the first deployment - using default preferences');
        return null;
      }

      console.log('[OstiumConnect] Loaded first deployment preferences:', data.preferences);
      return data.preferences;
    } catch (err) {
      console.error('[OstiumConnect] Error loading first deployment preferences:', err);
      return null;
    }
  };

  const goBack = () => {
    if (step === 'preferences') {
      setStep('connect');
    } else if (step === 'agent') {
      setStep('preferences');
    } else if (step === 'delegate') {
      setStep('preferences');
    } else if (step === 'usdc') {
      setStep('delegate');
    } else if (step === 'complete') {
      setStep('usdc');
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onWheelCapture={(e) => {
        // Keep scroll inside the modal stack; don't bubble to page
        e.stopPropagation();
      }}
    >
      <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden overscroll-contain">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-6 py-4 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
              <Zap className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <p className="data-label mb-1">OSTIUM JOURNEY</p>
              <h2 className="font-display text-xl">Deploy {agentName} on Ostium</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex">
          {/* Left: Journey steps */}
          <aside className="hidden md:flex w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-deep)] px-6 py-6 space-y-6">
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">Your setup journey</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Follow the steps to connect your wallet, tune how the agent trades, and approve Ostium to execute on your behalf.
              </p>
            </div>

            <ol className="space-y-4 text-xs">
              <li className="flex items-start gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${step === 'connect'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  1
                </span>
                <div>
                  <p className="font-semibold">Connect wallet</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Authorize your Arbitrum wallet.</p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${step === 'preferences'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  2
                </span>
                <div>
                  <p className="font-semibold">Trading style</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Set risk, frequency, and filters.</p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${step === 'delegate'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  3
                </span>
                <div>
                  <p className="font-semibold">Delegate access</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Whitelist the agent wallet.</p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${step === 'usdc'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  4
                </span>
                <div>
                  <p className="font-semibold">Approve USDC spend</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Let Ostium use your USDC for trades.</p>
                </div>
              </li>

              <li className="flex items-start gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${step === 'complete'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  ✓
                </span>
                <div>
                  <p className="font-semibold">Agent live</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Signals will start executing automatically.</p>
                </div>
              </li>
            </ol>
          </aside>

          {/* Right: Active step content */}
          <div
            className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar min-h-0"
            onWheelCapture={(e) => {
              const el = e.currentTarget;
              const isScrollable = el.scrollHeight > el.clientHeight;
              const isAtTop = el.scrollTop === 0;
              const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
              if (isScrollable && !(isAtTop && e.deltaY < 0) && !(isAtBottom && e.deltaY > 0)) {
                e.stopPropagation();
              }
            }}
          >
            {error && (
              <div className="flex items-start gap-3 p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
                <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-[var(--danger)]">{error}</span>
              </div>
            )}

            {step === 'connect' ? (
              authenticated && user?.wallet?.address ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 border border-[var(--accent)]/60 bg-[var(--accent)]/5 rounded">
                    <div className="w-12 h-12 border border-[var(--accent)] flex items-center justify-center bg-[var(--bg-deep)]">
                      <Wallet className="w-6 h-6 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Wallet connected</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate font-mono">
                        {user.wallet.address}
                      </p>
                    </div>
                    <div className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold">
                      ARBITRUM
                    </div>
                  </div>
                  <div className="border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)] rounded">
                    <p className="font-semibold text-[var(--text-primary)] mb-1">Ready to start</p>
                    <p>We’ll keep your wallet connected while you finish the steps.</p>
                  </div>
                  <button
                    onClick={() => setStep('preferences')}
                    className="w-full py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                // Show connect button if not authenticated
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
              )
            ) : step === 'preferences' ? (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                    <Zap className="w-6 h-6 text-[var(--accent)]" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg">Set Your Trading Preferences</h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      {firstDeploymentPreferences
                        ? 'Using values from your first deployment. Adjust as needed.'
                        : 'Configure how this agent should size and filter trades for you.'}
                    </p>
                  </div>
                </div>

                <div className="border border-[var(--border)] bg-[var(--bg-deep)] flex flex-col max-h-[60vh]">
                  {loadingFirstDeploymentPreferences ? (
                    <div className="flex items-center justify-center py-20">
                      <Activity className="w-8 h-8 text-[var(--accent)] animate-spin" />
                    </div>
                  ) : (
                    <TradingPreferencesForm
                      userWallet={user?.wallet?.address || ''}
                      onClose={onClose}
                      onBack={goBack}
                      localOnly={true}
                      onSaveLocal={handlePreferencesSet}
                      primaryLabel={loading ? 'Saving...' : 'Save & Continue'}
                      initialPreferences={firstDeploymentPreferences || tradingPreferences || undefined}
                    />
                  )}
                </div>
              </div>
            ) : step === 'agent' ? (
              <div className="text-center space-y-4 py-8">
                <Activity className="w-16 h-16 mx-auto text-[var(--accent)] animate-pulse" />
                <div>
                  <h3 className="font-display text-lg mb-2">ASSIGNING AGENT...</h3>
                  <p className="text-sm text-[var(--text-muted)]">
                    Assigning your agent wallet
                  </p>
                </div>
              </div>
            ) : step === 'delegate' ? (
              <>
                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4 space-y-2 rounded">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--accent)] font-semibold">Step 3 · Delegate access</p>
                    {delegateApproved && (
                      <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Whitelist the agent wallet so it can trade on your behalf. This step is permanent unless you revoke delegation.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-xs">
                  <div className="border border-[var(--border)] p-3 rounded">
                    <p className="font-semibold text-[var(--text-primary)]">Agent wallet</p>
                    <p className="font-mono break-all text-[var(--text-secondary)] mt-1">{agentAddress}</p>
                  </div>
                  <div className="border border-[var(--border)] p-3 rounded">
                    <p className="font-semibold text-[var(--text-primary)]">What this allows</p>
                    <p className="text-[var(--text-secondary)] mt-1">
                      Trading delegation only; funds remain in your wallet. USDC spending still needs approval in the next step.
                    </p>
                  </div>
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

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="w-32 py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors"
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    onClick={approveAgent}
                    disabled={loading || delegateApproved}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                  {delegateApproved && (
                    <button
                      onClick={() => setStep('usdc')}
                      className="w-40 py-3 border border-[var(--accent)] text-[var(--accent)] font-semibold hover:bg-[var(--accent)]/10 transition-colors"
                      type="button"
                    >
                      Next: USDC
                    </button>
                  )}
                </div>
              </>
            ) : step === 'usdc' ? (
              <>
                {/* <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-4 rounded">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--accent)] font-semibold">Step 3 complete · Delegation approved</p>
                    <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                      Done
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Agent wallet is whitelisted to trade on your behalf.
                  </p>
                </div> */}

                <div className="border border-[var(--border)] p-4 space-y-3 text-sm rounded">
                  <div className="flex items-center justify-between">
                    <p className="font-bold">STEP 4: APPROVE USDC SPENDING</p>
                    {!usdcApproved && (
                      <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                        Required
                      </span>
                    )}
                    {usdcApproved && (
                      <span className="text-[10px] px-2 py-1 border border-[var(--accent)] text-[var(--accent)] font-bold rounded">
                        Completed
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--text-secondary)]">
                    Approve USDC so the agent can open and manage positions. Funds stay in your wallet; approval sets a spending limit.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-xs">
                  <div className="border border-[var(--border)] p-3 rounded">
                    <p className="font-semibold text-[var(--text-primary)]">Suggested allowance</p>
                    <p className="text-[var(--text-secondary)] mt-1">1,000,000 USDC (to avoid repeated approvals)</p>
                  </div>
                  <div className="border border-[var(--border)] p-3 rounded">
                    <p className="font-semibold text-[var(--text-primary)]">Why needed</p>
                    <p className="text-[var(--text-secondary)] mt-1">
                      Lets the agent place and close trades. You can revoke or reduce allowance any time from your wallet.
                    </p>
                  </div>
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

                <div className="flex gap-3">
                  <button
                    onClick={goBack}
                    className="w-32 py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors"
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    onClick={approveUsdc}
                    disabled={loading || usdcApproved}
                    className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Activity className="w-5 h-5 animate-pulse" />
                        SIGNING...
                      </>
                    ) : usdcApproved ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        USDC APPROVED
                      </>
                    ) : (
                      'APPROVE USDC →'
                    )}
                  </button>
                  {usdcApproved && (
                    <button
                      onClick={() => setStep('complete')}
                      className="w-40 py-3 border border-[var(--accent)] text-[var(--accent)] font-semibold hover:bg-[var(--accent)]/10 transition-colors"
                      type="button"
                    >
                      Next: Finish
                    </button>
                  )}
                </div>
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

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={goBack}
                    className="px-4 py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors"
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

