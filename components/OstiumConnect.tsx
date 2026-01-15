/**
 * Ostium Connection Flow - Brutalist Design
 */

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Zap, Activity, ExternalLink, CreditCard, Shield, ArrowRight, Sparkles, Plus } from 'lucide-react';
import { ethers } from 'ethers';
import { TradingPreferencesForm, TradingPreferences } from './TradingPreferencesModal';
import { getOstiumConfig } from '../lib/ostium-config';
import { Web3CheckoutModal } from './Web3CheckoutModal';
import { PaymentSelectorModal } from './PaymentSelectorModal';

const pricingTiers = [
  {
    name: "STARTER",
    price: "$19",
    credits: "1,000 Credits",
    value: 1000,
    description: "Kickstart your automated trading with essential credits.",
    accent: "var(--accent)",
  },
  {
    name: "PRO",
    price: "$49",
    credits: "5,000 Credits",
    value: 5000,
    description: "The sweet spot for active traders seeking efficiency.",
    accent: "var(--accent)",
  },
  {
    name: "WHALE",
    price: "$99",
    credits: "15,000 Credits",
    value: 15000,
    description: "Maximum power for serious institutional-grade trading.",
    accent: "#ffaa00",
  }
];

interface OstiumConnectProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// Get Ostium configuration based on environment
const { tradingContract: OSTIUM_TRADING_CONTRACT, usdcContract: USDC_TOKEN, storageContract: OSTIUM_STORAGE, chainId: ARBITRUM_CHAIN_ID } = getOstiumConfig();
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
  const [step, setStep] = useState<'connect' | 'preferences' | 'agent' | 'approvals' | 'complete'>('connect');
  const [joiningAgent, setJoiningAgent] = useState(false);
  const [checkingApprovalStatus, setCheckingApprovalStatus] = useState(false);
  const [delegationStatus, setDelegationStatus] = useState<boolean | null>(null);
  const [usdcAllowanceStatus, setUsdcAllowanceStatus] = useState<boolean | null>(null);

  // Trading preferences stored locally until all approvals complete
  const [tradingPreferences, setTradingPreferences] = useState<TradingPreferences | null>(null);
  const tradingPreferencesRef = useRef<TradingPreferences | null>(null); // ensures latest prefs are used in async flows
  const [firstDeploymentPreferences, setFirstDeploymentPreferences] = useState<TradingPreferences | null>(null);
  const [loadingFirstDeploymentPreferences, setLoadingFirstDeploymentPreferences] = useState(false);

  // Guard refs to prevent duplicate API calls
  const isCheckingRef = useRef(false);
  const isAssigningRef = useRef(false);
  const [hasInitialized, setHasInitialized] = useState(false); // Persists in state, not ref

  // Payment & Cost State
  const [agentData, setAgentData] = useState<any>(null);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [isWeb3ModalOpen, setIsWeb3ModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<any>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showTopUpUI, setShowTopUpUI] = useState(false);
  const [isCreator, setIsCreator] = useState(false); // Track if current user is the club creator

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      loadAgentData();
      loadCreditBalance();
    }
  }, [authenticated, user?.wallet?.address]);

  useEffect(() => {
    // If already authenticated when component mounts, go to preferences step first
    if (authenticated && user?.wallet?.address && step === 'connect' && !hasInitialized) {
      setHasInitialized(true);
      // Load agent data and credit balance
      loadAgentData();
      loadCreditBalance();
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

  const loadAgentData = async () => {
    try {
      const response = await fetch(`/api/agents/${agentId}`);
      if (response.ok) {
        const data = await response.json();
        setAgentData(data);

        // Check if current user is the club creator
        const userWallet = user?.wallet?.address?.toLowerCase() || '';
        const creatorWallet = (data.creator_wallet || '').toLowerCase();
        const creatorFlag = userWallet && creatorWallet && userWallet === creatorWallet;
        setIsCreator(creatorFlag);
        console.log('[OstiumConnect] Creator check:', { userWallet, creatorWallet, isCreator: creatorFlag });

        // Calculate total cost
        let subtotal = 0;
        if (data.agent_telegram_users) {
          data.agent_telegram_users.forEach((au: any) => {
            if (au.telegram_alpha_users?.credit_price) {
              subtotal += parseFloat(au.telegram_alpha_users.credit_price);
            }
          });
        }
        const platformFee = subtotal * 0.1;
        setTotalCost(subtotal + platformFee);
        console.log('[OstiumConnect] Agent cost calculated:', { subtotal, platformFee, total: subtotal + platformFee });
      }
    } catch (err) {
      console.error('[OstiumConnect] Error loading agent data:', err);
    }
  };

  const loadCreditBalance = async () => {
    if (!user?.wallet?.address) return;
    try {
      const response = await fetch(`/api/user/credits/balance?wallet=${user.wallet.address}`);
      if (response.ok) {
        const data = await response.json();
        setCreditBalance(parseFloat(data.balance || '0'));
        console.log('[OstiumConnect] User credit balance:', data.balance);
      }
    } catch (err) {
      console.error('[OstiumConnect] Error loading credit balance:', err);
    }
  };

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
              console.log('[OstiumConnect] ✅ Wallet already has approvals');
              setAgentAddress(setupData.addresses.ostium);
              setDelegateApproved(true);
              setUsdcApproved(true);
              setStep('complete');
              setLoading(false);
              return;
            } else {
              // User has address but USDC approval was revoked - need to re-approve
              console.log('[OstiumConnect] ⚠️ USDC approval revoked - need to re-approve');
              setAgentAddress(setupData.addresses.ostium);
              // Skip delegate (already done) but need USDC approval
              setDelegateApproved(true); // setDelegate is permanent
              setStep('approvals');
              setLoading(false);
            }
          } else {
            // Couldn't check approval status - go through full flow to be safe
            console.log('[OstiumConnect] Could not check approval status - showing approvals step');
            setAgentAddress(setupData.addresses.ostium);
            setStep('approvals');
            setLoading(false);
          }
        } else {
          // No Ostium address for this wallet - FIRST TIME user with this wallet
          // Need to generate new address and go through full approval flow
          console.log('[OstiumConnect] 🆕 First time for this wallet - generating new address');
          setStep('agent');
          setLoading(false);
          // Don't auto-assign - user will click button
        }
      } else {
        console.log('[OstiumConnect] Setup check failed - starting from agent step');
        setStep('agent');
        setLoading(false);
        // Don't auto-assign - user will click button
      }
    } catch (err) {
      console.error('[OstiumConnect] Error checking setup status:', err);
      setStep('agent');
      setLoading(false);
      // Don't auto-assign - user will click button
    } finally {
      isCheckingRef.current = false;
    }
  };

  const createDeploymentDirectly = async (wallet: string) => {
    // Skip deployment creation - just set up the UI state
    // Deployment will be created when user clicks "Join Agent" in the complete step
    console.log('[OstiumConnect] ✅ Wallet already has approvals - skipping to complete step without deployment');
    setDelegateApproved(true);
    setUsdcApproved(true);
    setStep('complete');
    setLoading(false);
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

      // Don't create deployment here - just assign the agent address
      // Deployment will be created when user clicks "Join Agent" in the complete step
      console.log('[OstiumConnect] Agent address assigned, skipping deployment creation');
      // Don't auto-advance - user will click Next button
    } catch (err: any) {
      console.error('[OstiumConnect] Failed to assign agent:', err);
      setError(err.message || 'Failed to assign agent wallet');
    } finally {
      setLoading(false);
      isAssigningRef.current = false;
    }
  };

  const joinAgent = async () => {
    // 1. Check if user has enough credits (skip for creators - they join for free)
    if (!isCreator && totalCost > 0 && creditBalance < totalCost) {
      console.log('[OstiumConnect] Insufficient credits to join, showing top-up UI');
      setShowTopUpUI(true);
      return;
    }

    setJoiningAgent(true);
    setError('');

    try {
      const requestBody: Record<string, unknown> = {
        agentId,
        userWallet: user?.wallet?.address,
      };

      // Include trading preferences if available (always use ref to avoid stale state)
      if (tradingPreferencesRef.current) {
        requestBody.tradingPreferences = tradingPreferencesRef.current;
        console.log('[OstiumConnect] Creating deployment with preferences:', tradingPreferencesRef.current);
      } else {
        console.warn('[OstiumConnect] Creating deployment without preferences - will use defaults');
      }

      console.log('[OstiumConnect] Joining agent with payment:', requestBody);

      // Use the new atomic join-with-payment API
      const response = await fetch('/api/agents/join-with-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join agent');
      }

      const data = await response.json();
      setDeploymentId(data.deployment.id);
      console.log('[OstiumConnect] ✅ Joined agent successfully:', data.deployment.id);

      // Refresh balance after join
      loadCreditBalance();

      // Call onSuccess to refresh setup status
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Error joining agent:', err);
      setError(err.message || 'Failed to join agent');
    } finally {
      setJoiningAgent(false);
    }
  };

  const handleBuyCredits = (tier: any) => {
    setSelectedTier(tier);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSelection = async (method: 'stripe' | 'web3') => {
    if (method === 'stripe') {
      setIsRedirecting(true);
      try {
        const response = await fetch('/api/payments/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tierName: selectedTier.name,
            userWallet: user?.wallet?.address
          }),
        });

        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error('Failed to create checkout session:', data.error);
          alert('Failed to start Stripe checkout. Please try again.');
        }
      } catch (error) {
        console.error('Stripe error:', error);
        alert('An error occurred. Please try again.');
      } finally {
        setIsRedirecting(false);
        setIsPaymentModalOpen(false);
      }
    } else {
      setIsPaymentModalOpen(false);
      setIsWeb3ModalOpen(true);
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

      console.log('[OstiumConnect] ✅ Delegate approved');
      setDelegateApproved(true);
      setDelegationStatus(true);
      setTxHash(null); // Clear tx hash for next transaction

      // After delegation, check if USDC approval is needed
      await checkAndApproveUsdc();

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

  const checkAndApproveUsdc = async () => {
    console.log('[OstiumConnect] checkAndApproveUsdc called - checking USDC approval status');
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
      if (network.chainId !== ARBITRUM_CHAIN_ID) {
        throw new Error('Please switch to Arbitrum');
      }

      const signer = ethersProvider.getSigner();
      const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);

      const currentAllowanceStorage = await usdcContract.allowance(user.wallet.address, OSTIUM_STORAGE);
      const allowanceAmount = ethers.utils.parseUnits('1000000', 6);

      const storageAllowance = parseFloat(ethers.utils.formatUnits(currentAllowanceStorage, 6));
      const requiredAmount = parseFloat(ethers.utils.formatUnits(allowanceAmount, 6));

      console.log('[OstiumConnect] USDC Approval Check:');
      console.log('  Storage allowance:', storageAllowance, 'USDC');
      console.log('  Required amount:', requiredAmount, 'USDC');

      const MIN_REQUIRED_APPROVAL = 100;
      const needsStorageApproval = storageAllowance < MIN_REQUIRED_APPROVAL;

      console.log('  Needs Storage approval:', needsStorageApproval, `(current: ${storageAllowance}, required: ${MIN_REQUIRED_APPROVAL})`);

      if (!needsStorageApproval) {
        console.log('[OstiumConnect] USDC already sufficiently approved');
        setUsdcApproved(true);
        setUsdcAllowanceStatus(true);
        // Don't auto-advance - user will click Next button
        setLoading(false);
        return;
      }

      // Approval is needed - proceed with transaction
      console.log('[OstiumConnect] USDC approval needed, proceeding with transaction');
      await approveUsdcTransaction();
    } catch (err: any) {
      console.error('USDC approval check error:', err);
      setError(err.message || 'Failed to check USDC approval');
      setLoading(false);
    }
  };

  const approveUsdcTransaction = async () => {
    if (!authenticated || !user?.wallet?.address) {
      throw new Error('Please connect your wallet');
    }

    const provider = (window as any).ethereum;
    const ethersProvider = new ethers.providers.Web3Provider(provider);
    const signer = ethersProvider.getSigner();
    const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);

    const allowanceAmount = ethers.utils.parseUnits('1000000', 6);

    const approveData = usdcContract.interface.encodeFunctionData('approve', [OSTIUM_STORAGE, allowanceAmount]);
    const gasEstimate = await ethersProvider.estimateGas({
      to: USDC_TOKEN,
      from: user.wallet.address,
      data: approveData,
    });

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

    setUsdcApproved(true);
    setUsdcAllowanceStatus(true);
    // Don't auto-advance - user will click Next button
    setLoading(false);
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
        console.log('[OstiumConnect] USDC already sufficiently approved');
        setUsdcApproved(true);
        setUsdcAllowanceStatus(true);
        // Don't auto-advance - user will click Next button
        return;
      }

      // At least one approval is needed
      console.log('[OstiumConnect] USDC approval needed, proceeding with transaction(s)');

      if (needsStorageApproval) {
        await approveUsdcTransaction();
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
    // console.log('[OstiumConnect] Trading preferences set:', preferences);
    tradingPreferencesRef.current = preferences;
    setTradingPreferences(preferences);
    // Don't auto-advance - user will click "Next" button
  };

  const handlePreferencesNext = () => {
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
    } else if (step === 'approvals') {
      setStep('preferences');
    } else if (step === 'complete') {
      setStep('approvals');
    }
  };

  const checkApprovalStatus = async (): Promise<{ isDelegated: boolean; hasApproval: boolean }> => {
    if (!user?.wallet?.address || !agentAddress) {
      return { isDelegated: false, hasApproval: false };
    }

    setCheckingApprovalStatus(true);
    try {
      // Check delegation status
      const delegationResponse = await fetch(
        `/api/ostium/check-delegation-status?userWallet=${user.wallet.address}&agentAddress=${agentAddress}`
      );

      let isDelegated = false;
      if (delegationResponse.ok) {
        const delegationData = await delegationResponse.json();
        isDelegated = delegationData.isDelegatedToAgent;
        setDelegationStatus(isDelegated);
        setDelegateApproved(isDelegated);
        console.log('[OstiumConnect] Delegation status:', isDelegated);
      }

      // Check USDC allowance
      const allowanceResponse = await fetch(
        `/api/ostium/check-approval-status?userWallet=${user.wallet.address}`
      );

      let hasApproval = false;
      if (allowanceResponse.ok) {
        const allowanceData = await allowanceResponse.json();
        hasApproval = allowanceData.hasApproval;
        setUsdcAllowanceStatus(hasApproval);
        setUsdcApproved(hasApproval);
        console.log('[OstiumConnect] USDC allowance status:', hasApproval);
      }

      // Don't auto-advance - user will click Next button
      return { isDelegated, hasApproval };
    } catch (err) {
      console.error('[OstiumConnect] Error checking approval status:', err);
      return { isDelegated: false, hasApproval: false };
    } finally {
      setCheckingApprovalStatus(false);
    }
  };

  const enableOneClickTrading = async () => {
    setLoading(true);
    setError('');

    try {
      if (!authenticated || !user?.wallet?.address) {
        throw new Error('Please connect your wallet');
      }

      if (!agentAddress) {
        throw new Error('Agent not assigned yet');
      }

      // First, check current status
      const { isDelegated, hasApproval } = await checkApprovalStatus();

      // If delegation is not done, do it first
      if (!isDelegated) {
        console.log('[OstiumConnect] Delegation needed, proceeding...');
        await approveAgent();
        // approveAgent will call checkAndApproveUsdc after completion
        return;
      }

      // If delegation is done but USDC is not, approve USDC
      if (isDelegated && !hasApproval) {
        console.log('[OstiumConnect] USDC approval needed, proceeding...');
        await checkAndApproveUsdc();
        return;
      }

      // Both are done - user can click Next button to proceed
      setLoading(false);
    } catch (err: any) {
      console.error('[OstiumConnect] Error enabling 1-click trading:', err);
      if (err.code === 4001 || err.message?.includes('rejected')) {
        setError('Transaction rejected');
      } else {
        setError(err.message || 'Failed to enable 1-click trading');
      }
      setLoading(false);
    }
  };

  // Automatically assign agent when entering agent step
  useEffect(() => {
    if (step === 'agent' && user?.wallet?.address && !agentAddress && !loading && !isAssigningRef.current) {
      assignAgent();
    }
  }, [step, user?.wallet?.address, agentAddress, loading]);

  // When returning to preferences step within the same flow,
  // restore the last saved preferences from the ref into local state.
  useEffect(() => {
    if (step === 'preferences' && tradingPreferencesRef.current && !tradingPreferences) {
      setTradingPreferences(tradingPreferencesRef.current);
    }
  }, [step, tradingPreferences]);

  // Check approval status when entering approvals step
  useEffect(() => {
    if (step === 'approvals' && user?.wallet?.address && agentAddress && !checkingApprovalStatus) {
      checkApprovalStatus();
    }
  }, [step, user?.wallet?.address, agentAddress]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-1 sm:p-2 md:p-4"
      onWheelCapture={(e) => {
        // Keep scroll inside the modal stack; don't bubble to page
        e.stopPropagation();
      }}
    >
      <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-5xl w-full max-h-[98vh] sm:max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden overscroll-contain">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border border-[var(--accent)] flex items-center justify-center flex-shrink-0">
              <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-[var(--accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="data-label mb-0.5 sm:mb-1 text-[9px] sm:text-[10px] md:text-xs">JOIN ALPHA CLUB</p>
              <h2 className="font-display text-xs sm:text-sm md:text-lg lg:text-xl truncate">Join {agentName}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 md:p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex">
          {/* Left: Journey steps */}
          <aside className="hidden lg:flex w-56 xl:w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-deep)] px-4 xl:px-6 py-4 xl:py-6 space-y-4 xl:space-y-6">
            <div>
              <p className="text-[10px] xl:text-xs font-semibold text-[var(--text-muted)] mb-1 xl:mb-2">Your setup journey</p>
              <p className="text-[10px] xl:text-xs text-[var(--text-secondary)]">
                Follow the steps to connect your wallet, set your trading style, and let the agent trade on your behalf.
              </p>
            </div>

            <ol className="space-y-3 xl:space-y-4 text-[10px] xl:text-xs">
              <li className="flex items-start gap-2 xl:gap-3">
                <span
                  className={`flex h-5 w-5 xl:h-6 xl:w-6 items-center justify-center rounded-full border text-[8px] xl:text-[10px] font-bold ${step === 'connect'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  1
                </span>
                <div>
                  <p className="font-semibold">Connect wallet</p>
                  <p className="text-[8px] xl:text-[10px] text-[var(--text-muted)]">Authorize your Arbitrum wallet.</p>
                </div>
              </li>

              <li className="flex items-start gap-2 xl:gap-3">
                <span
                  className={`flex h-5 w-5 xl:h-6 xl:w-6 items-center justify-center rounded-full border text-[8px] xl:text-[10px] font-bold ${step === 'preferences'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  2
                </span>
                <div>
                  <p className="font-semibold">Trading style</p>
                  <p className="text-[8px] xl:text-[10px] text-[var(--text-muted)]">Set risk, frequency, and filters.</p>
                </div>
              </li>

              <li className="flex items-start gap-2 xl:gap-3">
                <span
                  className={`flex h-5 w-5 xl:h-6 xl:w-6 items-center justify-center rounded-full border text-[8px] xl:text-[10px] font-bold ${step === 'approvals'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  3
                </span>
                <div>
                  <p className="font-semibold">Enable 1-Click Trading</p>
                  <p className="text-[8px] xl:text-[10px] text-[var(--text-muted)]">Delegate signatures and set allowance.</p>
                </div>
              </li>

              <li className="flex items-start gap-2 xl:gap-3">
                <span
                  className={`flex h-5 w-5 xl:h-6 xl:w-6 items-center justify-center rounded-full border text-[8px] xl:text-[10px] font-bold ${step === 'complete'
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-muted)]'
                    }`}
                >
                  4
                </span>
                <div>
                  <p className="font-semibold">Join Agent</p>
                  <p className="text-[8px] xl:text-[10px] text-[var(--text-muted)]">Deploy the agent and start trading.</p>
                </div>
              </li>
            </ol>
          </aside>

          {/* Right: Active step content */}
          <div
            className="flex-1 p-2 sm:p-3 md:p-4 lg:p-6 space-y-2 sm:space-y-3 md:space-y-4 overflow-y-auto custom-scrollbar min-h-0"
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
            {showTopUpUI ? (
              <div className="space-y-3 sm:space-y-4 md:space-y-5 py-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border border-[var(--accent)] flex items-center justify-center bg-[var(--accent)]/10 flex-shrink-0">
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <h3 className="font-display text-xs sm:text-sm md:text-lg uppercase tracking-tight">Top-up Required</h3>
                    <p className="text-[8px] sm:text-[9px] md:text-[10px] text-[var(--text-muted)]">You need more credits to join this project's signals.</p>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3">
                  <div className="border border-[var(--border)] p-1.5 sm:p-2 md:p-3 bg-[var(--bg-deep)]/50">
                    <p className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-muted)] uppercase font-bold mb-0.5">Join Cost</p>
                    <p className="text-xs sm:text-sm md:text-lg font-display">{totalCost.toFixed(0)} <span className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-secondary)]">CREDS</span></p>
                  </div>
                  <div className="border border-[var(--border)] p-1.5 sm:p-2 md:p-3 bg-[var(--bg-deep)]/50">
                    <p className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-muted)] uppercase font-bold mb-0.5">Your Balance</p>
                    <p className="text-xs sm:text-sm md:text-lg font-display">{creditBalance.toFixed(0)} <span className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-secondary)]">CREDS</span></p>
                  </div>
                  <div className="border border-[var(--accent)]/30 p-1.5 sm:p-2 md:p-3 bg-[var(--accent)]/5">
                    <p className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--accent)] uppercase font-bold mb-0.5">Shortfall</p>
                    <p className="text-xs sm:text-sm md:text-lg font-display text-[var(--accent)]">{(totalCost - creditBalance).toFixed(0)} <span className="text-[7px] sm:text-[8px] md:text-[9px]">CREDS</span></p>
                  </div>
                </div>

                <div className="space-y-2 sm:space-y-3">
                  <p className="text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)]">Select a Package</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    {(() => {
                      const shortfall = totalCost - creditBalance;
                      const recommendedTier = pricingTiers.find(t => t.value >= shortfall) || pricingTiers[pricingTiers.length - 1];

                      return pricingTiers.map((tier) => {
                        const isRecommended = tier.name === recommendedTier.name;
                        return (
                          <button
                            key={tier.name}
                            onClick={() => handleBuyCredits(tier)}
                            className={`relative text-left p-2.5 sm:p-3 md:p-4 border transition-all group overflow-hidden ${isRecommended ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/50 bg-[var(--bg-elevated)]/30'
                              }`}
                          >
                            {isRecommended && (
                              <div className="absolute top-0 right-0 px-1 sm:px-1.5 md:px-2 py-0.5 bg-[var(--accent)] text-[var(--bg-deep)] text-[6px] sm:text-[7px] md:text-[8px] font-bold uppercase">
                                Recommended
                              </div>
                            )}
                            <p className="text-[7px] sm:text-[8px] font-bold text-[var(--text-muted)] uppercase mb-0.5">{tier.name}</p>
                            <p className="text-xs sm:text-sm md:text-md font-display text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{tier.credits}</p>
                            <p className="text-sm sm:text-md md:text-lg font-display text-[var(--accent)] mt-1">{tier.price}</p>
                            <div className="mt-2 sm:mt-3 flex items-center gap-1 text-[7px] sm:text-[8px] md:text-[9px] font-bold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                              BUY NOW <ArrowRight className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3" />
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-3 sm:pt-4 border-t border-[var(--border)] gap-2 sm:gap-0">
                  <button
                    onClick={() => setShowTopUpUI(false)}
                    className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 border border-[var(--border)] text-[var(--text-secondary)] text-[10px] sm:text-xs font-bold hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
                  >
                    CANCEL
                  </button>
                  <div className="text-center sm:text-right">
                    <p className="text-[8px] sm:text-[9px] text-[var(--text-muted)] uppercase italic">CONTINUE JOINING AFTER TOP-UP</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-start gap-3 p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
                    <AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-[var(--danger)]">{error}</span>
                  </div>
                )}

                {step === 'connect' ? (
                  authenticated && user?.wallet?.address ? (
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border border-[var(--accent)]/60 bg-[var(--accent)]/5 rounded">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 border border-[var(--accent)] flex items-center justify-center bg-[var(--bg-deep)] flex-shrink-0">
                          <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--accent)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">Wallet connected</p>
                          <p className="text-[10px] sm:text-xs text-[var(--text-secondary)] truncate font-mono">
                            {user.wallet.address}
                          </p>
                        </div>
                        <div className="text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 sm:py-1 border border-[var(--accent)] text-[var(--accent)] font-bold whitespace-nowrap">
                          ARBITRUM
                        </div>
                      </div>
                      <div className="border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)] rounded">
                        <p className="font-semibold text-[var(--text-primary)] mb-1">Ready to start</p>
                        <p>We’ll keep your wallet connected while you finish the steps.</p>
                      </div>
                      <button
                        onClick={() => setStep('preferences')}
                        className="w-full py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors text-sm sm:text-base"
                      >
                        Continue
                      </button>
                    </div>
                  ) : (
                    // Show connect button if not authenticated
                    <div className="text-center space-y-4 sm:space-y-6 py-3 sm:py-4">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto border border-[var(--accent)] flex items-center justify-center">
                        <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--accent)]" />
                      </div>
                      <div>
                        <h3 className="font-display text-base sm:text-lg mb-1 sm:mb-2">CONNECT WALLET</h3>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                          Connect your Arbitrum wallet to whitelist the agent
                        </p>
                      </div>
                      <button
                        onClick={handleConnect}
                        className="w-full py-3 sm:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
                        CONNECT WALLET
                      </button>
                    </div>
                  )
                ) : step === 'preferences' ? (
                  <div className="space-y-2 sm:space-y-3 md:space-y-4 py-1 sm:py-2">
                    <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border border-[var(--accent)] flex items-center justify-center flex-shrink-0">
                        <Zap className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[var(--accent)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-xs sm:text-sm md:text-lg">Set Your Trading Preferences</h3>
                        <p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-muted)]">
                          {firstDeploymentPreferences
                            ? 'Using values from your first deployment. Adjust as needed.'
                            : 'Configure how this agent should size and filter trades for you.'}
                        </p>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] bg-[var(--bg-deep)] flex flex-col max-h-[55vh] sm:max-h-[60vh]">
                      {loadingFirstDeploymentPreferences ? (
                        <div className="flex items-center justify-center py-12 sm:py-20">
                          <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--accent)] animate-spin" />
                        </div>
                      ) : (
                        <TradingPreferencesForm
                          userWallet={user?.wallet?.address || ''}
                          onClose={onClose}
                          onBack={goBack}
                          localOnly={true}
                          onSaveLocal={handlePreferencesSet}
                          primaryLabel="Save and Next"
                          // Prefer the most recent in-memory preferences, then fall back
                          initialPreferences={
                            tradingPreferencesRef.current ||
                            firstDeploymentPreferences ||
                            tradingPreferences ||
                            undefined
                          }
                          onNext={handlePreferencesNext}
                          nextDisabled={loading}
                          nextLoading={loading}
                        />
                      )}
                    </div>
                  </div>
                ) : step === 'agent' ? (
                  <div className="space-y-4 sm:space-y-5 md:space-y-6 py-2 sm:py-3 md:py-4">
                    <div>
                      <h3 className="font-display text-lg sm:text-xl md:text-2xl mb-1 sm:mb-2">Assign Agent Wallet</h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                        Generate a unique agent wallet address for this deployment.
                      </p>
                    </div>

                    {loading ? (
                      <div className="text-center space-y-3 sm:space-y-4 py-6 sm:py-8">
                        <Activity className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto text-[var(--accent)] animate-pulse" />
                        <div>
                          <h3 className="font-display text-sm sm:text-base md:text-lg mb-1 sm:mb-2">ASSIGNING AGENT...</h3>
                          <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                            Assigning your agent wallet
                          </p>
                        </div>
                      </div>
                    ) : agentAddress ? (
                      <div className="border border-[var(--accent)]/60 bg-[var(--accent)]/5 p-3 sm:p-4 rounded">
                        <p className="text-[10px] sm:text-xs font-semibold text-[var(--accent)] mb-1 sm:mb-2 uppercase">Agent Address Assigned</p>
                        <p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)] font-mono break-all">{agentAddress}</p>
                      </div>
                    ) : (
                      <div className="border border-[var(--border)] p-3 sm:p-4 rounded">
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-3 sm:mb-4">
                          Generating your agent wallet address...
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-end">
                      <button
                        onClick={goBack}
                        className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm"
                        type="button"
                        disabled={loading}
                      >
                        Back
                      </button>
                      {agentAddress && (
                        <button
                          onClick={() => setStep('approvals')}
                          className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"
                          type="button"
                        >
                          Next
                          <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : step === 'approvals' ? (
                  <>
                    <div className="space-y-4 sm:space-y-5 md:space-y-6">
                      {/* Header */}
                      <div>
                        <h3 className="font-display text-base sm:text-lg md:text-2xl mb-1 sm:mb-2">Enable 1-Click Trading</h3>
                        <p className="text-[10px] sm:text-xs md:text-sm text-[var(--text-secondary)]">
                          Make the most of Ostium. Enable gasless transactions and 1-click trading.
                        </p>
                      </div>

                      {/* Steps Section */}
                      <div className="space-y-2 sm:space-y-3 md:space-y-4">
                        <div>
                          <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-[var(--text-muted)] mb-1 sm:mb-2">STEPS</p>
                          <p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)] mb-2 sm:mb-3 md:mb-4">Sign the following wallet requests.</p>
                        </div>

                        {/* Step 1: Enable Account Delegation */}
                        <div className="flex items-start gap-2 sm:gap-3 md:gap-4 p-2.5 sm:p-3 md:p-4 border border-[var(--border)] rounded">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded border-2 flex items-center justify-center flex-shrink-0 ${checkingApprovalStatus && delegationStatus === null
                            ? 'border-[var(--border)] bg-[var(--bg-deep)]'
                            : delegateApproved
                              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                              : 'border-[var(--border)] bg-[var(--bg-deep)]'
                            }`}>
                            {checkingApprovalStatus && delegationStatus === null ? (
                              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--text-muted)] animate-spin" />
                            ) : delegateApproved ? (
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent)]" />
                            ) : (
                              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex items-center justify-center">
                                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 border-2 border-[var(--text-muted)] rounded" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-[var(--text-muted)] mb-0.5 sm:mb-1">ENABLE ACCOUNT DELEGATION</p>
                            <p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)]">Delegate signatures to a smart wallet.</p>
                          </div>
                        </div>

                        {/* Step 2: Set Allowance */}
                        <div className="flex items-start gap-2 sm:gap-3 md:gap-4 p-2.5 sm:p-3 md:p-4 border border-[var(--border)] rounded">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded border-2 flex items-center justify-center flex-shrink-0 ${checkingApprovalStatus && usdcAllowanceStatus === null
                            ? 'border-[var(--border)] bg-[var(--bg-deep)]'
                            : usdcApproved
                              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                              : 'border-[var(--border)] bg-[var(--bg-deep)]'
                            }`}>
                            {checkingApprovalStatus && usdcAllowanceStatus === null ? (
                              <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--text-muted)] animate-spin" />
                            ) : usdcApproved ? (
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent)]" />
                            ) : (
                              <span className="text-[10px] sm:text-xs md:text-sm font-bold text-[var(--text-muted)]">2</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-[var(--text-muted)] mb-0.5 sm:mb-1">SET ALLOWANCE</p>
                            <p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)]">Set the maximum allowance. It's advisable to set this high.</p>
                          </div>
                        </div>
                      </div>

                      {/* Transaction Status */}
                      {txHash && (
                        <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-2.5 sm:p-3 rounded">
                          <p className="text-[var(--accent)] text-xs sm:text-sm mb-1 sm:mb-2">✓ Transaction confirmed</p>
                          <a
                            href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] sm:text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                          >
                            View on Arbiscan <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </a>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          onClick={goBack}
                          className="w-full sm:w-32 py-2 sm:py-2.5 md:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm"
                          type="button"
                          disabled={loading || checkingApprovalStatus}
                        >
                          Back
                        </button>
                        {delegateApproved && usdcApproved ? (
                          <button
                            onClick={() => setStep('complete')}
                            className="flex-1 py-2.5 sm:py-3 md:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"
                          >
                            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
                            Next
                            <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={enableOneClickTrading}
                            disabled={loading || checkingApprovalStatus}
                            className="flex-1 py-2.5 sm:py-3 md:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"
                          >
                            {checkingApprovalStatus ? (
                              <>
                                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 animate-spin" />
                                <span className="hidden sm:inline">CHECKING STATUS...</span>
                                <span className="sm:hidden">CHECKING...</span>
                              </>
                            ) : loading ? (
                              <>
                                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 animate-pulse" />
                                SIGNING...
                              </>
                            ) : (
                              <>
                                <span className="hidden sm:inline">ENABLE 1-CLICK TRADING</span>
                                <span className="sm:hidden">ENABLE TRADING</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : deploymentId ? (
                  <div className="text-center space-y-4 sm:space-y-5 md:space-y-6 py-3 sm:py-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto border border-[var(--accent)] bg-[var(--accent)] flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[var(--bg-deep)]" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg sm:text-xl mb-1 sm:mb-2">AGENT DEPLOYED</h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] px-2">
                        Agent is now live and ready to trade on Ostium
                      </p>
                    </div>

                    {txHash && (
                      <a
                        href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm text-[var(--accent)] hover:underline flex items-center justify-center gap-1"
                      >
                        View transaction <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </a>
                    )}

                    <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3 sm:p-4 space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-left">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] flex-shrink-0" />
                        <span>Agent whitelisted</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] flex-shrink-0" />
                        <span>USDC approved</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] flex-shrink-0" />
                        <span>Agent deployed and active</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] flex-shrink-0" />
                        <span>Ready to execute signals</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                      <button
                        onClick={goBack}
                        className="w-full sm:w-auto px-4 py-2.5 sm:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm"
                        type="button"
                      >
                        Back
                      </button>
                      <button
                        onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors text-xs sm:text-sm"
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4 sm:space-y-5 md:space-y-6 py-3 sm:py-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto border border-[var(--accent)] flex items-center justify-center">
                      <Zap className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[var(--accent)]" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg sm:text-xl mb-1 sm:mb-2">AGENT LIVE</h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] px-2">
                        All approvals complete. Ready to deploy the agent.
                      </p>
                    </div>

                    <div className="border border-[var(--border)] bg-[var(--bg-deep)]/50 p-3 sm:p-4 space-y-3 sm:space-y-4 text-left">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <p className="text-[10px] sm:text-xs font-bold text-[var(--accent)] uppercase tracking-widest">Setup Complete</p>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] flex-shrink-0" />
                          <span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-bold">READY TO ACTIVATE</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <div className="flex items-center gap-2 py-0.5 sm:py-1">
                          <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full flex-shrink-0" />
                          <span className="text-[10px] sm:text-xs text-[var(--text-secondary)]">Agent whitelisted & assigned</span>
                        </div>
                        <div className="flex items-center gap-2 py-0.5 sm:py-1">
                          <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full flex-shrink-0" />
                          <span className="text-[10px] sm:text-xs text-[var(--text-secondary)]">USDC approved (Non-custodial)</span>
                        </div>
                      </div>

                      {totalCost > 0 && (
                        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-[var(--border)]">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
                            <p className="text-[10px] sm:text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Credit Summary</p>
                            <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 border font-bold rounded ${isCreator ? 'border-green-500/30 text-green-500' : 'border-[var(--accent)]/30 text-[var(--accent)]'}`}>
                              {isCreator ? 'CREATOR - FREE ACCESS' : 'PAID ACCESS'}
                            </span>
                          </div>

                          {!isCreator && (
                            <div className="mb-3 sm:mb-4 space-y-1">
                              {agentData?.agent_telegram_users?.map((au: any, idx: number) => {
                                if (au.telegram_alpha_users?.credit_price && parseFloat(au.telegram_alpha_users.credit_price) > 0) {
                                  return (
                                    <div key={idx} className="flex flex-col sm:flex-row justify-between gap-1 text-[9px] sm:text-[10px]">
                                      <span className="text-[var(--text-secondary)] italic">Alpha Access: {au.telegram_alpha_users.telegram_username || 'Provider'}</span>
                                      <span className="text-[var(--text-primary)]">{parseFloat(au.telegram_alpha_users.credit_price).toFixed(0)} CREDS</span>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                              <div className="flex flex-col sm:flex-row justify-between gap-1 text-[9px] sm:text-[10px] pt-1 border-t border-[var(--border)] border-dashed">
                                <span className="text-[var(--text-muted)]">Platform Fee (10%)</span>
                                <span className="text-[var(--text-primary)]">{(totalCost * (10 / 110)).toFixed(0)} CREDS</span>
                              </div>
                            </div>
                          )}

                          {isCreator ? (
                            <div className="bg-green-500/5 p-2.5 sm:p-3 border border-green-500/20 rounded">
                              <p className="text-[10px] sm:text-[11px] text-green-500 font-bold text-center">
                                ✓ AS THE CREATOR, YOU JOIN FOR FREE
                              </p>
                              <p className="text-[8px] sm:text-[9px] text-[var(--text-muted)] text-center mt-1">
                                You already paid when creating this club
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                <div className="space-y-1">
                                  <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase">Cost to Join</p>
                                  <p className="text-lg sm:text-xl font-display text-[var(--text-primary)]">{totalCost.toFixed(0)} <span className="text-[9px] sm:text-[10px] text-[var(--text-secondary)]">CREDS</span></p>
                                </div>
                                <div className="space-y-1 text-right">
                                  <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase">Your Balance</p>
                                  <p className={`text-lg sm:text-xl font-display ${creditBalance < totalCost ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{creditBalance.toFixed(0)} <span className="text-[9px] sm:text-[10px] text-[var(--text-secondary)]">CREDS</span></p>
                                </div>
                              </div>

                              {creditBalance >= totalCost ? (
                                <div className="mt-2 sm:mt-3 bg-[var(--accent)]/5 p-2 border border-[var(--accent)]/10">
                                  <p className="text-[9px] sm:text-[10px] text-[var(--accent)] font-bold text-center">
                                    NEW BALANCE AFTER JOIN: {(creditBalance - totalCost).toFixed(0)} CREDS
                                  </p>
                                </div>
                              ) : (
                                <div className="mt-2 sm:mt-3 bg-red-500/5 p-2 border border-red-500/20">
                                  <p className="text-[9px] sm:text-[10px] text-red-500 font-bold text-center">
                                    ⚠ INSUFFICIENT CREDITS - NEED {(totalCost - creditBalance).toFixed(0)} MORE
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                      <button
                        onClick={goBack}
                        className="w-full sm:w-auto px-4 py-2.5 sm:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm"
                        type="button"
                      >
                        Back
                      </button>
                      <button
                        onClick={joinAgent}
                        disabled={joiningAgent || (!isCreator && totalCost > 0 && creditBalance < totalCost)}
                        className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs sm:text-sm"
                        type="button"
                      >
                        {joiningAgent ? (
                          <>
                            <Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                            <span className="hidden sm:inline">JOINING AGENT...</span>
                            <span className="sm:hidden">JOINING...</span>
                          </>
                        ) : !isCreator && totalCost > 0 && creditBalance < totalCost ? (
                          <>
                            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">INSUFFICIENT CREDITS</span>
                            <span className="sm:hidden">INSUFFICIENT</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">{isCreator ? 'JOIN AGENT (FREE - CREATOR)' : totalCost > 0 ? `JOIN AGENT (${totalCost.toFixed(0)} CREDS)` : 'JOIN AGENT (FREE)'}</span>
                            <span className="sm:hidden">JOIN AGENT</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <PaymentSelectorModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          tier={selectedTier}
          onSelectPayment={handlePaymentSelection}
        />

        <Web3CheckoutModal
          isOpen={isWeb3ModalOpen}
          onClose={() => setIsWeb3ModalOpen(false)}
          tier={selectedTier}
          userWallet={user?.wallet?.address}
          onSuccess={(hash) => {
            console.log('[OstiumConnect] Top-up success:', hash);
            setIsWeb3ModalOpen(false);
            setShowTopUpUI(false);
            loadCreditBalance(); // Refresh balance
          }}
        />

        {isRedirecting && (
          <div className="fixed inset-0 z-[200] bg-[var(--bg-deep)]/90 backdrop-blur-xl flex items-center justify-center flex-col gap-4 sm:gap-6 px-4">
            <Activity className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-[var(--accent)] animate-spin" />
            <div className="text-center">
              <h2 className="text-lg sm:text-xl md:text-2xl font-display uppercase tracking-widest text-[var(--accent)] mb-1 sm:mb-2">Redirecting to Secure Payment</h2>
              <p className="text-[var(--text-muted)] text-[10px] sm:text-xs font-bold">PLEASE WAIT · STACK: STRIPE</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

