"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertAgentSchema, VenueEnum, InsertAgent } from '@shared/schema';
import { db } from '../client/src/lib/db';
import { useRouter } from 'next/router';
import { Check, User, Building2, Sliders, Wallet, Eye, Rocket, Twitter, Search, Plus as PlusIcon, X, Shield, Send, Activity, TrendingUp } from 'lucide-react';
import { Header } from '@components/Header';
import { usePrivy } from '@privy-io/react-auth';
import { createProofOfIntentWithMetaMask } from '@lib/proof-of-intent';
import { HyperliquidConnect } from '@components/HyperliquidConnect';
import { OstiumConnect } from '@components/OstiumConnect';
import { OstiumApproval } from '@components/OstiumApproval';
import { ResearchInstituteSelector } from '@components/ResearchInstituteSelector';
import { TelegramAlphaUserSelector } from '@components/TelegramAlphaUserSelector';
import { CtAccountSelector } from '@components/CtAccountSelector';
import { TopTradersSelector } from '@components/TopTradersSelector';
import { FaXTwitter } from 'react-icons/fa6';
import dynamic from 'next/dynamic';
import { STATUS } from 'react-joyride';
import type { CallBackProps, Step as JoyrideStep } from 'react-joyride';

const wizardSchema = insertAgentSchema.extend({
  description: z.string().max(500).optional(),
});

type WizardFormData = z.infer<typeof wizardSchema>;

export default function CopyAgent() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();
  const [step, setStep] = useState(1);
  const [runJoyride, setRunJoyride] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Track which wizard steps have completed the tour (per-step)
  const [completedTourSteps, setCompletedTourSteps] = useState<number[]>([]);
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

  const [selectedCtAccounts, setSelectedCtAccounts] = useState<Set<string>>(new Set());
  const [selectedResearchInstitutes, setSelectedResearchInstitutes] = useState<string[]>([]);
  const [selectedTelegramUsers, setSelectedTelegramUsers] = useState<Set<string>>(new Set());
  const [selectedTopTraders, setSelectedTopTraders] = useState<string[]>([]);

  const Joyride = dynamic(() => import('react-joyride'), { ssr: false });

  // Detailed data for review step
  const [reviewData, setReviewData] = useState<{
    researchInstitutes: Array<{ id: string; name: string; description: string | null; x_handle: string | null }>;
    ctAccounts: Array<{ id: string; xUsername: string; displayName: string | null; followersCount: number | null }>;
    telegramUsers: Array<{ id: string; telegram_username: string | null; first_name: string | null; last_name: string | null; credit_price?: string }>;
    topTraders: Array<{ id: string; walletAddress: string; impactFactor: number; totalPnl: string; totalTrades: number }>;
  }>({
    researchInstitutes: [],
    ctAccounts: [],
    telegramUsers: [],
    topTraders: [],
  });

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

  // Joyride: ensure client-side only & load per-step completion flags
  useEffect(() => {
    setIsMounted(true);
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('createAgentTourCompletedSteps');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const validSteps = parsed.filter(
              (n: unknown) => typeof n === 'number' && n >= 1 && n <= 9
            ) as number[];
            setCompletedTourSteps(validSteps);
          }
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Joyride: retrigger on step change if this step's tour hasn't been completed
  useEffect(() => {
    if (!isMounted) return;
    if (completedTourSteps.includes(step)) return;

    // Reset and restart joyride with a longer delay to prevent flickering
    setRunJoyride(false);
    const timer = setTimeout(() => {
      setRunJoyride(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [step, isMounted, completedTourSteps]);

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
      else if (errors.creatorWallet) setStep(7);
      setError('Please fix the validation errors');
      return;
    }
    if (selectedResearchInstitutes.length === 0) {
      setError('Please select at least one research institute');
      setStep(4);
      return;
    }
    if (selectedCtAccounts.size === 0) {
      setError('Please select at least one CT account');
      setStep(5);
      return;
    }
    if (!proofOfIntent) {
      setError('Please create a proof of intent');
      setStep(8);
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
      const creatorWallet = user?.wallet?.address || data.creatorWallet;

      const payload = {
        agentData: {
          ...agentData,
          creatorWallet,
          profitReceiverAddress: agentData.profitReceiverAddress || creatorWallet,
          proofOfIntentMessage: proofOfIntent?.message,
          proofOfIntentSignature: proofOfIntent?.signature,
          proofOfIntentTimestamp: proofOfIntent?.timestamp.toISOString(),
        },
        linkingData: {
          ctAccountIds: Array.from(selectedCtAccounts),
          researchInstituteIds: selectedResearchInstitutes,
          telegramAlphaUserIds: Array.from(selectedTelegramUsers),
          topTraderIds: selectedTopTraders,
        }
      };

      const response = await fetch('/api/agents/create-with-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to create agent');
      }

      if (result.success && result.agent?.id) {
        setCreatedAgentId(result.agent.id);
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
      // Top traders is optional, so always valid
      isValid = true;
    } else if (step === 4) {
      if (selectedResearchInstitutes.length === 0) {
        setError('Please select at least one research institute');
        return;
      }
      isValid = true;
    } else if (step === 5) {
      if (selectedCtAccounts.size === 0) {
        setError('Please select at least one CT account');
        return;
      }
      isValid = true;
    } else if (step === 6) isValid = true;
    else if (step === 7) {
      const validWallet = await trigger('creatorWallet');
      const validProfit = await trigger('profitReceiverAddress');
      isValid = validWallet && validProfit;
    } else if (step === 8) isValid = !!proofOfIntent;

    if (isValid && step < 9) {
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
    { number: 3, label: 'TOP TRADERS', icon: TrendingUp },
    { number: 4, label: 'STRATEGY', icon: Sliders },
    { number: 5, label: 'CT', icon: FaXTwitter },
    { number: 6, label: 'TELEGRAM', icon: Send },
    { number: 7, label: 'WALLET', icon: Wallet },
    { number: 8, label: 'PROOF', icon: Shield },
    { number: 9, label: 'REVIEW', icon: Eye },
  ];

  const joyrideSteps: JoyrideStep[] = [
    {
      target: '[data-tour="step-1"]',
      content: 'Start by naming your agent and describing its trading style. This helps you recognize it later.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-2"]',
      content: 'Choose where your agent will route trades. Multi-venue automatically picks the best venue.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-3"]',
      content: 'Select top traders to follow. These traders will act as signal providers for your agent.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-4"]',
      content: 'Select research institutes whose signals your agent will follow with a fixed allocation.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-5"]',
      content: 'Pick CT accounts to mirror. Your agent will react when these accounts post signals.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-6"]',
      content: 'Connect Telegram alpha sources whose DM signals your agent should execute.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-7"]',
      content: 'Set the owner wallet and profit receiver for this agent.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-8"]',
      content: 'Sign a message proving you are the legitimate creator of this agent.',
      disableBeacon: true,
      placement: 'top',
    },
    {
      target: '[data-tour="step-9"]',
      content: 'Review every choice before creating your agent. Use Edit to jump back and adjust.',
      disableBeacon: true,
      placement: 'top',
    },
  ];

  const stepDescriptions: Record<number, string> = {
    1: 'Name your agent and optionally describe its trading style.',
    2: 'Choose where your agent will execute trades.',
    3: 'Select top traders to follow as signal providers.',
    4: 'Select research institutes whose signals will drive your agent.',
    5: 'Pick CT accounts your agent should mirror.',
    6: 'Connect Telegram alpha sources your agent will listen to.',
    7: 'Configure the wallet that owns the agent and receives profits.',
    8: 'Sign a message to prove you are the legitimate creator.',
    9: 'Review all settings before creating your agent.',
  };

  // When user reaches the final step, refresh review data (but don't change tour visibility)
  useEffect(() => {
    if (step === 9) {
      fetchReviewData();
    }
  }, [step]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, action } = data;

    // Only handle completion, ignore all other events to prevent interference
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      setRunJoyride(false);
      try {
        if (typeof window !== 'undefined') {
          // Mark this specific step as completed and persist
          setCompletedTourSteps((prev) => {
            if (prev.includes(step)) return prev;
            const updated = [...prev, step];
            window.localStorage.setItem(
              'createAgentTourCompletedSteps',
              JSON.stringify(updated)
            );
            return updated;
          });
        }
      } catch (e) {
        console.log("Error saving tour progress:", e);
      }
    }
  };

  const fetchReviewData = async () => {
    try {
      const researchResponse = await fetch('/api/research-institutes');
      const researchJson = await researchResponse.json();
      const selectedInstitutes =
        researchJson.institutes?.filter((inst: any) =>
          selectedResearchInstitutes.includes(inst.id)
        ) || [];

      // CT accounts
      const ctAccountsData = await db.get('ct_accounts');
      const selectedCtAccountsData =
        ctAccountsData?.filter((acc: any) => selectedCtAccounts.has(acc.id)) || [];

      // Telegram users
      const telegramResponse = await fetch('/api/telegram-alpha-users');
      const telegramJson = await telegramResponse.json();
      const selectedTelegramData =
        telegramJson.alphaUsers?.filter((u: any) => selectedTelegramUsers.has(u.id)) || [];

      // Top traders
      const topTradersResponse = await fetch('/api/top-traders?limit=10');
      const topTradersJson = await topTradersResponse.json();
      const selectedTopTradersData =
        topTradersJson.topTraders?.filter((trader: any) => selectedTopTraders.includes(trader.id)) || [];

      setReviewData({
        researchInstitutes: selectedInstitutes,
        ctAccounts: selectedCtAccountsData,
        telegramUsers: selectedTelegramData,
        topTraders: selectedTopTradersData,
      });
    } catch (err) {
      console.error('Failed to fetch review data', err);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] border border-[var(--border)]">
      <Header />
      {isMounted && !completedTourSteps.includes(step) && (
        <Joyride
          steps={[joyrideSteps[step - 1]]}
          run={runJoyride}
          continuous={false}
          showSkipButton={false}
          showProgress={false}
          hideBackButton
          disableOverlayClose
          disableScrolling={true}
          disableScrollParentFix={true}
          scrollToFirstStep={false}
          scrollOffset={0}
          callback={handleJoyrideCallback}
          floaterProps={{
            disableAnimation: true,
            options: {
              preventOverflow: {
                enabled: true,
                boundariesElement: 'viewport',
                padding: 20,
              },
              flip: {
                enabled: true,
              },
            },
          }}
          styles={{
            options: {
              zIndex: 10000,
              primaryColor: 'var(--accent)',
              backgroundColor: 'var(--bg-elevated)',
              textColor: 'var(--text-primary)',
              arrowColor: 'var(--bg-elevated)',
            },
            tooltip: {
              padding: 20,
              border: '1px solid var(--border)',
              boxShadow: '0 18px 45px rgba(0,0,0,0.55)',
              borderRadius: '8px',
              maxWidth: 'min(320px, calc(100vw - 20px))',
              width: 'auto',
              minWidth: '250px',
            },
            tooltipContainer: {
              textAlign: 'left',
            },
            buttonNext: {
              backgroundColor: 'var(--accent)',
              color: 'var(--bg-deep)',
              fontWeight: 'bold',
              padding: '8px 18px',
              borderRadius: '4px',
              border: 'none',
            },
            beacon: {
              display: 'none',
            },
            overlay: {
              display: 'none',
            },
            spotlight: {
              display: 'none',
            },
          }}
        />
      )}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <p className="data-label mb-2">ALPHA CLUB WIZARD</p>
          <h1 className="font-display text-4xl md:text-5xl mb-4">CREATE YOUR CLUB</h1>
          <p className="text-[var(--text-secondary)]">Configure your Alpha Club's trading strategy</p>
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
                      className={`w-8 h-8 flex items-center justify-center transition-all border ${isCompleted
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
          <div className="mt-6 text-center">
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)]">
              STEP {step} OF {steps.length} · {steps.find((s) => s.number === step)?.label}
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {stepDescriptions[step]}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 border border-[var(--danger)] bg-[var(--danger)]/10 rounded">
            <p className="text-[var(--danger)] text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="border border-[var(--border)] bg-[var(--bg-surface)] p-8">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6" data-tour="step-1">
              <h2 className="font-display text-2xl mb-6">BASIC INFORMATION</h2>
              <div>
                <label className="data-label block mb-2">CLUB NAME *</label>
                <input
                  type="text"
                  {...register('name')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors"
                  placeholder="Alpha Momentum Club"
                />
                {errors.name && <p className="text-[var(--danger)] text-sm mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="data-label block mb-2">DESCRIPTION (OPTIONAL)</label>
                <textarea
                  {...register('description')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors resize-none"
                  placeholder="Describe your club's trading strategy..."
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
            <div className="space-y-6" data-tour="step-2">
              <h2 className="font-display text-2xl mb-6">TRADING VENUE</h2>
              <div className="border border-[var(--accent)] bg-[var(--accent)]/10 p-6 shadow-[0_0_20px_rgba(0,255,136,0.1)]">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">🌐</span>
                  <div>
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">MULTI-VENUE (RECOMMENDED)</h3>
                    <p className="text-sm text-[var(--text-secondary)]">Agent routes to best venue automatically</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                  <p className="flex items-center gap-2"><span className="text-[var(--accent)]">✓</span> Hyperliquid Perpetuals (220+ pairs)</p>
                  <p className="flex items-center gap-2"><span className="text-[var(--accent)]">✓</span> Ostium Synthetics (41 pairs)</p>
                  <p className="flex items-center gap-2"><span className="text-[var(--accent)]">✓</span> Intelligent routing for best liquidity</p>
                </div>
              </div>
              <input type="hidden" {...register('venue')} value="MULTI" />
              <details className="group">
                <summary className="cursor-pointer p-4 bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors">
                  <span className="text-sm font-bold text-[var(--text-primary)]">ADVANCED: SINGLE VENUE</span>
                </summary>
                <div className="mt-4 space-y-3 p-4 bg-[var(--bg-elevated)] border border-[var(--border)]">
                  {['OSTIUM', 'HYPERLIQUID', 'GMX', 'SPOT', 'MULTI'].map((venue) => {
                    const isOstium = venue === 'OSTIUM';
                    const isDisabled = !isOstium;

                    return (
                      <label
                        key={venue}
                        className={`
                        block p-4 border transition-all relative
                        ${isOstium && formData.venue === venue
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_10px_rgba(0,255,136,0.1)] cursor-pointer'
                            : isOstium
                              ? 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-surface)] cursor-pointer'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] opacity-50 cursor-not-allowed'
                          }
                      `}
                      >
                        <input
                          type="radio"
                          {...register('venue')}
                          value={venue}
                          disabled={isDisabled}
                          className="sr-only"
                        />
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--text-primary)]">{venue}</span>
                          {isDisabled && (
                            <span className="text-xs text-[var(--text-muted)] font-medium">COMING SOON</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </details>
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 3: Top Traders */}
          {step === 3 && (
            <div className="space-y-6" data-tour="step-3">
              <h2 className="font-display text-2xl mb-2">TOP TRADERS</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Select top traders to follow. These traders will act as signal providers for your agent.</p>
              <TopTradersSelector selectedIds={selectedTopTraders} onChange={setSelectedTopTraders} />
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 4: Research Institutes */}
          {step === 4 && (
            <div className="space-y-6" data-tour="step-4">
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

          {/* Step 5: CT Accounts */}
          {step === 5 && (
            <div data-tour="step-4">
              <CtAccountSelector
                selectedIds={selectedCtAccounts}
                onToggle={toggleCtAccount}
                onNext={nextStep}
                onBack={prevStep}
              />
            </div>
          )}

          {/* Step 6: Telegram */}
          {step === 6 && (
            <div className="space-y-6" data-tour="step-6">
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

          {/* Step 7: Wallet */}
          {step === 7 && (
            <div className="space-y-6" data-tour="step-7">
              <h2 className="font-display text-2xl mb-6">WALLET SETUP</h2>
              {!authenticated && (
                <div className="p-4 border border-[var(--accent)] bg-[var(--accent)]/10 mb-4 shadow-[0_0_20px_rgba(0,255,136,0.1)]">
                  <p className="text-sm mb-3 text-[var(--text-secondary)]">Connect your wallet for the best experience.</p>
                  <button type="button" onClick={login} className="px-6 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">CONNECT WALLET</button>
                </div>
              )}
              <div>
                <label className="data-label block mb-2">CLUB OWNER WALLET *</label>
                <input
                  type="text"
                  {...register('creatorWallet')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors"
                  placeholder="0x..."
                  readOnly={authenticated && !!user?.wallet?.address}
                />
                {errors.creatorWallet && <p className="text-[var(--danger)] text-sm mt-1">{errors.creatorWallet.message}</p>}
              </div>
              <div>
                <label className="data-label block mb-2">PROFIT RECEIVER * <span className="text-[var(--text-muted)]">(20% of profits)</span></label>
                <input
                  type="text"
                  {...register('profitReceiverAddress')}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors"
                  placeholder="0x..."
                />
                {errors.profitReceiverAddress && <p className="text-[var(--danger)] text-sm mt-1">{errors.profitReceiverAddress.message}</p>}
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 8: Proof of Intent */}
          {step === 8 && (
            <div className="space-y-6" data-tour="step-8">
              <h2 className="font-display text-2xl mb-6">PROOF OF INTENT</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Sign a message to prove your intent to create this Alpha Club.</p>

              {!proofOfIntent ? (
                <div className="space-y-4">
                  <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-bold mb-2 text-[var(--text-primary)]">WHY SIGN?</p>
                        <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                          <li>• Proves you are the legitimate creator</li>
                          <li>• Ensures all signals are authorized</li>
                          <li>• Required for club activation</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={createProofOfIntent}
                    disabled={isSigningProof || !authenticated}
                    className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSigningProof ? <><Activity className="h-5 w-5 animate-pulse" />SIGNING...</> : <><Shield className="h-5 w-5" />SIGN PROOF</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 border border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_20px_rgba(0,255,136,0.1)]">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-[var(--accent)]">PROOF CREATED</p>
                        <p className="text-sm text-[var(--text-secondary)]">Signature verified and ready</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-mono text-[var(--text-secondary)] break-all">
                    <p className="mb-2"><span className="text-[var(--text-muted)]">Timestamp:</span> {proofOfIntent.timestamp.toLocaleString()}</p>
                    <p><span className="text-[var(--text-muted)]">Signature:</span> {proofOfIntent.signature.slice(0, 20)}...{proofOfIntent.signature.slice(-20)}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button type="button" onClick={prevStep} className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors">BACK</button>
                <button type="button" onClick={nextStep} disabled={!proofOfIntent} className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">NEXT →</button>
              </div>
            </div>
          )}

          {/* Step 9: Review */}
          {step === 9 && (
            <div className="space-y-6" data-tour="step-9">
              <h2 className="font-display text-2xl mb-2">REVIEW</h2>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Review your Alpha Club configuration. To change anything, jump back to a step below or use the Edit
                  controls on each card.
                </p>
                <div className="flex items-center gap-2">
                  <label className="data-label text-xs">JUMP TO STEP</label>
                  <select
                    className="px-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    value=""
                    onChange={(e) => {
                      const targetStep = Number(e.target.value);
                      if (!Number.isNaN(targetStep) && targetStep >= 1 && targetStep <= 8) {
                        setStep(targetStep);
                      }
                    }}
                  >
                    <option value="">Select…</option>
                    {steps
                      .filter((s) => s.number !== 9)
                      .map((s) => (
                        <option key={s.number} value={s.number}>
                          {s.number}. {s.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {/* Basic Info */}
                <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="data-label">BASIC INFORMATION</p>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="font-bold text-[var(--text-primary)] mb-1">{formData.name || 'Untitled club'}</p>
                  {formData.description && (
                    <p className="text-sm text-[var(--text-secondary)]">{formData.description}</p>
                  )}
                </div>

                {/* Venue */}
                <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="data-label">TRADING VENUE</p>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="font-bold text-[var(--text-primary)]">{formData.venue}</p>
                </div>

                {/* Top Traders */}
                {selectedTopTraders.length > 0 && (
                  <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="data-label">
                        TOP TRADERS ({selectedTopTraders.length} selected)
                      </p>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    {reviewData.topTraders.length > 0 ? (
                      <div className="space-y-2 mt-3">
                        {reviewData.topTraders.map((trader) => {
                          const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                          const formatNumber = (val: string) => {
                            const num = parseFloat(val);
                            if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
                            if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
                            return `$${num.toFixed(2)}`;
                          };
                          return (
                            <div
                              key={trader.id}
                              className="p-3 bg-[var(--bg-deep)] border border-[var(--border)] rounded flex items-start justify-between gap-3"
                            >
                              <div className="flex items-start gap-3 flex-1">
                                <Wallet className="h-4 w-4 text-[var(--accent)] mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-semibold text-[var(--text-primary)] font-mono text-sm">
                                    {formatAddress(trader.walletAddress)}
                                  </p>
                                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-secondary)]">
                                    <span>IF: {trader.impactFactor.toFixed(2)}</span>
                                    <span>PnL: {formatNumber(trader.totalPnl)}</span>
                                    <span>Trades: {trader.totalTrades}</span>
                                  </div>
                                </div>
                              </div>
                              <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        Top traders data loading...
                      </p>
                    )}
                  </div>
                )}

                {/* Research Institutes */}
                <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="data-label">
                      RESEARCH INSTITUTES ({selectedResearchInstitutes.length} selected)
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  {reviewData.researchInstitutes.length > 0 ? (
                    <div className="space-y-2 mt-3">
                      {reviewData.researchInstitutes.map((inst) => (
                        <div
                          key={inst.id}
                          className="p-3 bg-[var(--bg-deep)] border border-[var(--border)] rounded flex items-start justify-between gap-3"
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-[var(--text-primary)]">{inst.name}</p>
                            {inst.description && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                                {inst.description}
                              </p>
                            )}
                            {inst.x_handle && (
                              <a
                                href={`https://x.com/${inst.x_handle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[var(--accent)] hover:underline mt-1 inline-flex items-center gap-1"
                              >
                                <Twitter className="h-3 w-3" />
                                @{inst.x_handle}
                              </a>
                            )}
                          </div>
                          <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      No research institutes resolved yet. They will appear here once loaded.
                    </p>
                  )}
                </div>

                {/* CT Accounts */}
                <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="data-label">
                      CT ACCOUNTS ({selectedCtAccounts.size} selected)
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(5)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  {reviewData.ctAccounts.length > 0 ? (
                    <div className="space-y-2 mt-3">
                      {reviewData.ctAccounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="p-3 bg-[var(--bg-deep)] border border-[var(--border)] rounded flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <FaXTwitter className="h-4 w-4 text-[var(--accent)]" />
                            <div className="flex-1">
                              <p className="font-semibold text-[var(--text-primary)]">@{acc.xUsername}</p>
                              {acc.displayName && (
                                <p className="text-xs text-[var(--text-secondary)]">{acc.displayName}</p>
                              )}
                              {typeof acc.followersCount === 'number' && (
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                  {acc.followersCount.toLocaleString()} followers
                                </p>
                              )}
                            </div>
                          </div>
                          <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      No CT accounts resolved yet. They will appear here once loaded.
                    </p>
                  )}
                </div>

                {/* Telegram Users */}
                <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="data-label">
                      TELEGRAM USERS ({selectedTelegramUsers.size} selected)
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(6)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  {(() => {
                    const subtotal = reviewData.telegramUsers.reduce((sum, u) => sum + Number(u.credit_price || 0), 0);
                    const platformFee = subtotal * 0.1;
                    const totalCredits = subtotal + platformFee;

                    return (
                      <>
                        {reviewData.telegramUsers.length > 0 ? (
                          <div className="space-y-2 mt-3">
                            {reviewData.telegramUsers.map((u) => {
                              const displayName = u.telegram_username
                                ? `@${u.telegram_username}`
                                : u.first_name
                                  ? `${u.first_name} ${u.last_name || ''}`.trim()
                                  : 'Telegram User';
                              return (
                                <div
                                  key={u.id}
                                  className="p-3 bg-[var(--bg-deep)] border border-[var(--border)] rounded flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Send className="h-4 w-4 text-[var(--accent)]" />
                                    <p className="font-semibold text-[var(--text-primary)]">{displayName}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-mono text-[var(--accent)]">
                                      {Number(u.credit_price) > 0 ? `${Number(u.credit_price).toLocaleString()} ¢` : 'FREE'}
                                    </span>
                                    <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--text-muted)] mt-1">
                            No Telegram users selected.
                          </p>
                        )}

                        {/* Cost Breakdown */}
                        <div className="mt-4 p-4 border border-[var(--accent)]/30 bg-[var(--accent)]/5 rounded-lg">
                          <p className="text-xs font-bold text-[var(--accent)] mb-3 tracking-wider uppercase">Subscription Breakdown</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--text-secondary)]">Alpha Subscription Subtotal</span>
                              <span className="font-mono text-[var(--text-primary)]">{subtotal.toLocaleString()} ¢</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--text-secondary)]">Platform Fee (10%)</span>
                              <span className="font-mono text-[var(--text-primary)]">+{platformFee.toLocaleString()} ¢</span>
                            </div>
                            <div className="h-px bg-[var(--border)] my-1" />
                            <div className="flex justify-between items-center pt-1">
                              <span className="text-sm font-bold text-[var(--text-primary)]">TOTAL CREDITS REQUIRED</span>
                              <div className="text-right">
                                <span className="text-lg font-mono font-bold text-[var(--accent)]">{totalCredits.toLocaleString()} ¢</span>
                                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-tighter">One-time payment</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Wallet configuration */}
                <div className="p-4 border border-[var(--border)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="data-label">WALLET CONFIGURATION</p>
                    <button
                      type="button"
                      onClick={() => setStep(7)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="space-y-2 mt-2">
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Club Owner Wallet</p>
                      <p className="font-mono text-xs text-[var(--text-primary)] break-all bg-[var(--bg-deep)] p-2 rounded border border-[var(--border)]">
                        {formData.creatorWallet || 'Not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Profit Receiver (20% of profits)</p>
                      <p className="font-mono text-xs text-[var(--text-primary)] break-all bg-[var(--bg-deep)] p-2 rounded border border-[var(--border)]">
                        {formData.profitReceiverAddress || 'Defaults to club owner wallet'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Proof of Intent summary */}
                {proofOfIntent && (
                  <div className="p-4 border border-[var(--accent)] bg-[var(--accent)]/10">
                    <div className="flex items-center justify-between mb-2">
                      <p className="data-label text-[var(--accent)]">PROOF OF INTENT</p>
                      <button
                        type="button"
                        onClick={() => setStep(8)}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="flex items-start gap-2 mt-2">
                      <Check className="h-5 w-5 text-[var(--accent)] mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-[var(--text-primary)] font-semibold">Signed and Verified</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          Timestamp: {proofOfIntent.timestamp.toLocaleString()}
                        </p>
                        <p className="text-xs font-mono text-[var(--text-muted)] mt-1 break-all">
                          {proofOfIntent.signature.slice(0, 20)}...{proofOfIntent.signature.slice(-20)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={isSubmitting}
                  className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  BACK
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <><Activity className="h-5 w-5 animate-pulse" />CREATING...</> : 'CREATE CLUB'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div >

      {/* Success Modal */}
      {
        showDeployModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] max-w-md w-full p-8 shadow-[0_0_40px_rgba(0,255,136,0.2)]">
              <div className="text-center mb-6">
                <div className="w-16 h-16 border-2 border-[var(--accent)] bg-[var(--accent)]/20 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(0,255,136,0.3)]">
                  <Check className="h-8 w-8 text-[var(--accent)]" />
                </div>
                <h2 className="font-display text-2xl mb-2 text-[var(--text-primary)]">CLUB CREATED!</h2>
                <p className="text-[var(--text-secondary)]">Your Alpha Club is ready</p>
              </div>
              <div className="space-y-4">
                <button onClick={() => router.push('/creator')} className="w-full py-4 border border-[var(--border)] font-bold hover:border-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-primary)]">
                  VIEW MY CLUBS
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        hyperliquidModalOpen && (
          <HyperliquidConnect
            agentId={hyperliquidAgentId}
            agentName={hyperliquidAgentName}
            agentVenue={formData.venue}
            onClose={() => setHyperliquidModalOpen(false)}
            onSuccess={() => { setHyperliquidModalOpen(false); router.push('/my-deployments'); }}
          />
        )
      }

      {
        ostiumModalOpen && (
          <OstiumConnect
            agentId={ostiumAgentId}
            agentName={ostiumAgentName}
            onClose={() => setOstiumModalOpen(false)}
            onSuccess={() => { setOstiumModalOpen(false); router.push('/my-deployments'); }}
          />
        )
      }

      {
        ostiumApprovalModal && (
          <OstiumApproval
            deploymentId={ostiumApprovalModal.deploymentId}
            agentAddress={ostiumApprovalModal.agentAddress}
            userWallet={ostiumApprovalModal.userWallet}
            onApprovalComplete={() => { setOstiumApprovalModal(null); router.push('/my-deployments'); }}
            onClose={() => setOstiumApprovalModal(null)}
          />
        )
      }
    </div >
  );
}
