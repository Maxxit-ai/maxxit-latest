import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Check, AlertCircle, Loader2, Rocket, Shield, Wallet, Zap, Sparkles, ExternalLink } from "lucide-react";
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import { ModuleSecurityDisclosure } from '@components/ModuleSecurityDisclosure';

// Extend Window interface for MetaMask
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function DeployAgent() {
  const router = useRouter();
  const { id: agentId } = router.query;
  
  const [safeAddress, setSafeAddress] = useState("");
  const [userWallet, setUserWallet] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentVenue, setAgentVenue] = useState("");
  const [hasExistingSafe, setHasExistingSafe] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    checking: boolean;
    valid: boolean;
    error?: string;
    balances?: any;
  }>({ checking: false, valid: false });
  const [moduleStatus, setModuleStatus] = useState<{
    checking: boolean;
    enabled: boolean;
    needsEnabling: boolean;
    error?: string;
  }>({ checking: false, enabled: false, needsEnabling: false });
  const [enablingModule, setEnablingModule] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [moduleAddress, setModuleAddress] = useState('0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb'); // V3 module
  const [transactionData, setTransactionData] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployingSafe, setDeployingSafe] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [validationError, setValidationError] = useState<{
    type: 'MODULE_NOT_ENABLED' | 'USDC_NOT_APPROVED' | 'OTHER';
    message: string;
    nextSteps?: any;
  } | null>(null);
  const [setupInProgress, setSetupInProgress] = useState(false);
  const [showSecurityDisclosure, setShowSecurityDisclosure] = useState(false);

  // Fetch agent details
  useEffect(() => {
    if (agentId) {
      fetch(`/api/agents/${agentId}`)
        .then(res => res.json())
        .then(data => {
          console.log('[Deploy Agent] Fetched agent data:', data);
          // API returns single object, not array
          if (data && data.id) {
            setAgentName(data.name);
            setAgentVenue(data.venue);
            console.log('[Deploy Agent] Set agentVenue to:', data.venue);
          }
        })
        .catch(err => console.error("Failed to load agent:", err));
    }
  }, [agentId]);

  // Auto-detect connected wallet
  useEffect(() => {
    const getConnectedWallet = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          // Check if already connected
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setUserWallet(accounts[0]);
            console.log('[Deploy Agent] Auto-detected wallet:', accounts[0]);
            return;
          }

          // Try to connect if not already connected
          const requestedAccounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          if (requestedAccounts.length > 0) {
            setUserWallet(requestedAccounts[0]);
            console.log('[Deploy Agent] Connected wallet:', requestedAccounts[0]);
          }
        } catch (error) {
          console.error('[Deploy Agent] Failed to connect wallet:', error);
          // Don't show alert here, let user manually enter if needed
        }
      }
    };

    getConnectedWallet();
  }, []);

  // Show security disclosure before deployment
  const showSecurityReview = () => {
    if (!userWallet) {
      setDeployError('Please connect your wallet first');
      return;
    }
    setShowSecurityDisclosure(true);
  };

  // Deploy Safe with module enabled (2-step but automated)
  const deployNewSafeWithModule = async () => {
    setShowSecurityDisclosure(false);

    setDeployingSafe(true);
    setDeployError('');

    try {
      console.log('[DeploySafe] Starting Safe deployment...');
      console.log('[DeploySafe] Module address:', moduleAddress);
      
      // Connect to MetaMask
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();

      console.log('[DeploySafe] Step 1/2: Deploying Safe...');

      // STEP 1: Deploy Safe using Safe SDK v5
      const safeVersion = '1.4.1';
      const chainId = await provider.getNetwork().then(n => n.chainId);
      
      const safeAccountConfig = {
        owners: [userWallet],
        threshold: 1,
      };

      // Initialize Safe SDK to get predicted address
      const safeSdk = await Safe.init({
        provider: window.ethereum,
        signer: userWallet,
        predictedSafe: {
          safeAccountConfig,
          safeDeploymentConfig: {
            safeVersion,
          }
        }
      });

      const predictedAddress = await safeSdk.getAddress();
      console.log('[DeploySafe] Predicted Safe address:', predictedAddress);

      // Check if Safe is already deployed
      const safeCode = await provider.getCode(predictedAddress);
      const isDeployed = safeCode !== '0x';

      let deployedSafeAddress = predictedAddress;

      if (isDeployed) {
        console.log('[DeploySafe] ℹ️ Safe already deployed at this address');
        console.log('[DeploySafe] Skipping deployment, using existing Safe');
      } else {
        console.log('[DeploySafe] Safe not deployed yet, deploying now...');
        
        // Deploy the Safe
        const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction();
        
        // Add from address to the transaction
        const txWithFrom = {
          ...deploymentTransaction,
          from: userWallet,
        };
        
        console.log('[DeploySafe] Sending deployment transaction...');
        
        // Send via ethers provider
        const tx = await signer.sendTransaction(txWithFrom);
        
        console.log('[DeploySafe] Deployment TX:', tx.hash);
        
        // Wait for deployment
        const receipt = await tx.wait();
        console.log('[DeploySafe] Deployment confirmed!');
      }
      
      console.log('[DeploySafe] ✅ Safe address:', deployedSafeAddress);

      // Wait a moment for deployment to settle
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[DeploySafe] Step 2/2: Enabling module + Setting up approvals (BATCHED)...');

      // STEP 2: Connect to the deployed Safe
      const connectedSafeSdk = await Safe.init({
        provider: window.ethereum,
        signer: userWallet,
        safeAddress: deployedSafeAddress,
      });

      // Check if module is already enabled
      const isModuleAlreadyEnabled = await connectedSafeSdk.isModuleEnabled(moduleAddress);
      console.log('[DeploySafe] Module already enabled:', isModuleAlreadyEnabled);

      // Prepare USDC approval data
      const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
      const ERC20_ABI = ['function approve(address spender, uint256 amount) external returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'];
      const usdcInterface = new ethers.utils.Interface(ERC20_ABI);
      
      // Check if USDC is already approved FOR THE MODULE
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const currentAllowance = await usdc.allowance(deployedSafeAddress, moduleAddress);
      const isAlreadyApproved = currentAllowance.gt(ethers.utils.parseUnits('1000000', 6)); // > 1M USDC means approved
      console.log('[DeploySafe] USDC already approved for module:', isAlreadyApproved, 'Allowance:', currentAllowance.toString());

      const transactions = [];

      // Add module enable if needed
      if (!isModuleAlreadyEnabled) {
        const SAFE_ABI = ['function enableModule(address module) external'];
        const safeInterface = new ethers.utils.Interface(SAFE_ABI);
        const enableModuleData = safeInterface.encodeFunctionData('enableModule', [moduleAddress]);
        
        transactions.push({
          to: deployedSafeAddress,
          value: '0',
          data: enableModuleData,
        });
      }

      // Add USDC approval if needed (approve FOR THE MODULE)
      if (!isAlreadyApproved) {
        const approveData = usdcInterface.encodeFunctionData('approve', [
          moduleAddress,  // Approve for MODULE, not Uniswap
          ethers.constants.MaxUint256
        ]);
        
        transactions.push({
          to: USDC_ADDRESS,
          value: '0',
          data: approveData,
        });
      }

      if (transactions.length === 0 && isDeployed) {
        console.log('[DeploySafe] ✅ Everything already configured!');
        console.log('[DeploySafe] Safe exists, module enabled, USDC approved');
      } else if (transactions.length === 0 && !isDeployed) {
        // This shouldn't happen but just in case
        console.log('[DeploySafe] ✅ New Safe ready!');
      } else {
        console.log(`[DeploySafe] Batching ${transactions.length} operation(s)...`);

        // BATCH: Execute needed operations
        const batchedTx = await connectedSafeSdk.createTransaction({
          transactions
        });

        console.log('[DeploySafe] Executing batched transaction...');
        
        // Execute the batched transaction
        const txResponse = await connectedSafeSdk.executeTransaction(batchedTx);
        
        console.log('[DeploySafe] Transaction sent:', txResponse.hash);
        
        // Wait for confirmation
        const batchReceipt = await provider.waitForTransaction(txResponse.hash);
        console.log('[DeploySafe] ✅ Transaction confirmed! Block:', batchReceipt.blockNumber);

        // Verify module is enabled
        const isModuleEnabled = await connectedSafeSdk.isModuleEnabled(moduleAddress);
        console.log('[DeploySafe] Module enabled:', isModuleEnabled);

        if (!isModuleEnabled && !isModuleAlreadyEnabled) {
          throw new Error('Module enable failed. Please try again.');
        }

        console.log('[DeploySafe] ✅ Setup complete!');
      }
      
      console.log('[DeploySafe] ⚠️  Capital will be auto-initialized when Safe is funded & first trade executes');

      // Update state
      setSafeAddress(deployedSafeAddress);
      setValidationStatus({
        checking: false,
        valid: true,
      });
      setModuleStatus({
        checking: false,
        enabled: true,
        needsEnabling: false,
      });
      setHasExistingSafe(false);

      console.log('[DeploySafe] ✅ Safe deployed successfully with module enabled!');

    } catch (error: any) {
      console.error('[DeploySafe] Error:', error);
      setDeployError(error.message || 'Failed to deploy Safe with module');
    } finally {
      setDeployingSafe(false);
    }
  };

  // Validate Safe wallet
  const validateSafe = async () => {
    if (!safeAddress || !/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      setValidationStatus({
        checking: false,
        valid: false,
        error: "Invalid Ethereum address format",
      });
      return;
    }

    setValidationStatus({ checking: true, valid: false });

    try {
      // Use Arbitrum mainnet (module is deployed on Arbitrum)
      const chainId = 42161; // Arbitrum One
      const response = await fetch(
        `/api/safe/status?safeAddress=${safeAddress}&chainId=${chainId}`
      );
      
      const data = await response.json();

      if (data.valid) {
        // Safe exists and is valid - set as valid regardless of USDC balance
        setValidationStatus({
          checking: false,
          valid: true,
          balances: data.balances,
        });
        // ALWAYS check module status (regardless of USDC balance)
        checkModuleStatus();
        // Try to auto-initialize capital if Safe has USDC
        if (data.readiness?.ready) {
          tryAutoInitializeCapital();
        }
      } else {
        setValidationStatus({
          checking: false,
          valid: false,
          error: data.error || "Safe wallet not found or invalid",
        });
      }
    } catch (error: any) {
      setValidationStatus({
        checking: false,
        valid: false,
        error: error.message || "Failed to validate Safe wallet",
      });
    }
  };

  // Check if module is enabled and USDC is approved
  const checkModuleStatus = async () => {
    console.log('[CheckModule] Starting module status check...');
    setModuleStatus({ checking: true, enabled: false, needsEnabling: false });
    setValidationError(null);

    try {
      const chainId = 42161; // Arbitrum

      // Check module and USDC approval status (read-only, doesn't create deployment)
      const response = await fetch("/api/safe/check-setup-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress,
          chainId,
        }),
      });

      const data = await response.json();
      console.log('[CheckModule] Setup status:', data);

      if (!response.ok) {
        setModuleStatus({
          checking: false,
          enabled: false,
          needsEnabling: false,
          error: data.error || 'Failed to check module status',
        });
        return;
      }

      if (data.needsSetup) {
        // Setup required - show setup button
        const errorType = !data.moduleEnabled ? 'MODULE_NOT_ENABLED' : 'USDC_NOT_APPROVED';
        setValidationError({
          type: errorType,
          message: !data.moduleEnabled 
            ? 'Trading module is not enabled on this Safe wallet'
            : 'USDC approval required for trading',
          nextSteps: {
            action: errorType,
            instructions: [
              '1. Click the button below',
              '2. Sign the Safe transaction',
              '3. Wait for confirmation',
            ],
          },
        });
        setModuleStatus({
          checking: false,
          enabled: false,
          needsEnabling: true,
        });
      } else {
        // Everything is configured
        console.log('[CheckModule] Safe is fully configured');
        setModuleStatus({
          checking: false,
          enabled: true,
          needsEnabling: false,
        });
      }
    } catch (error: any) {
      console.error('[CheckModule] Error:', error);
      setModuleStatus({
        checking: false,
        enabled: false,
        needsEnabling: false,
        error: error.message || 'Failed to check module status',
      });
    }
  };

  // Auto-initialize capital if Safe has USDC balance
  const tryAutoInitializeCapital = async () => {
    if (!safeAddress) return;

    try {
      console.log('[AutoInit] Checking if capital needs initialization...');
      
      const response = await fetch('/api/safe/auto-initialize-capital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.alreadyInitialized) {
          console.log('[AutoInit] Capital already initialized:', data.capital, 'USDC');
        } else if (data.initialized) {
          console.log('[AutoInit] ✅ Capital initialized:', data.capital, 'USDC');
          console.log('[AutoInit] Transaction:', data.txHash);
        }
      } else {
        // Not an error - Safe might just not have USDC yet
        console.log('[AutoInit]', data.error || 'Capital not initialized');
      }
    } catch (error: any) {
      // Silent fail - this is just a helper, not critical
      console.log('[AutoInit] Error (non-critical):', error.message);
    }
  };

  // Enable GMX module via Safe Transaction Builder
  const enableModuleGMXStep1 = async () => {
    setEnablingModule(true);
    setDeployError('');

    try {
      // Generate GMX setup transaction (module enable only - GMX V2 doesn't need authorization!)
      const response = await fetch('/api/gmx/generate-setup-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate setup transaction');
      }

      // Store module address and transaction data
      setModuleAddress(data.moduleAddress);
      const txData = data.sdkTransactions[0].data; // Enable module
      setTransactionData(txData);

      // Copy transaction data to clipboard
      try {
        await navigator.clipboard.writeText(txData);
        console.log('[EnableModuleGMX] Enable module data copied to clipboard');
      } catch (e) {
        console.log('[EnableModuleGMX] Clipboard copy failed');
      }

      // Open Safe Transaction Builder
      const chainPrefix = 'arb1';
      const txBuilderAppUrl = 'https://apps-portal.safe.global/tx-builder';
      const safeUrl = `https://app.safe.global/apps/open?safe=${chainPrefix}:${safeAddress}&appUrl=${encodeURIComponent(txBuilderAppUrl)}`;
      
      const safeWindow = window.open(safeUrl, '_blank');
      
      if (!safeWindow) {
        throw new Error('Please allow pop-ups to open Safe Transaction Builder');
      }

      // Show instructions
      setShowInstructions(true);
      setEnablingModule(false);
    } catch (error: any) {
      console.error('[EnableModuleGMX] Error:', error);
      setDeployError(error.message);
      setEnablingModule(false);
    }
  };

  // Setup existing Safe: Enable module + Approve USDC (batched)
  const setupExistingSafe = async () => {
    if (!safeAddress || !userWallet) {
      setDeployError('Safe address and wallet required');
      return;
    }

    setSetupInProgress(true);
    setDeployError('');
    setValidationError(null);

    try {
      console.log('[SetupExistingSafe] Starting setup for:', safeAddress);
      
      // Connect to MetaMask
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const chainId = await provider.getNetwork().then(n => n.chainId);

      // Connect to the existing Safe
      const connectedSafeSdk = await Safe.init({
        provider: window.ethereum,
        signer: userWallet,
        safeAddress: safeAddress,
      });

      console.log('[SetupExistingSafe] Connected to Safe');

      // Check if module is already enabled
      const isModuleAlreadyEnabled = await connectedSafeSdk.isModuleEnabled(moduleAddress);
      console.log('[SetupExistingSafe] Module already enabled:', isModuleAlreadyEnabled);

      // Prepare USDC approval data
      const USDC_ADDRESS = chainId === 42161 
        ? '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' // Arbitrum
        : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia
      
      const ERC20_ABI = ['function approve(address spender, uint256 amount) external returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)'];
      const usdcInterface = new ethers.utils.Interface(ERC20_ABI);
      
      // Check if USDC is already approved FOR THE MODULE
      const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
      const currentAllowance = await usdc.allowance(safeAddress, moduleAddress);
      const isAlreadyApproved = currentAllowance.gt(ethers.utils.parseUnits('1000000', 6)); // > 1M USDC
      console.log('[SetupExistingSafe] USDC already approved for module:', isAlreadyApproved, 'Allowance:', currentAllowance.toString());

      const transactions = [];

      // Add module enable if needed
      if (!isModuleAlreadyEnabled) {
        const SAFE_ABI = ['function enableModule(address module) external'];
        const safeInterface = new ethers.utils.Interface(SAFE_ABI);
        const enableModuleData = safeInterface.encodeFunctionData('enableModule', [moduleAddress]);
        
        transactions.push({
          to: safeAddress,
          value: '0',
          data: enableModuleData,
        });
        console.log('[SetupExistingSafe] Added enableModule to batch');
      }

      // Add USDC approval if needed (approve FOR THE MODULE)
      if (!isAlreadyApproved) {
        const approveData = usdcInterface.encodeFunctionData('approve', [
          moduleAddress,  // Approve for MODULE, not Uniswap
          ethers.constants.MaxUint256
        ]);
        
        transactions.push({
          to: USDC_ADDRESS,
          value: '0',
          data: approveData,
        });
        console.log('[SetupExistingSafe] Added USDC approval for module to batch');
      }

      if (transactions.length === 0) {
        console.log('[SetupExistingSafe] ✅ Everything already configured!');
        setModuleStatus({
          checking: false,
          enabled: true,
          needsEnabling: false,
        });
        setValidationError(null);
      } else {
        console.log(`[SetupExistingSafe] Batching ${transactions.length} operation(s)...`);

        // BATCH: Execute needed operations in a single transaction
        const batchedTx = await connectedSafeSdk.createTransaction({
          transactions
        });

        console.log('[SetupExistingSafe] Executing batched transaction...');
        
        // Execute the batched transaction
        const txResponse = await connectedSafeSdk.executeTransaction(batchedTx);
        
        console.log('[SetupExistingSafe] Transaction sent:', txResponse.hash);
        
        // Wait for confirmation
        const batchReceipt = await provider.waitForTransaction(txResponse.hash);
        console.log('[SetupExistingSafe] ✅ Transaction confirmed! Block:', batchReceipt.blockNumber);

        // Verify module is enabled
        const isModuleEnabled = await connectedSafeSdk.isModuleEnabled(moduleAddress);
        console.log('[SetupExistingSafe] Module enabled:', isModuleEnabled);

        if (!isModuleEnabled && !isModuleAlreadyEnabled) {
          throw new Error('Module enable failed. Please try again.');
        }

        console.log('[SetupExistingSafe] ✅ Setup complete!');
        
        // Update state
        setModuleStatus({
          checking: false,
          enabled: true,
          needsEnabling: false,
        });
        setValidationError(null);
      }

    } catch (error: any) {
      console.error('[SetupExistingSafe] Error:', error);
      setDeployError(error.message || 'Failed to setup Safe');
    } finally {
      setSetupInProgress(false);
    }
  };

  const enableModule = async () => {
    setEnablingModule(true);
    setDeployError('');

    try {
      // Use the same API endpoint as the immediate module enabling
      const chainId = 42161; // Arbitrum One
      const response = await fetch('/api/safe/enable-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress, chainId }),
      });

      const data = await response.json();

      if (data.success && data.alreadyEnabled) {
        // Module already enabled, just update status
        await checkModuleStatus();
        setEnablingModule(false);
        return;
      }

      if (data.success && data.transactionData) {
        // Store module address and transaction data
        const moduleAddr = data.moduleAddress || '0x6ad58921173219A19B7c4b6f54C07A4c040bf8Cb';
        const txData = data.transactionData || '';
        setModuleAddress(moduleAddr);
        setTransactionData(txData);
      
        // Copy transaction data to clipboard
        try {
          await navigator.clipboard.writeText(txData);
          console.log('[EnableModule] Transaction data copied to clipboard');
        } catch (e) {
          console.log('[EnableModule] Clipboard copy failed, but continuing...');
        }

        // Open Safe Transaction Builder
        const chainPrefix = 'arb1'; // Arbitrum One
        const txBuilderAppUrl = 'https://apps-portal.safe.global/tx-builder';
        const safeUrl = `https://app.safe.global/apps/open?safe=${chainPrefix}:${safeAddress}&appUrl=${encodeURIComponent(txBuilderAppUrl)}`;
        
        const safeWindow = window.open(safeUrl, '_blank');
        
        if (!safeWindow) {
          throw new Error('Please allow pop-ups to open Safe Transaction Builder');
        }

        // Show instructions panel
        setShowInstructions(true);
        setEnablingModule(false);
      }
    } catch (error: any) {
      console.error('[EnableModule] Error:', error);
      setDeployError(error.message || 'Failed to enable module');
      setEnablingModule(false);
    }
  };

  // Deploy agent
  const handleDeploy = async () => {
    if (!validationStatus.valid || !userWallet || !safeAddress) {
      return;
    }

    setDeploying(true);
    setDeployError("");
    setValidationError(null);

    try {
      const response = await fetch("/api/deployments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          userWallet,
          safeWallet: safeAddress,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[HandleDeploy] Deployment failed:', errorData);
        
        // Handle structured validation errors
        if (errorData.error === 'MODULE_NOT_ENABLED' || errorData.error === 'USDC_NOT_APPROVED') {
          setValidationError({
            type: errorData.error,
            message: errorData.message,
            nextSteps: errorData.nextSteps,
          });
        } else if (errorData.error === 'Deployment already exists for this user and agent') {
          // Already deployed - treat as success
          console.log('[HandleDeploy] Deployment already exists - redirecting to dashboard');
          router.push("/creator");
          return;
        } else {
          // Generic error
          setDeployError(errorData.message || errorData.error || "Deployment failed");
        }
        return;
      }

      // Success! Redirect to dashboard
      router.push("/creator");
    } catch (error: any) {
      setDeployError(error.message || "Failed to deploy agent");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Deploy Your Agent</h1>
          <p className="text-muted-foreground">
            Connect your Safe wallet to start trading with <strong>{agentName || "your agent"}</strong>
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          {/* Agent Info */}
          {agentVenue && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Trading Venue</p>
              <p className="font-semibold text-lg">{agentVenue}</p>
            </div>
          )}

          {/* User Wallet */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Your Wallet Address *
            </label>
            <input
              type="text"
              value={userWallet}
              onChange={(e) => setUserWallet(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The wallet address that owns this agent
            </p>
          </div>

          {/* Safe Wallet - New or Existing */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Safe Wallet Setup *
            </label>

            {/* Choice: Create New or Use Existing */}
            {!safeAddress && (
              <div className="space-y-3 mb-4">
                <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-lg">
                  <div className="flex items-start gap-3 mb-3">
                    <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-foreground">⚡ One-Click Deploy (Recommended)</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create a new Safe account with trading module enabled in a single transaction
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={showSecurityReview}
                    disabled={deployingSafe || !userWallet}
                    className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {deployingSafe ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Safe & Setting Up... (2 txns)
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Create Safe + Enable Module
                      </>
                    )}
                  </button>
                  {!userWallet && (
                    <p className="text-xs text-amber-600 mt-2 text-center">
                      Please connect your wallet first
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-card text-muted-foreground">OR</span>
                  </div>
                </div>

                <div className="p-4 bg-background border border-border rounded-lg">
                  <div className="flex items-start gap-3 mb-3">
                    <Wallet className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h3 className="font-medium text-foreground">Use Existing Safe</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Already have a Safe? Enter your Safe address below
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHasExistingSafe(true)}
                    className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/90"
                  >
                    I Have an Existing Safe
                  </button>
                </div>
              </div>
            )}

            {/* Existing Safe Input */}
            {(hasExistingSafe || safeAddress) && (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={safeAddress}
                    onChange={(e) => {
                      setSafeAddress(e.target.value);
                      setValidationStatus({ checking: false, valid: false });
                    }}
                    placeholder="0x..."
                    className="flex-1 px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={validateSafe}
                    disabled={validationStatus.checking || !safeAddress}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {validationStatus.checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Validate"
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Your Safe multisig wallet on Arbitrum One that will hold your USDC
                </p>
                {hasExistingSafe && !safeAddress && (
                  <button
                    type="button"
                    onClick={() => setHasExistingSafe(false)}
                    className="text-xs text-primary hover:underline mt-2"
                  >
                    ← Back to creation options
                  </button>
                )}
              </>
            )}

            <div className="mt-2 p-2 bg-primary/10 border border-primary/20 rounded-md">
              <p className="text-xs text-primary font-medium">
                ✨ Gasless Trading: You only need USDC - we cover all gas fees!
              </p>
            </div>
          </div>

          {/* Validation Status */}
          {validationStatus.checking && (
            <div className="p-4 bg-muted border border-border rounded-md flex items-start gap-3">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5" />
              <p className="text-sm">Validating Safe wallet...</p>
            </div>
          )}

          {validationStatus.valid && !validationError && !moduleStatus.checking && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
              <div className="flex items-start gap-3 mb-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    ✨ Safe wallet validated successfully
                  </p>
                  {validationStatus.balances && (
                    <div className="text-sm mt-2 space-y-1">
                      <p className="font-semibold">USDC: {validationStatus.balances.usdc?.formatted}</p>
                      <p className="text-xs text-green-600 dark:text-green-500">
                        Checking module and USDC approval status...
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {validationStatus.error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{validationStatus.error}</p>
            </div>
          )}

          {/* Module Status */}
          {validationStatus.valid && moduleStatus.checking && (
            <div className="p-4 bg-muted border border-border rounded-md flex items-start gap-3">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5" />
              <p className="text-sm">Checking trading module status...</p>
            </div>
          )}

          {/* Validation Errors with Automated Setup - Show immediately after validation */}
          {validationError && validationStatus.valid && (
            <div className="p-4 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    ⚙️ Safe Setup Required
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your Safe needs to be configured for trading:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 mb-4 ml-4 list-disc">
                    {validationError.type === 'MODULE_NOT_ENABLED' && (
                      <li>Enable trading module</li>
                    )}
                    <li>Approve USDC for trading</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mb-3">
                    ℹ️ Both operations will be batched in a single Safe transaction
                  </p>
                  
                  <button
                    onClick={setupExistingSafe}
                    disabled={setupInProgress}
                    className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {setupInProgress ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Setting up Safe...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Enable Module & Approve USDC
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {validationStatus.valid && moduleStatus.enabled && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    ✅ Trading module enabled!
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your Safe is ready for automated trading
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading agent details */}
          {validationStatus.valid && moduleStatus.needsEnabling && !agentVenue && (
            <div className="p-4 bg-muted border border-border rounded-md flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-sm">Loading agent details...</p>
            </div>
          )}

          {validationStatus.valid && moduleStatus.needsEnabling && agentVenue && (
            (() => {
              console.log('[Deploy Agent] Rendering setup. agentVenue:', agentVenue, 'isGMX:', agentVenue === 'GMX');
              return agentVenue === 'GMX' ? (
                // GMX: Batch Transaction Setup
                <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
                <div className="flex items-start gap-3 mb-3">
                  <Zap className="h-4 w-4 text-orange-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-700 dark:text-orange-400">
                      GMX Trading Setup Required
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      One-time setup: Enable trading module (gas sponsored)
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={enableModuleGMXStep1}
                    disabled={enablingModule}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {enablingModule ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Enable GMX Trading
                      </>
                    )}
                  </button>
                  <button
                    onClick={checkModuleStatus}
                    disabled={moduleStatus.checking}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/90 disabled:opacity-50"
                  >
                    {moduleStatus.checking ? 'Checking...' : 'Recheck Status'}
                  </button>
                </div>

                {/* GMX Instructions Panel */}
                {showInstructions && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100">📋 GMX Setup Instructions</h4>
                      <button
                        onClick={() => setShowInstructions(false)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="space-y-4 text-sm">
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">✅ Transaction data copied to clipboard!</p>
                        <p className="text-blue-700 dark:text-blue-300 mb-3">Safe Transaction Builder opened - follow these steps:</p>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-300 dark:border-orange-700">
                          <p className="font-semibold text-orange-900 dark:text-orange-100 mb-2">Enable GMX Trading Module</p>
                          
                          <div className="space-y-2">
                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1 text-xs">1. Enter Address (your Safe):</p>
                              <div className="flex gap-2">
                                <input
                                  readOnly
                                  value={safeAddress}
                                  className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs"
                                />
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(safeAddress);
                                    alert('✅ Safe address copied!');
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>

                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1 text-xs">2. Choose "Use custom data (hex encoded)"</p>
                            </div>

                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1 text-xs">3. Paste transaction data (already copied!):</p>
                              <div className="flex gap-2">
                                <input
                                  readOnly
                                  value={transactionData || 'Loading...'}
                                  className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs overflow-hidden text-ellipsis"
                                />
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(transactionData);
                                    alert('✅ Transaction data copied!');
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs whitespace-nowrap"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-orange-600 dark:text-orange-400">✅ Then click "Create Batch", "Send Batch", and "Execute"</p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-2">💡 Note: GMX V2 doesn't require separate authorization!</p>
                          </div>
                        </div>

                        {/* Final Steps */}
                        <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">Final Steps:</p>
                          <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1 ml-4">
                            <li>• Click "Create Batch"</li>
                            <li>• Click "Send Batch"</li>
                            <li>• Click "Continue" and "Sign txn"</li>
                            <li>• Go to Transactions → Click "Execute"</li>
                            <li>• Sign again in wallet (gas sponsored)</li>
                            <li>• Wait for confirmation ⏳</li>
                          </ul>
                        </div>
                      </div>

                      <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 mt-4">
                        <p className="text-green-800 dark:text-green-200 font-medium">⏳ After execution (~30 sec):</p>
                        <p className="text-green-700 dark:text-green-300 text-xs mt-1">
                          Click "Recheck Status" button above to verify setup is complete
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // SPOT: Old Manual Setup
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">
                      Trading Module Setup Required (SPOT Mode - Venue: {agentVenue || 'empty'})
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    One-time setup: Enable the trading module to allow your agent to execute trades on your behalf.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={enableModule}
                  disabled={enablingModule}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {enablingModule ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4" />
                      Enable Module
                    </>
                  )}
                </button>
                <button
                  onClick={checkModuleStatus}
                  disabled={moduleStatus.checking}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/90 disabled:opacity-50"
                >
                  {moduleStatus.checking ? 'Checking...' : 'Recheck Status'}
                </button>
                <button
                  onClick={() => {
                    console.log('[CheckModule] Force refresh clicked');
                    checkModuleStatus();
                  }}
                  disabled={moduleStatus.checking}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  Force Refresh
                </button>
              </div>

              {/* Instructions Panel */}
              {showInstructions && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">📋 Module Setup Instructions</h4>
                    <button
                      onClick={() => setShowInstructions(false)}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">✅ Transaction data copied to clipboard!</p>
                      <p className="text-blue-700 dark:text-blue-300 mb-3">Safe Transaction Builder opened - follow these simple steps:</p>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">1️⃣ Enter Address (your Safe):</p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={safeAddress}
                            className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(safeAddress);
                              alert('✅ Safe address copied!');
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                          >
                            Copy
                          </button>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">2️⃣ Choose "Use custom data (hex encoded)"</p>
                        <p className="text-blue-700 dark:text-blue-300 text-xs">(Skip the ABI option)</p>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">3️⃣ Paste transaction data (already copied!):</p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={transactionData || 'Loading...'}
                            className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs overflow-hidden text-ellipsis"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(transactionData);
                              alert('✅ Transaction data copied!');
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs whitespace-nowrap"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          💡 This includes the module address ({moduleAddress.substring(0, 10)}...) - no manual entry needed!
                        </p>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">4️⃣ Batch & Sign:</p>
                        <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1 ml-4">
                          <li>• Click "Add new txn"</li>
                          <li>• Click "Create Batch"</li>
                          <li>• Click "Send Batch"</li>
                          <li>• Click "Continue" on confirmation</li>
                          <li>• Click "Sign txn"</li>
                        </ul>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">5️⃣ Execute:</p>
                        <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1 ml-4">
                          <li>• Go back to Transactions</li>
                          <li>• Click "Execute"</li>
                          <li>• Click "Continue"</li>
                          <li>• Sign again in wallet</li>
                          <li>• Wait for confirmation ⏳</li>
                        </ul>
                      </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 mt-4">
                      <p className="text-green-800 dark:text-green-200 font-medium">⏳ After execution (~30 sec):</p>
                      <p className="text-green-700 dark:text-green-300 text-xs mt-1">Come back here and click "Recheck Status" button above</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
            })()
          )}

          {moduleStatus.error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{moduleStatus.error}</p>
            </div>
          )}

          {/* Deploy Error */}
          {deployError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{deployError}</p>
            </div>
          )}

          {/* Deploy Button */}
          <div className="pt-4">
            <button
              onClick={handleDeploy}
              disabled={
                !validationStatus.valid ||
                !moduleStatus.enabled ||
                !userWallet ||
                !safeAddress ||
                deploying
              }
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Deploy Agent
                </>
              )}
            </button>
            {validationStatus.valid && !moduleStatus.enabled && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                Please enable the trading module first
              </p>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              About Safe Wallets & Gasless Trading
            </h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• ✨ <strong>Gasless Trading:</strong> Only deposit USDC - we cover all gas fees</li>
              <li>• <strong>Non-custodial:</strong> You maintain full control of funds</li>
              <li>• <strong>Module System:</strong> One-time setup grants trading permissions</li>
              <li>• <strong>Multi-sig capable:</strong> Optional extra security</li>
              <li>• <strong>Used by $100B+</strong> in crypto assets</li>
              <li>• <strong>Restricted access:</strong> Agent can only trade, never withdraw</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/creator')}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Security Disclosure Modal */}
      <ModuleSecurityDisclosure
        moduleAddress={moduleAddress}
        isOpen={showSecurityDisclosure}
        onConfirm={deployNewSafeWithModule}
        onCancel={() => setShowSecurityDisclosure(false)}
      />
    </div>
  );
}
