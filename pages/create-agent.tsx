import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertAgentSchema, VenueEnum } from '@shared/schema';
import { db } from '../client/src/lib/db';
import { useRouter } from 'next/router';
import { Check, User, Building2, Sliders, Wallet, Eye, Rocket, Twitter, Search, Plus as PlusIcon, X, Shield, Send } from 'lucide-react';
import { Header } from '@components/Header';
import { usePrivy } from '@privy-io/react-auth';
import { createProofOfIntentWithMetaMask } from '@lib/proof-of-intent';
import { HyperliquidConnect } from '@components/HyperliquidConnect';
import { OstiumConnect } from '@components/OstiumConnect';
import { OstiumApproval } from '@components/OstiumApproval';
import { ResearchInstituteSelector } from '@components/ResearchInstituteSelector';
import { TelegramAlphaUserSelector } from '@components/TelegramAlphaUserSelector';

const wizardSchema = insertAgentSchema.extend({
  description: z.string().max(500).optional(),
});

type WizardFormData = z.infer<typeof wizardSchema>;

type CtAccount = {
  id: string;
  xUsername: string;
  displayName: string | null;
  followersCount: number | null;
  impactFactor: number;
  lastSeenAt: Date | null;
  _count?: {
    ctPosts: number;
    agentAccounts: number;
  };
};

export default function CreateAgent() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hyperliquidModalOpen, setHyperliquidModalOpen] = useState(false);
  const [hyperliquidAgentId, setHyperliquidAgentId] = useState('');
  const [hyperliquidAgentName, setHyperliquidAgentName] = useState('');
  const [ostiumModalOpen, setOstiumModalOpen] = useState(false);
  const [ostiumAgentId, setOstiumAgentId] = useState('');
  const [ostiumAgentName, setOstiumAgentName] = useState('');
  const [ostiumIsProcessing, setOstiumIsProcessing] = useState(false);

  // Proof of Intent state
  const [proofOfIntent, setProofOfIntent] = useState<{
    message: string;
    signature: string;
    timestamp: Date;
  } | null>(null);
  const [isSigningProof, setIsSigningProof] = useState(false);

  // CT Accounts state
  const [ctAccounts, setCtAccounts] = useState<CtAccount[]>([]);
  const [selectedCtAccounts, setSelectedCtAccounts] = useState<Set<string>>(new Set());
  const [loadingCtAccounts, setLoadingCtAccounts] = useState(false);
  const [ctAccountSearch, setCtAccountSearch] = useState('');
  const [ctAccountSearchExecuted, setCtAccountSearchExecuted] = useState(false);
  const [showAddCtAccount, setShowAddCtAccount] = useState(false);
  const [newCtUsername, setNewCtUsername] = useState('');
  const [newCtDisplayName, setNewCtDisplayName] = useState('');
  const [newCtFollowers, setNewCtFollowers] = useState('');
  const [addingCtAccount, setAddingCtAccount] = useState(false);

  // Research Institutes state
  const [selectedResearchInstitutes, setSelectedResearchInstitutes] = useState<string[]>([]);

  // Telegram Alpha Users state
  const [selectedTelegramUsers, setSelectedTelegramUsers] = useState<Set<string>>(new Set());

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      venue: 'MULTI', // Vprime: Multi-venue routing (Agent Where)
      weights: [50, 50, 50, 50, 50, 50, 50, 50], // Legacy - not used anymore
      status: 'DRAFT',
      creatorWallet: '',
      profitReceiverAddress: '',
    },
  });

  const formData = watch();

  // Auto-populate creator wallet and profit receiver when user authenticates
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      setValue('creatorWallet', user.wallet.address, {
        shouldValidate: true,
        shouldDirty: true
      });
      // Default profit receiver to creator wallet (can be changed)
      setValue('profitReceiverAddress', user.wallet.address, {
        shouldValidate: true,
        shouldDirty: true
      });
    }
  }, [authenticated, user?.wallet?.address, setValue]);

  // Load CT accounts when reaching that step
  useEffect(() => {
    if (step === 4) {
      loadCtAccounts();
    }
  }, [step]);

  const loadCtAccounts = async (searchTerm?: string) => {
    const trimmedSearch = searchTerm?.trim();
    setLoadingCtAccounts(true);
    try {
      let accounts;

      if (trimmedSearch) {
        const response = await fetch(`/api/ct-accounts/search?q=${encodeURIComponent(trimmedSearch)}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to search CT accounts');
        }
        accounts = await response.json();
      } else {
        accounts = await db.get('ct_accounts');
      }

      setCtAccounts(accounts || []);
      setCtAccountSearchExecuted(!!trimmedSearch);
    } catch (err: any) {
      console.error('Failed to load CT accounts:', err);
      setError(trimmedSearch ? 'Failed to search CT accounts' : 'Failed to load CT accounts');
    } finally {
      setLoadingCtAccounts(false);
    }
  };

  const handleSearchCtAccounts = async () => {
    const trimmedSearch = ctAccountSearch.trim();
    await loadCtAccounts(trimmedSearch || undefined);
  };

  const handleAddCtAccount = async () => {
    if (!newCtUsername.trim()) {
      setError('Username is required');
      return;
    }

    setAddingCtAccount(true);
    setError(null);

    try {
      const newAccount = await db.post('ct_accounts', {
        xUsername: newCtUsername.trim().replace('@', ''),
        displayName: newCtDisplayName.trim() || undefined,
        followersCount: newCtFollowers ? parseInt(newCtFollowers) : undefined,
      });

      if (newAccount && newAccount.id) {
        setCtAccounts([newAccount, ...ctAccounts]);
        setSelectedCtAccounts(new Set([...selectedCtAccounts, newAccount.id]));
        setShowAddCtAccount(false);
        setNewCtUsername('');
        setNewCtDisplayName('');
        setNewCtFollowers('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add CT account');
    } finally {
      setAddingCtAccount(false);
    }
  };

  const toggleCtAccount = (accountId: string) => {
    const newSelected = new Set(selectedCtAccounts);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedCtAccounts(newSelected);
  };

  const createProofOfIntent = async () => {
    if (!authenticated || !user?.wallet?.address) {
      setError('Please connect your wallet first');
      return;
    }

    if (!formData.name) {
      setError('Please enter an agent name first');
      return;
    }

    setIsSigningProof(true);
    setError(null);

    try {
      // Generate a temporary agent ID for the proof message
      const tempAgentId = `temp-${Date.now()}`;

      const proof = await createProofOfIntentWithMetaMask(
        tempAgentId,
        user.wallet.address,
        formData.name
      );

      setProofOfIntent({
        message: proof.message,
        signature: proof.signature,
        timestamp: proof.timestamp
      });

      console.log('✅ Proof of intent created successfully');
    } catch (error: any) {
      console.error('❌ Failed to create proof of intent:', error);

      // Provide more specific error messages
      if (error.message.includes('User rejected')) {
        setError('Signature request was rejected. Please try again and approve the signature in MetaMask.');
      } else if (error.message.includes('already pending')) {
        setError('A signature request is already pending. Please check MetaMask and complete or reject the pending request.');
      } else if (error.message.includes('not installed')) {
        setError('MetaMask is not installed. Please install MetaMask to continue.');
      } else if (error.message.includes('No accounts found')) {
        setError('No wallet accounts found. Please connect your wallet in MetaMask.');
      } else if (error.message.includes('does not match')) {
        setError('Connected wallet does not match the expected wallet. Please ensure you are using the correct wallet.');
      } else {
        setError(`Failed to create proof of intent: ${error.message}`);
      }
    } finally {
      setIsSigningProof(false);
    }
  };

  const onSubmit = async (data: WizardFormData) => {
    // Validate all fields before submit
    const isValid = await trigger();
    if (!isValid) {
      // Find first step with errors
      if (errors.name) setStep(1);
      else if (errors.venue) setStep(2);
      else if (errors.creatorWallet) setStep(5);
      setError('Please fix the validation errors before submitting');
      return;
    }

    // Validate research institutes selection
    if (selectedResearchInstitutes.length === 0) {
      setError('Please select at least one research institute');
      setStep(3);
      return;
    }

    // Validate CT accounts selection
    if (selectedCtAccounts.size === 0) {
      setError('Please select at least one CT account');
      setStep(4);
      return;
    }

    // Validate proof of intent
    if (!proofOfIntent) {
      setError('Please create a proof of intent by signing with MetaMask');
      setStep(7);
      return;
    }

    if (!authenticated) {
      setError('Please connect your wallet first');
      login();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // Remove description as it's not in the schema
      const { description, ...agentData } = data;

      // Set creator wallet from connected user
      agentData.creatorWallet = user?.wallet?.address || data.creatorWallet;

      // Ensure profitReceiverAddress is set (default to creatorWallet if not provided)
      if (!agentData.profitReceiverAddress) {
        agentData.profitReceiverAddress = agentData.creatorWallet;
      }

      // Add proof of intent data
      if (proofOfIntent) {
        agentData.proofOfIntentMessage = proofOfIntent.message;
        agentData.proofOfIntentSignature = proofOfIntent.signature;
        agentData.proofOfIntentTimestamp = proofOfIntent.timestamp.toISOString();
      }

      console.log('🚀 CREATING AGENT - Step 1: Posting agent data to DB...');
      const result = await db.post('agents', agentData);
      console.log('✅ AGENT CREATED:', result);

      if (result && result.id) {
        const agentId = result.id;
        console.log('📝 Agent ID:', agentId);
        console.log('📊 Selected CT Accounts:', selectedCtAccounts.size, 'accounts');

        // Link selected CT accounts to the agent
        console.log('🔗 LINKING CT ACCOUNTS - Starting...', Array.from(selectedCtAccounts));

        const linkPromises = Array.from(selectedCtAccounts).map(async (ctAccountId) => {
          console.log('  Linking CT account:', ctAccountId);
          const response = await fetch(`/api/agents/${agentId}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ctAccountId }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Failed to link account' }));
            console.error('  Failed to link account:', ctAccountId, error);
            throw new Error(error.error || `Failed to link account ${ctAccountId}`);
          }

          const result = await response.json();
          console.log('  Successfully linked:', result);
          return result;
        });

        try {
          await Promise.all(linkPromises);
          console.log('✅ All CT accounts linked successfully');
        } catch (linkError: any) {
          console.error('❌ Failed to link CT accounts:', linkError);
          setError(`Agent created but some CT accounts failed to link: ${linkError.message}`);
          // Don't return here - still show the deploy modal
        }

        // Link selected research institutes to the agent
        console.log('🔗 LINKING RESEARCH INSTITUTES - Starting...', selectedResearchInstitutes);

        if (selectedResearchInstitutes.length > 0) {
          const instituteLinkPromises = selectedResearchInstitutes.map(async (instituteId) => {
            console.log('  Linking research institute:', instituteId);
            const response = await fetch(`/api/agents/${agentId}/research-institutes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ institute_id: instituteId }),
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({ error: 'Failed to link institute' }));
              console.error('  Failed to link institute:', instituteId, error);
              throw new Error(error.error || `Failed to link institute ${instituteId}`);
            }

            const result = await response.json();
            console.log('  Successfully linked:', result);
            return result;
          });

          try {
            await Promise.all(instituteLinkPromises);
            console.log('✅ All research institutes linked successfully');
          } catch (instituteLinkError: any) {
            console.error('❌ Failed to link research institutes:', instituteLinkError);
            setError(`Agent created but some research institutes failed to link: ${instituteLinkError.message}`);
            // Don't return here - still show the deploy modal
          }
        }

        // Link selected Telegram alpha users to the agent
        console.log('🔗 LINKING TELEGRAM ALPHA USERS - Starting...', Array.from(selectedTelegramUsers));

        if (selectedTelegramUsers.size > 0) {
          const telegramLinkPromises = Array.from(selectedTelegramUsers).map(async (telegramAlphaUserId) => {
            console.log('  Linking telegram alpha user:', telegramAlphaUserId);
            const response = await fetch(`/api/agents/${agentId}/telegram-users`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ telegram_alpha_user_id: telegramAlphaUserId }),
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({ error: 'Failed to link telegram user' }));
              console.error('  Failed to link telegram user:', telegramAlphaUserId, error);
              throw new Error(error.error || `Failed to link telegram user ${telegramAlphaUserId}`);
            }

            const result = await response.json();
            console.log('  Successfully linked:', result);
            return result;
          });

          try {
            await Promise.all(telegramLinkPromises);
            console.log('✅ All telegram alpha users linked successfully');
          } catch (telegramLinkError: any) {
            console.error('❌ Failed to link telegram alpha users:', telegramLinkError);
            setError(`Agent created but some telegram users failed to link: ${telegramLinkError.message}`);
            // Don't return here - still show the deploy modal
          }
        }

        setCreatedAgentId(agentId);
        setShowDeployModal(true);
      } else {
        router.push('/creator');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [ostiumApprovalModal, setOstiumApprovalModal] = useState<{
    deploymentId: string;
    agentAddress: string;
    userWallet: string;
  } | null>(null);

  const deployOstiumAgent = async (agentId: string) => {
    try {
      setIsSubmitting(true);
      setError(null);

      if (!authenticated || !user?.wallet?.address) {
        alert('Please connect your wallet first');
        await login();
        return;
      }

      const userWallet = user.wallet.address;
      console.log('[Ostium Deploy] Starting deployment for agent:', agentId, 'user wallet:', userWallet);

      const response = await fetch('/api/ostium/deploy-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to deploy Ostium agent');
      }

      console.log('[Ostium Deploy] Agent assigned:', data);

      // Open approval modal for user to sign transaction
      setOstiumApprovalModal({
        deploymentId: data.deploymentId,
        agentAddress: data.agentAddress,
        userWallet: data.userWallet,
      });

    } catch (err: any) {
      console.error('[Ostium Deploy] Error:', err);
      setError(err.message || 'Failed to deploy Ostium agent');
      alert(`Failed to deploy: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeploy = () => {
    console.log('Deploy clicked! Agent ID:', createdAgentId, 'Venue:', formData.venue);
    if (createdAgentId) {
      // Close modal first
      setShowDeployModal(false);

      // For Hyperliquid, open the setup modal
      if (formData.venue === 'HYPERLIQUID') {
        console.log('Opening Hyperliquid setup modal for agent:', createdAgentId);
        setHyperliquidAgentId(createdAgentId);
        setHyperliquidAgentName(formData.name);
        setHyperliquidModalOpen(true);
      } else if (formData.venue === 'OSTIUM') {
        // For Ostium, deploy directly
        console.log('Deploying Ostium agent directly:', createdAgentId);
        deployOstiumAgent(createdAgentId);
      } else {
        // For other venues (SPOT, GMX), use standard Safe wallet deployment
        console.log('Navigating to standard deployment:', `/deploy-agent/${createdAgentId}`);
        window.location.href = `/deploy-agent/${createdAgentId}`;
      }
    } else {
      console.error('No agent ID available!');
      alert('Error: Agent ID not found. Please try creating the agent again.');
    }
  };

  const nextStep = async () => {
    let isValid = false;

    // Validate current step before advancing
    if (step === 1) {
      isValid = await trigger('name');
    } else if (step === 2) {
      isValid = await trigger('venue');
    } else if (step === 3) {
      // Validate research institute selection
      if (selectedResearchInstitutes.length === 0) {
        setError('Please select at least one research institute');
        return;
      }
      isValid = true;
    } else if (step === 4) {
      // Validate CT account selection
      if (selectedCtAccounts.size === 0) {
        setError('Please select at least one CT account');
        return;
      }
      isValid = true;
    } else if (step === 5) {
      // Telegram alpha users (optional, can skip)
      isValid = true;
    } else if (step === 6) {
      const validWallet = await trigger('creatorWallet');
      const validProfit = await trigger('profitReceiverAddress');
      isValid = validWallet && validProfit;
    } else if (step === 7) {
      // Proof of intent step - check if proof exists
      isValid = !!proofOfIntent;
    }

    if (isValid && step < 8) {
      setStep(step + 1);
      setError(null);
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const steps = [
    { number: 1, label: 'Basic Info', icon: User },
    { number: 2, label: 'Venue', icon: Building2 },
    { number: 3, label: 'Strategy', icon: Sliders },
    { number: 4, label: 'CT Accounts', icon: Twitter },
    { number: 5, label: 'Telegram Alpha', icon: Send },
    { number: 6, label: 'Wallet', icon: Wallet },
    { number: 7, label: 'Proof of Intent', icon: Shield },
    { number: 8, label: 'Review', icon: Eye },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent pb-3" data-testid="text-title">
              Create Your Trading Agent
            </h1>
            <p className="text-muted-foreground">Configure your autonomous trading strategy in 5 easy steps</p>
          </div>

          {/* Enhanced Progress Indicator */}
          <div className="mb-12">
            <div className="relative">
              {/* Background Progress Line */}
              <div className="absolute top-6 left-6 right-6 h-1.5 bg-muted/50 rounded-full" style={{ zIndex: 0 }} />

              {/* Active Progress Line - extends to center of current step circle */}
              <div
                className="absolute top-6 left-6 h-1.5 bg-gradient-to-r from-primary via-primary/90 to-primary rounded-full transition-all duration-700 ease-out shadow-md shadow-primary/30"
                style={{
                  width: (step === 1)
                    ? '0px'
                    : step === 8 ? `calc(${((step - 1) / (steps.length - 1)) * 100}% - 24px)` : `calc(${((step - 1) / (steps.length - 1)) * 100}% + 24px)`,

                  zIndex: 1
                }}
              />

              {/* Step Circles */}
              <div className="relative flex justify-between" style={{ zIndex: 2 }}>
                {steps.map((s) => {
                  const Icon = s.icon;
                  const isCompleted = s.number < step;
                  const isCurrent = s.number === step;

                  return (
                    <div key={s.number} className="flex flex-col items-center">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${isCompleted
                          ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-lg shadow-primary/30'
                          : isCurrent
                            ? 'bg-primary text-primary-foreground border-primary ring-4 ring-primary/20 scale-110 shadow-lg shadow-primary/30'
                            : 'bg-background text-muted-foreground border-muted hover:border-muted-foreground/50'
                          }`}
                        data-testid={`progress-step-${s.number}`}
                      >
                        {isCompleted ? (
                          <Check className="h-6 w-6" />
                        ) : (
                          <Icon className={`h-5 w-5 ${isCurrent ? 'animate-pulse' : ''}`} />
                        )}
                      </div>
                      <span
                        className={`mt-2 text-xs font-medium transition-all duration-300 hidden sm:block ${isCurrent
                          ? 'text-foreground font-semibold scale-105'
                          : isCompleted
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                          }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Global Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-destructive text-sm" data-testid="text-error">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-lg p-8">
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Basic Information
                </h2>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Agent Name *
                  </label>
                  <input
                    type="text"
                    {...register('name')}
                    className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Alpha Momentum Trader"
                    data-testid="input-name"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    {...register('description')}
                    className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Describe your agent's strategy and goals..."
                    rows={4}
                    data-testid="input-description"
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive mt-1">{errors.description.message}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={nextStep}
                  className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="button-next"
                >
                  Next
                </button>
              </div>
            )}

            {/* Step 2: Venue Selection - Now MULTI by default (Vprime) */}
            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Trading Venue
                </h2>

                {/* Default Venue Info - MULTI venue (Agent Where) */}
                <div className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/30 rounded-lg">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🌐</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">Multi-Venue Trading (Recommended)</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Agent automatically routes to the best venue using Agent Where™
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span className="text-muted-foreground">Hyperliquid Perpetuals (220+ pairs)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span className="text-muted-foreground">Ostium Synthetics (41 pairs)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span className="text-muted-foreground">Intelligent routing for best liquidity & fees</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-primary">✓</span>
                      <span className="text-muted-foreground">Total 261 trading pairs</span>
                    </div>
                  </div>
                </div>

                {/* Hidden input for default venue - MULTI for Agent Where */}
                <input type="hidden" {...register('venue')} value="MULTI" />

                {/* Advanced: Single Venue Option (Collapsed by default) */}
                <details className="group">
                  <summary className="cursor-pointer list-none p-4 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Advanced: Single Venue Only</span>
                      <span className="text-muted-foreground text-xs group-open:rotate-90 transition-transform">▶</span>
                    </div>
                  </summary>
                  <div className="mt-4 space-y-3 p-4 bg-secondary/20 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-3">
                      Choose a specific venue if you want to limit trading to one platform:
                    </p>
                    {['HYPERLIQUID', 'OSTIUM', 'GMX', 'SPOT'].map((venue) => (
                      <label
                        key={venue}
                        className={`block p-3 border rounded-lg cursor-pointer transition-colors ${formData.venue === venue
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                          }`}
                      >
                        <input
                          type="radio"
                          {...register('venue')}
                          value={venue}
                          className="sr-only"
                        />
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">{venue}</h3>
                            <p className="text-xs text-muted-foreground">
                              {venue === 'HYPERLIQUID' && '220 perpetual pairs'}
                              {venue === 'OSTIUM' && '41 synthetic pairs'}
                              {venue === 'GMX' && 'GMX perpetuals'}
                              {venue === 'SPOT' && 'DEX spot trading'}
                            </p>
                          </div>
                          {formData.venue === venue && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <span className="text-primary-foreground text-xs">✓</span>
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </details>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                    data-testid="button-back"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                    data-testid="button-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Research Institutes */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Select Research Institutes
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Choose which research institutes your agent should follow. The agent will automatically execute their trading signals with a fixed 5% position size per trade.
                </p>

                <ResearchInstituteSelector
                  selectedIds={selectedResearchInstitutes}
                  onChange={setSelectedResearchInstitutes}
                />

                {selectedResearchInstitutes.length === 0 && (
                  <p className="text-sm text-yellow-600 mt-2">
                    ⚠️ Please select at least one research institute to continue.
                  </p>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                    data-testid="button-back"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                    data-testid="button-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: CT Accounts Selection */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      Select Crypto Twitter Accounts
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose influencers to follow for trading signals. Selected: {selectedCtAccounts.size}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCtAccount(!showAddCtAccount)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Account
                  </button>
                </div>

                {/* Add CT Account Form */}
                {showAddCtAccount && (
                  <div className="p-4 bg-background border-2 border-primary rounded-lg space-y-3">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium text-foreground">Add New CT Account</h3>
                      <button
                        type="button"
                        onClick={() => setShowAddCtAccount(false)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Twitter Username *
                      </label>
                      <input
                        type="text"
                        value={newCtUsername}
                        onChange={(e) => setNewCtUsername(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="@elonmusk or elonmusk"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Display Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={newCtDisplayName}
                        onChange={(e) => setNewCtDisplayName(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Elon Musk"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Followers Count (Optional)
                      </label>
                      <input
                        type="number"
                        value={newCtFollowers}
                        onChange={(e) => setNewCtFollowers(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="1000000"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCtAccount}
                      disabled={addingCtAccount || !newCtUsername.trim()}
                      className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingCtAccount ? 'Adding...' : 'Add Account'}
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Search Accounts
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={ctAccountSearch}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setCtAccountSearch(nextValue);
                          if (nextValue.trim() === '') {
                            loadCtAccounts();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchCtAccounts();
                          }
                        }}
                        className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Search by username or display name"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchCtAccounts}
                      disabled={loadingCtAccounts || ctAccountSearch.trim() === ''}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Search className="h-4 w-4" />
                      {loadingCtAccounts ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Clear the input to reload all accounts.
                  </p>
                </div>

                {/* CT Accounts List */}
                {loadingCtAccounts ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : ctAccounts.length === 0 ? (
                  <div className="text-center py-12 bg-background border border-border rounded-lg">
                    <Twitter className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {ctAccountSearchExecuted
                        ? `No CT accounts found for "${ctAccountSearch.trim() || 'your search'}".`
                        : 'No CT accounts yet. Add your first account above!'}
                    </p>
                    {ctAccountSearchExecuted && (
                      <button
                        type="button"
                        onClick={() => {
                          setCtAccountSearch('');
                          loadCtAccounts();
                        }}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-border rounded-md text-sm text-foreground hover:bg-muted"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative h-[500px]">
                    <div className="absolute inset-0 overflow-y-auto pr-2 space-y-3">
                      {ctAccounts.map((account) => (
                        <label
                          key={account.id}
                          className={`block p-4 border-2 rounded-lg cursor-pointer transition-colors ${selectedCtAccounts.has(account.id)
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCtAccounts.has(account.id)}
                            onChange={() => toggleCtAccount(account.id)}
                            className="sr-only"
                          />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                <Twitter className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-foreground">
                                  @{account.xUsername}
                                </h3>
                                {account.displayName && (
                                  <p className="text-sm text-muted-foreground">
                                    {account.displayName}
                                  </p>
                                )}
                                <div className="flex gap-3 mt-1">
                                  {account.followersCount && (
                                    <span className="text-xs text-muted-foreground">
                                      {account.followersCount.toLocaleString()} followers
                                    </span>
                                  )}
                                  <span className="text-xs text-primary font-medium">
                                    Impact: {(account.impactFactor || 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {selectedCtAccounts.has(account.id) && (
                              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                <Check className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                    data-testid="button-back"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                    data-testid="button-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Telegram Alpha Users */}
            {step === 5 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Select Telegram Alpha Sources
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Choose Telegram users whose DM signals your agent should follow. These are individual users who share alpha directly to the bot.
                </p>

                <TelegramAlphaUserSelector
                  selectedIds={selectedTelegramUsers}
                  onToggle={(id) => {
                    const newSelected = new Set(selectedTelegramUsers);
                    if (newSelected.has(id)) {
                      newSelected.delete(id);
                    } else {
                      newSelected.add(id);
                    }
                    setSelectedTelegramUsers(newSelected);
                  }}
                />

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                    data-testid="button-back"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                    data-testid="button-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 6: Creator Wallet */}
            {step === 6 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Connect Your Wallet
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  {authenticated
                    ? 'Your connected wallet will maintain custody of all funds.'
                    : 'Connect your wallet or enter a wallet address manually. This wallet will maintain custody of all funds.'}
                </p>

                {!authenticated && (
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-md mb-4">
                    <p className="text-sm text-foreground mb-2">
                      For the best experience, connect your wallet using the button in the header.
                    </p>
                    <button
                      type="button"
                      onClick={login}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover-elevate active-elevate-2"
                      data-testid="button-connect-wallet-step"
                    >
                      <Wallet className="h-4 w-4" />
                      Connect Wallet
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Wallet Address *
                  </label>
                  <input
                    type="text"
                    {...register('creatorWallet')}
                    className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="0x..."
                    readOnly={authenticated && !!user?.wallet?.address}
                    data-testid="input-wallet"
                  />
                  {authenticated && user?.wallet?.address && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Using your connected wallet address
                    </p>
                  )}
                  {errors.creatorWallet && (
                    <p className="text-sm text-destructive mt-1">{errors.creatorWallet.message}</p>
                  )}
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Profit Receiver Address *
                    <span className="text-xs text-muted-foreground ml-2">(Receives 20% of profits)</span>
                  </label>
                  <input
                    type="text"
                    {...register('profitReceiverAddress')}
                    className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="0x... (defaults to your wallet)"
                    data-testid="input-profit-receiver"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    💰 This address will receive 20% of trading profits. By default, it's your wallet address. Change it if you want profits sent elsewhere.
                  </p>
                  {errors.profitReceiverAddress && (
                    <p className="text-sm text-destructive mt-1">{errors.profitReceiverAddress.message}</p>
                  )}
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                    data-testid="button-back"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                    data-testid="button-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 7: Proof of Intent */}
            {step === 7 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Proof of Intent
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Sign a message with MetaMask to prove your intent to create and operate this trading agent.
                  This signature will be used to authenticate all signals generated by your agent.
                </p>

                {!authenticated && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-md mb-4">
                    <p className="text-sm text-amber-800">
                      <strong>Important:</strong> You must be connected to MetaMask to create a proof of intent.
                      Please connect your wallet using the button in the header above.
                    </p>
                  </div>
                )}

                {!proofOfIntent ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-md">
                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <h3 className="font-medium text-foreground mb-2">Why do I need to sign?</h3>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Proves you are the legitimate creator of this agent</li>
                            <li>• Ensures all signals are authorized by you</li>
                            <li>• Prevents unauthorized signal generation</li>
                            <li>• Required for agent activation and signal processing</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={createProofOfIntent}
                      disabled={isSigningProof || !authenticated}
                      className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSigningProof ? (
                        <>
                          <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          Signing with MetaMask...
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4" />
                          Sign Proof of Intent
                        </>
                      )}
                    </button>

                    {!authenticated && (
                      <p className="text-sm text-muted-foreground text-center">
                        Please connect your wallet first to create a proof of intent.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <h3 className="font-medium text-green-800 mb-2">Proof of Intent Created</h3>
                          <p className="text-sm text-green-700">
                            Your proof of intent has been successfully created and will be stored with your agent.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-background border border-border rounded-md">
                      <h4 className="text-sm font-medium text-foreground mb-2">Signature Details</h4>
                      <div className="space-y-1 text-xs text-muted-foreground font-mono">
                        <div>Timestamp: {proofOfIntent.timestamp.toLocaleString()}</div>
                        <div>Signature: {proofOfIntent.signature.slice(0, 20)}...{proofOfIntent.signature.slice(-20)}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setProofOfIntent(null)}
                      className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/90 transition-colors"
                    >
                      Create New Proof
                    </button>
                  </div>
                )}

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!proofOfIntent}
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 8: Review & Submit */}
            {step === 8 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                  Review Your Agent
                </h2>

                <div className="space-y-4">
                  <div className="p-4 bg-background border border-border rounded-md">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Name</h3>
                    <p className="text-foreground" data-testid="text-review-name">{formData.name}</p>
                  </div>

                  {formData.description && (
                    <div className="p-4 bg-background border border-border rounded-md">
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                      <p className="text-foreground">{formData.description}</p>
                    </div>
                  )}

                  <div className="p-4 bg-background border border-border rounded-md">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Venue</h3>
                    <p className="text-foreground" data-testid="text-review-venue">{formData.venue}</p>
                  </div>

                  <div className="p-4 bg-background border border-border rounded-md">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">CT Accounts</h3>
                    <div className="space-y-2 mt-2">
                      {Array.from(selectedCtAccounts).map(accountId => {
                        const account = ctAccounts.find(a => a.id === accountId);
                        return account ? (
                          <div key={accountId} className="flex items-center gap-2 text-sm">
                            <Twitter className="h-4 w-4 text-primary" />
                            <span className="text-foreground">@{account.xUsername}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="p-4 bg-background border border-border rounded-md">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Wallet Address</h3>
                    <p className="text-foreground font-mono text-sm" data-testid="text-review-wallet">
                      {formData.creatorWallet}
                    </p>
                  </div>

                  <div className="p-4 bg-background border border-border rounded-md">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Research Institutes</h3>
                    <div className="space-y-2 mt-2">
                      {selectedResearchInstitutes.length > 0 ? (
                        selectedResearchInstitutes.map(instituteId => (
                          <div key={instituteId} className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="text-foreground">Research Institute {instituteId.substring(0, 8)}...</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No institutes selected</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Fixed 5% position size per trade from institute signals
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                    data-testid="button-back"
                    disabled={isSubmitting}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    data-testid="button-submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Agent'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Deploy Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Agent Created!</h2>
              <p className="text-muted-foreground">
                Your trading agent has been created successfully. Now deploy it to start trading.
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleDeploy}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover-elevate active-elevate-2 transition-all"
                data-testid="button-deploy-agent"
              >
                <Rocket className="h-5 w-5" />
                {formData.venue === 'HYPERLIQUID'
                  ? 'Setup Hyperliquid Agent'
                  : formData.venue === 'OSTIUM'
                    ? 'Setup Ostium Agent'
                    : 'Deploy Agent & Connect Safe Wallet'}
              </button>

              <button
                onClick={() => router.push('/creator')}
                className="w-full px-6 py-3 border border-border rounded-md font-medium text-foreground hover-elevate active-elevate-2 transition-all"
                data-testid="button-skip-deploy"
              >
                Deploy Later
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Deploying your agent will connect it to a Safe wallet for secure, non-custodial trading.
            </p>
          </div>
        </div>
      )}

      {/* Hyperliquid Setup Modal */}
      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={hyperliquidAgentId}
          agentName={hyperliquidAgentName}
          agentVenue={formData.venue}
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => {
            console.log('Hyperliquid setup complete!');
            setHyperliquidModalOpen(false);
            router.push('/my-deployments');
          }}
        />
      )}

      {/* Ostium Setup Modal */}
      {ostiumModalOpen && (
        <OstiumConnect
          agentId={ostiumAgentId}
          agentName={ostiumAgentName}
          onClose={() => setOstiumModalOpen(false)}
          onSuccess={() => {
            console.log('Ostium setup complete!');
            setOstiumModalOpen(false);
            router.push('/my-deployments');
          }}
        />
      )}

      {/* Ostium Approval Modal - User signs with wallet */}
      {ostiumApprovalModal && (
        <OstiumApproval
          deploymentId={ostiumApprovalModal.deploymentId}
          agentAddress={ostiumApprovalModal.agentAddress}
          userWallet={ostiumApprovalModal.userWallet}
          onApprovalComplete={() => {
            console.log('Ostium agent approved!');
            setOstiumApprovalModal(null);
            router.push('/my-deployments');
          }}
          onClose={() => setOstiumApprovalModal(null)}
        />
      )}
    </div>
  );
}