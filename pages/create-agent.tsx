import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertAgentSchema, VenueEnum } from '@shared/schema';
import { db } from '../client/src/lib/db';
import { useRouter } from 'next/router';
import { Check, User, Building2, Sliders, Wallet, Eye, Rocket, Twitter, Search, Plus as PlusIcon, X, Shield, Send, Activity } from 'lucide-react';
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

  const [proofOfIntent, setProofOfIntent] = useState<{
    message: string;
    signature: string;
    timestamp: Date;
  } | null>(null);
  const [isSigningProof, setIsSigningProof] = useState(false);

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

  const [selectedResearchInstitutes, setSelectedResearchInstitutes] = useState<string[]>([]);
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
      venue: 'MULTI',
      weights: [50, 50, 50, 50, 50, 50, 50, 50],
      status: 'DRAFT',
      creatorWallet: '',
      profitReceiverAddress: '',
    },
  });

  const formData = watch();

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      setValue('creatorWallet', user.wallet.address, { shouldValidate: true, shouldDirty: true });
      setValue('profitReceiverAddress', user.wallet.address, { shouldValidate: true, shouldDirty: true });
    }
  }, [authenticated, user?.wallet?.address, setValue]);

  useEffect(() => {
    if (step === 4) loadCtAccounts();
  }, [step]);

  const loadCtAccounts = async (searchTerm?: string) => {
    const trimmedSearch = searchTerm?.trim();
    setLoadingCtAccounts(true);
    try {
      let accounts;
      if (trimmedSearch) {
        const response = await fetch(`/api/ct-accounts/search?q=${encodeURIComponent(trimmedSearch)}`);
        if (!response.ok) throw new Error('Failed to search CT accounts');
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
    if (newSelected.has(accountId)) newSelected.delete(accountId);
    else newSelected.add(accountId);
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
      const tempAgentId = `temp-${Date.now()}`;
      const proof = await createProofOfIntentWithMetaMask(tempAgentId, user.wallet.address, formData.name);
      setProofOfIntent({ message: proof.message, signature: proof.signature, timestamp: proof.timestamp });
    } catch (error: any) {
      if (error.message.includes('User rejected')) {
        setError('Signature rejected. Please try again.');
      } else {
        setError(`Failed to create proof: ${error.message}`);
      }
    } finally {
      setIsSigningProof(false);
    }
  };

  const onSubmit = async (data: WizardFormData) => {
    const isValid = await trigger();
    if (!isValid) {
      if (errors.name) setStep(1);
      else if (errors.venue) setStep(2);
      else if (errors.creatorWallet) setStep(5);
      setError('Please fix the validation errors');
      return;
    }
    if (selectedResearchInstitutes.length === 0) {
      setError('Please select at least one research institute');
      setStep(3);
      return;
    }
    if (selectedCtAccounts.size === 0) {
      setError('Please select at least one CT account');
      setStep(4);
      return;
    }
    if (!proofOfIntent) {
      setError('Please create a proof of intent');
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
      const { description, ...agentData } = data;
      agentData.creatorWallet = user?.wallet?.address || data.creatorWallet;
      if (!agentData.profitReceiverAddress) agentData.profitReceiverAddress = agentData.creatorWallet;
      if (proofOfIntent) {
        agentData.proofOfIntentMessage = proofOfIntent.message;
        agentData.proofOfIntentSignature = proofOfIntent.signature;
        agentData.proofOfIntentTimestamp = proofOfIntent.timestamp.toISOString();
      }

      const result = await db.post('agents', agentData);
      if (result && result.id) {
        const agentId = result.id;

        // Link CT accounts
        await Promise.all(Array.from(selectedCtAccounts).map(async (ctAccountId) => {
          await fetch(`/api/agents/${agentId}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ctAccountId }),
          });
        }));

        // Link research institutes
        await Promise.all(selectedResearchInstitutes.map(async (instituteId) => {
          await fetch(`/api/agents/${agentId}/research-institutes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ institute_id: instituteId }),
          });
        }));

        // Link telegram users
        await Promise.all(Array.from(selectedTelegramUsers).map(async (telegramAlphaUserId) => {
          await fetch(`/api/agents/${agentId}/telegram-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_alpha_user_id: telegramAlphaUserId }),
          });
        }));

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
        await login();
        return;
      }
      const userWallet = user.wallet.address;
      const response = await fetch('/api/ostium/deploy-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, userWallet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to deploy');
      setOstiumApprovalModal({
        deploymentId: data.deploymentId,
        agentAddress: data.agentAddress,
        userWallet: data.userWallet,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to deploy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeploy = () => {
    if (createdAgentId) {
      setShowDeployModal(false);
      if (formData.venue === 'HYPERLIQUID') {
        setHyperliquidAgentId(createdAgentId);
        setHyperliquidAgentName(formData.name);
        setHyperliquidModalOpen(true);
      } else if (formData.venue === 'OSTIUM') {
        deployOstiumAgent(createdAgentId);
      } else {
        window.location.href = `/deploy-agent/${createdAgentId}`;
      }
    }
  };

  const nextStep = async () => {
    let isValid = false;
    if (step === 1) isValid = await trigger('name');
    else if (step === 2) isValid = await trigger('venue');
    else if (step === 3) {
      if (selectedResearchInstitutes.length === 0) {
        setError('Please select at least one research institute');
        return;
      }
      isValid = true;
    } else if (step === 4) {
      if (selectedCtAccounts.size === 0) {
        setError('Please select at least one CT account');
        return;
      }
      isValid = true;
    } else if (step === 5) isValid = true;
    else if (step === 6) {
      const validWallet = await trigger('creatorWallet');
      const validProfit = await trigger('profitReceiverAddress');
      isValid = validWallet && validProfit;
    } else if (step === 7) isValid = !!proofOfIntent;

    if (isValid && step < 8) {
      setStep(step + 1);
      setError(null);
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const steps = [
    { number: 1, label: 'BASIC', icon: User },
    { number: 2, label: 'VENUE', icon: Building2 },
    { number: 3, label: 'STRATEGY', icon: Sliders },
    { number: 4, label: 'CT', icon: Twitter },
    { number: 5, label: 'TELEGRAM', icon: Send },
    { number: 6, label: 'WALLET', icon: Wallet },
    { number: 7, label: 'PROOF', icon: Shield },
    { number: 8, label: 'REVIEW', icon: Eye },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <p className="data-label mb-2">AGENT WIZARD</p>
          <h1 className="font-display text-4xl md:text-5xl mb-4">CREATE AGENT</h1>
          <p className="text-[var(--text-secondary)]">Configure your autonomous trading strategy</p>
        </div>

        {/* Progress */}
        <div className="mb-12">
          <div className="relative">
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-[var(--border)]" />
            <div
              className="absolute top-4 left-4 h-0.5 bg-[var(--accent)] transition-all duration-500"
              style={{ width: `calc(${((step - 1) / (steps.length - 1)) * 100}% - 32px)` }}
            />
            <div className="relative flex justify-between">
              {steps.map((s) => {
                const Icon = s.icon;
                const isCompleted = s.number < step;
                const isCurrent = s.number === step;
                return (
                  <div key={s.number} className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 flex items-center justify-center transition-all border ${
                        isCompleted
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--bg-deep)]'
                          : isCurrent
                          ? 'border-[var(--accent)] text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-muted)]'
                      }`}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`mt-2 text-[10px] font-bold hidden sm:block ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 border border-[var(--danger)] bg-[var(--danger)]/10">
            <p className="text-[var(--danger)] text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="border border-[var(--border)] bg-[var(--bg-surface)] p-8">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-6">BASIC INFORMATION</h2>
              <div>
                <label className="data-label block mb-2">AGENT NAME *</label>
                <input
                  type="text"
                  {...register('name')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="Alpha Momentum Trader"
                />
                {errors.name && <p className="text-[var(--danger)] text-sm mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="data-label block mb-2">DESCRIPTION (OPTIONAL)</label>
                <textarea
                  {...register('description')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="Describe your agent's strategy..."
                  rows={4}
                />
              </div>
              <button type="button" onClick={nextStep} className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">
                NEXT →
              </button>
            </div>
          )}

          {/* Step 2: Venue */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-6">TRADING VENUE</h2>
              <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🌐</span>
                  <div>
                    <h3 className="font-bold text-lg">MULTI-VENUE (RECOMMENDED)</h3>
                    <p className="text-sm text-[var(--text-secondary)]">Agent routes to best venue automatically</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-[var(--text-muted)]">
                  <p><span className="text-[var(--accent)]">✓</span> Hyperliquid Perpetuals (220+ pairs)</p>
                  <p><span className="text-[var(--accent)]">✓</span> Ostium Synthetics (41 pairs)</p>
                  <p><span className="text-[var(--accent)]">✓</span> Intelligent routing for best liquidity</p>
                </div>
              </div>
              <input type="hidden" {...register('venue')} value="MULTI" />
              <details className="group">
                <summary className="cursor-pointer p-4 bg-[var(--bg-elevated)] border border-[var(--border)]">
                  <span className="text-sm font-bold">ADVANCED: SINGLE VENUE</span>
                </summary>
                <div className="mt-4 space-y-3 p-4 bg-[var(--bg-elevated)]">
                  {['HYPERLIQUID', 'OSTIUM', 'GMX', 'SPOT'].map((venue) => (
                    <label key={venue} className={`block p-3 border cursor-pointer transition-colors ${formData.venue === venue ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--accent)]/50'}`}>
                      <input type="radio" {...register('venue')} value={venue} className="sr-only" />
                      <span className="font-bold">{venue}</span>
                    </label>
                  ))}
                </div>
              </details>
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 3: Research Institutes */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-2">RESEARCH INSTITUTES</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Choose which institutes your agent should follow for signals.</p>
              <ResearchInstituteSelector selectedIds={selectedResearchInstitutes} onChange={setSelectedResearchInstitutes} />
              {selectedResearchInstitutes.length === 0 && (
                <p className="text-sm text-[var(--accent)]">⚠️ Select at least one institute</p>
              )}
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 4: CT Accounts */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="font-display text-2xl">CT ACCOUNTS</h2>
                  <p className="text-[var(--text-secondary)] text-sm">Selected: {selectedCtAccounts.size}</p>
                </div>
                <button type="button" onClick={() => setShowAddCtAccount(!showAddCtAccount)} className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm flex items-center gap-2">
                  <PlusIcon className="h-4 w-4" />ADD
                </button>
              </div>

              {showAddCtAccount && (
                <div className="p-4 border-2 border-[var(--accent)] bg-[var(--bg-elevated)] space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">ADD NEW ACCOUNT</span>
                    <button type="button" onClick={() => setShowAddCtAccount(false)}><X className="h-4 w-4" /></button>
                  </div>
                  <input type="text" value={newCtUsername} onChange={(e) => setNewCtUsername(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)]" placeholder="@username" />
                  <input type="text" value={newCtDisplayName} onChange={(e) => setNewCtDisplayName(e.target.value)} className="w-full px-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)]" placeholder="Display Name (optional)" />
                  <button type="button" onClick={handleAddCtAccount} disabled={addingCtAccount} className="w-full py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold disabled:opacity-50">
                    {addingCtAccount ? 'ADDING...' : 'ADD ACCOUNT'}
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={ctAccountSearch}
                    onChange={(e) => { setCtAccountSearch(e.target.value); if (e.target.value === '') loadCtAccounts(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchCtAccounts(); } }}
                    className="w-full pl-10 pr-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)]"
                    placeholder="Search accounts"
                  />
                </div>
                <button type="button" onClick={handleSearchCtAccounts} className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm">SEARCH</button>
              </div>

              {loadingCtAccounts ? (
                <div className="py-12 text-center"><Activity className="h-8 w-8 mx-auto text-[var(--accent)] animate-pulse" /></div>
              ) : ctAccounts.length === 0 ? (
                <div className="text-center py-12 border border-[var(--border)]">
                  <Twitter className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
                  <p className="text-[var(--text-muted)]">{ctAccountSearchExecuted ? 'No results found' : 'No accounts yet'}</p>
                </div>
              ) : (
                <div className="h-[400px] overflow-y-auto space-y-2">
                  {ctAccounts.map((account) => (
                    <label key={account.id} className={`block p-4 border cursor-pointer transition-colors ${selectedCtAccounts.has(account.id) ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] hover:border-[var(--accent)]/50'}`}>
                      <input type="checkbox" checked={selectedCtAccounts.has(account.id)} onChange={() => toggleCtAccount(account.id)} className="sr-only" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center"><Twitter className="h-5 w-5 text-[var(--accent)]" /></div>
                          <div>
                            <p className="font-bold">@{account.xUsername}</p>
                            {account.displayName && <p className="text-sm text-[var(--text-muted)]">{account.displayName}</p>}
                          </div>
                        </div>
                        {selectedCtAccounts.has(account.id) && <Check className="h-5 w-5 text-[var(--accent)]" />}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 5: Telegram */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-2">TELEGRAM ALPHA</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Select Telegram users whose DM signals your agent should follow.</p>
              <TelegramAlphaUserSelector
                selectedIds={selectedTelegramUsers}
                onToggle={(id) => {
                  const newSelected = new Set(selectedTelegramUsers);
                  if (newSelected.has(id)) newSelected.delete(id);
                  else newSelected.add(id);
                  setSelectedTelegramUsers(newSelected);
                }}
              />
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 6: Wallet */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-6">WALLET SETUP</h2>
              {!authenticated && (
                <div className="p-4 border border-[var(--accent)] bg-[var(--accent)]/5 mb-4">
                  <p className="text-sm mb-3">Connect your wallet for the best experience.</p>
                  <button type="button" onClick={login} className="px-6 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold">CONNECT WALLET</button>
                </div>
              )}
              <div>
                <label className="data-label block mb-2">WALLET ADDRESS *</label>
                <input
                  type="text"
                  {...register('creatorWallet')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] font-mono text-sm"
                  placeholder="0x..."
                  readOnly={authenticated && !!user?.wallet?.address}
                />
              </div>
              <div>
                <label className="data-label block mb-2">PROFIT RECEIVER * <span className="text-[var(--text-muted)]">(20% of profits)</span></label>
                <input
                  type="text"
                  {...register('profitReceiverAddress')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] font-mono text-sm"
                  placeholder="0x..."
                />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 7: Proof of Intent */}
          {step === 7 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-6">PROOF OF INTENT</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Sign a message to prove your intent to create this agent.</p>

              {!proofOfIntent ? (
                <div className="space-y-4">
                  <div className="p-4 border border-[var(--border)]">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-[var(--accent)] mt-0.5" />
                      <div>
                        <p className="font-bold mb-2">WHY SIGN?</p>
                        <ul className="text-sm text-[var(--text-muted)] space-y-1">
                          <li>• Proves you are the legitimate creator</li>
                          <li>• Ensures all signals are authorized</li>
                          <li>• Required for agent activation</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={createProofOfIntent}
                    disabled={isSigningProof || !authenticated}
                    className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSigningProof ? <><Activity className="h-5 w-5 animate-pulse" />SIGNING...</> : <><Shield className="h-5 w-5" />SIGN PROOF</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 border border-[var(--accent)] bg-[var(--accent)]/5">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-[var(--accent)] mt-0.5" />
                      <div>
                        <p className="font-bold text-[var(--accent)]">PROOF CREATED</p>
                        <p className="text-sm text-[var(--text-secondary)]">Signature verified and ready</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)]">
                    <p>Timestamp: {proofOfIntent.timestamp.toLocaleString()}</p>
                    <p>Signature: {proofOfIntent.signature.slice(0, 20)}...{proofOfIntent.signature.slice(-20)}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} disabled={!proofOfIntent} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 8: Review */}
          {step === 8 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-6">REVIEW</h2>
              <div className="space-y-4">
                <div className="p-4 border border-[var(--border)]">
                  <p className="data-label mb-1">NAME</p>
                  <p className="font-bold">{formData.name}</p>
                </div>
                <div className="p-4 border border-[var(--border)]">
                  <p className="data-label mb-1">VENUE</p>
                  <p className="font-bold">{formData.venue}</p>
                </div>
                <div className="p-4 border border-[var(--border)]">
                  <p className="data-label mb-1">CT ACCOUNTS</p>
                  <p className="font-bold">{selectedCtAccounts.size} selected</p>
                </div>
                <div className="p-4 border border-[var(--border)]">
                  <p className="data-label mb-1">RESEARCH INSTITUTES</p>
                  <p className="font-bold">{selectedResearchInstitutes.length} selected</p>
                </div>
                <div className="p-4 border border-[var(--border)]">
                  <p className="data-label mb-1">WALLET</p>
                  <p className="font-mono text-sm">{formData.creatorWallet}</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} disabled={isSubmitting} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50">
                  {isSubmitting ? 'CREATING...' : 'CREATE AGENT'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Deploy Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 border border-[var(--accent)] bg-[var(--accent)] flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-[var(--bg-deep)]" />
              </div>
              <h2 className="font-display text-2xl mb-2">AGENT CREATED</h2>
              <p className="text-[var(--text-secondary)]">Deploy to start trading</p>
            </div>
            <div className="space-y-4">
              {/* <button onClick={handleDeploy} className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2">
                <Rocket className="h-5 w-5" />DEPLOY AGENT
              </button> */}
              <button onClick={() => router.push('/creator')} className="w-full py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">
                DEPLOY LATER
              </button>
            </div>
          </div>
        </div>
      )}

      {hyperliquidModalOpen && (
        <HyperliquidConnect
          agentId={hyperliquidAgentId}
          agentName={hyperliquidAgentName}
          agentVenue={formData.venue}
          onClose={() => setHyperliquidModalOpen(false)}
          onSuccess={() => { setHyperliquidModalOpen(false); router.push('/my-deployments'); }}
        />
      )}

      {ostiumModalOpen && (
        <OstiumConnect
          agentId={ostiumAgentId}
          agentName={ostiumAgentName}
          onClose={() => setOstiumModalOpen(false)}
          onSuccess={() => { setOstiumModalOpen(false); router.push('/my-deployments'); }}
        />
      )}

      {ostiumApprovalModal && (
        <OstiumApproval
          deploymentId={ostiumApprovalModal.deploymentId}
          agentAddress={ostiumApprovalModal.agentAddress}
          userWallet={ostiumApprovalModal.userWallet}
          onApprovalComplete={() => { setOstiumApprovalModal(null); router.push('/my-deployments'); }}
          onClose={() => setOstiumApprovalModal(null)}
        />
      )}
    </div>
  );
}
