import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Check, User, Sliders, Activity, Eye, Settings as SettingsIcon, TrendingUp, Wallet } from 'lucide-react';
import { Header } from '@components/Header';
import { usePrivy } from '@privy-io/react-auth';
import { ResearchInstituteSelector } from '@components/ResearchInstituteSelector';
import { TelegramAlphaUserSelector } from '@components/TelegramAlphaUserSelector';
import { CtAccountSelector } from '@components/CtAccountSelector';
import { TopTradersSelector } from '@components/TopTradersSelector';
import { FaXTwitter } from 'react-icons/fa6';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Agent } from '@shared/schema';

export default function EditAgent() {
  const router = useRouter();
  const { id } = router.query;
  const { authenticated, user, login } = usePrivy();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agent, setAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    status: 'DRAFT',
  });

  const [selectedResearchInstitutes, setSelectedResearchInstitutes] = useState<string[]>([]);
  const [selectedCtAccounts, setSelectedCtAccounts] = useState<Set<string>>(new Set());
  const [selectedTelegramUsers, setSelectedTelegramUsers] = useState<Set<string>>(new Set());
  const [selectedTopTraders, setSelectedTopTraders] = useState<string[]>([]);

  const [reviewData, setReviewData] = useState<{
    researchInstitutes: Array<{ id: string; name: string; description: string | null; x_handle: string | null }>;
    ctAccounts: Array<{ id: string; xUsername: string; displayName: string | null; followersCount: number | null }>;
    telegramUsers: Array<{ id: string; telegram_username: string | null; first_name: string | null; last_name: string | null }>;
    topTraders: Array<{ id: string; walletAddress: string; impactFactor: number; totalPnl: string; totalTrades: number }>;
  }>({
    researchInstitutes: [],
    ctAccounts: [],
    telegramUsers: [],
    topTraders: [],
  });

  useEffect(() => {
    if (id && authenticated && user?.wallet?.address) {
      loadAgentData();
    }
  }, [id, authenticated, user?.wallet?.address]);

  useEffect(() => {
    if (step === 6) {
      fetchReviewData();
    }
  }, [step]);

  const loadAgentData = async () => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    setError(null);

    try {
      // Fetch agent details
      const agentResponse = await fetch(`/api/agents/${id}`);
      if (!agentResponse.ok) throw new Error('Failed to load agent');
      const agentData = await agentResponse.json();

      // Check if user is the creator
      const userWallet = user?.wallet?.address;
      const creatorWallet = agentData.creator_wallet || agentData.creatorWallet;

      console.log('Authorization check:', {
        userWallet,
        creatorWallet,
        agentData: agentData,
        match: userWallet?.toLowerCase() === creatorWallet?.toLowerCase()
      });

      if (!userWallet || !creatorWallet) {
        setError('Unable to verify authorization');
        setTimeout(() => router.push('/creator'), 2000);
        return;
      }

      if (creatorWallet.toLowerCase() !== userWallet.toLowerCase()) {
        setError('You are not authorized to edit this agent');
        setTimeout(() => router.push('/creator'), 2000);
        return;
      }

      setAgent(agentData);
      setFormData({
        name: agentData.name,
        status: agentData.status || 'DRAFT',
      });

      // Load sources
      const [researchRes, accountsRes, telegramRes, topTradersRes] = await Promise.all([
        fetch(`/api/agents/${id}/research-institutes`).then(r => r.json()).catch(() => ({ institutes: [] })),
        fetch(`/api/agents/${id}/accounts`).then(r => r.json()).catch(() => []),
        fetch(`/api/agents/${id}/telegram-users`).then(r => r.json()).catch(() => ({ users: [] })),
        fetch(`/api/agents/${id}/top-traders`).then(r => r.json()).catch(() => ({ topTraders: [] })),
      ]);

      setSelectedResearchInstitutes(researchRes.institutes?.map((inst: any) => inst.id) || []);
      setSelectedCtAccounts(new Set(accountsRes.map((acc: any) => acc.ct_accounts?.id || acc.ctAccountId).filter(Boolean)));
      setSelectedTopTraders(topTradersRes.topTraders?.map((trader: any) => trader.id) || []);
      setSelectedTelegramUsers(new Set(telegramRes.users?.map((user: any) => user.id) || []));

    } catch (err: any) {
      setError(err.message || 'Failed to load agent data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!id || typeof id !== 'string') return;

    setSaving(true);
    setError(null);

    try {
      // Update agent basic info
      const response = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          status: formData.status,
        }),
      });

      if (!response.ok) throw new Error('Failed to update agent');

      // Update research institutes
      const currentResearch = await fetch(`/api/agents/${id}/research-institutes`).then(r => r.json()).catch(() => ({ institutes: [] }));
      const currentResearchIds = currentResearch.institutes?.map((inst: any) => inst.id) || [];

      // Add new institutes
      for (const instId of selectedResearchInstitutes) {
        if (!currentResearchIds.includes(instId)) {
          await fetch(`/api/agents/${id}/research-institutes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ institute_id: instId }),
          });
        }
      }

      // Remove institutes
      for (const instId of currentResearchIds) {
        if (!selectedResearchInstitutes.includes(instId)) {
          await fetch(`/api/agents/${id}/research-institutes`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ institute_id: instId }),
          });
        }
      }

      // Update CT accounts
      const currentAccounts = await fetch(`/api/agents/${id}/accounts`).then(r => r.json()).catch(() => []);
      const currentAccountIds = currentAccounts.map((acc: any) => acc.ct_accounts?.id || acc.ctAccountId).filter(Boolean);

      // Add new accounts
      for (const accId of Array.from(selectedCtAccounts)) {
        if (!currentAccountIds.includes(accId)) {
          await fetch(`/api/agents/${id}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ctAccountId: accId }),
          });
        }
      }

      // Remove accounts
      for (const accId of currentAccountIds) {
        if (!selectedCtAccounts.has(accId)) {
          await fetch(`/api/agents/${id}/accounts?ctAccountId=${accId}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
      }

      // Update Telegram users
      const currentTelegram = await fetch(`/api/agents/${id}/telegram-users`).then(r => r.json()).catch(() => ({ users: [] }));
      const currentTelegramIds = currentTelegram.users?.map((user: any) => user.id) || [];

      // Add new users
      for (const userId of Array.from(selectedTelegramUsers)) {
        if (!currentTelegramIds.includes(userId)) {
          await fetch(`/api/agents/${id}/telegram-users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_alpha_user_id: userId }),
          }).catch(() => {});
        }
      }

      // Remove users
      for (const userId of currentTelegramIds) {
        if (!selectedTelegramUsers.has(userId)) {
          await fetch(`/api/agents/${id}/telegram-users?telegram_alpha_user_id=${userId}`, {
            method: 'DELETE',
          }).catch(() => { });
        }
      }

      const currentTopTraders = await fetch(`/api/agents/${id}/top-traders`).then(r => r.json()).catch(() => ({ topTraders: [] }));
      const currentTopTraderIds = currentTopTraders.topTraders?.map((trader: any) => trader.id) || [];

      for (const traderId of selectedTopTraders) {
        if (!currentTopTraderIds.includes(traderId)) {
          await fetch(`/api/agents/${id}/top-traders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ top_trader_id: traderId }),
          }).catch(() => { });
        }
      }

      for (const traderId of currentTopTraderIds) {
        if (!selectedTopTraders.includes(traderId)) {
          await fetch(`/api/agents/${id}/top-traders?top_trader_id=${traderId}`, {
            method: 'DELETE',
          }).catch(() => { });
        }
      }

      toast({
        title: "Agent Updated",
        description: "Your agent has been updated successfully.",
      });

      router.push('/creator');
    } catch (err: any) {
      setError(err.message || 'Failed to update agent');
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update agent",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCtAccount = (accountId: string) => {
    const newSelected = new Set(selectedCtAccounts);
    if (newSelected.has(accountId)) newSelected.delete(accountId);
    else newSelected.add(accountId);
    setSelectedCtAccounts(newSelected);
  };

  const nextStep = () => {
    if (step === 1 && !formData.name.trim()) {
      setError('Please enter an agent name');
      return;
    }
    if (step === 2 && selectedResearchInstitutes.length === 0) {
      setError('Please select at least one research institute');
      return;
    }
    if (step === 3 && selectedCtAccounts.size === 0) {
      setError('Please select at least one CT account');
      return;
    }

    if (step < 6) {
      setStep(step + 1);
      setError(null);
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
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
      const ctResponse = await fetch('/api/ct-accounts');
      const ctJson = await ctResponse.json();
      const selectedCtAccountsData =
        ctJson?.filter((acc: any) => selectedCtAccounts.has(acc.id)) || [];

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

  const steps = [
    { number: 1, label: 'BASIC', icon: User },
    { number: 2, label: 'TOP TRADERS', icon: TrendingUp },
    { number: 3, label: 'RESEARCH', icon: Sliders },
    { number: 4, label: 'CT', icon: FaXTwitter },
    { number: 5, label: 'TELEGRAM', icon: Send },
    { number: 6, label: 'REVIEW', icon: Eye },
  ];

  const stepDescriptions: Record<number, string> = {
    1: 'Update your agent name and visibility settings.',
    2: 'Manage top traders to copy trade from.',
    3: 'Manage research institutes your agent follows.',
    4: 'Manage CT accounts your agent mirrors.',
    5: 'Manage Telegram alpha users your agent follows.',
    6: 'Review all settings before saving changes.',
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)]">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <h1 className="font-display text-3xl mb-4">Authentication Required</h1>
          <p className="text-[var(--text-secondary)] mb-6">Please connect your wallet to edit agents.</p>
          <button
            onClick={login}
            className="px-6 py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
          >
            CONNECT WALLET
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)]">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <Activity className="h-12 w-12 animate-pulse text-[var(--accent)] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Loading agent data...</p>
        </div>
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div className="min-h-screen bg-[var(--bg-deep)]">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <div className="mb-6 p-4 border border-[var(--danger)] bg-[var(--danger)]/10 rounded inline-block">
            <p className="text-[var(--danger)] text-sm font-medium">{error}</p>
          </div>
          <button
            onClick={() => router.push('/creator')}
            className="px-6 py-3 border border-[var(--border)] font-bold hover:border-[var(--accent)] transition-colors"
          >
            BACK TO CREATOR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-deep)]">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <p className="data-label mb-2">AGENT EDITOR</p>
          <h1 className="font-display text-4xl md:text-5xl mb-4">EDIT AGENT</h1>
          <p className="text-[var(--text-secondary)]">Modify your agent configuration</p>
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

        <div className="border border-[var(--border)] bg-[var(--bg-surface)] p-8">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-6">BASIC INFORMATION</h2>
              <div>
                <label className="data-label block mb-2">AGENT NAME *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors"
                  placeholder="Alpha Momentum Trader"
                />
              </div>

              {/* Status Toggle */}
              <div>
                <label className="data-label block mb-2">VISIBILITY</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, status: 'PUBLIC' })}
                    className={`flex-1 px-4 py-3 border text-sm font-bold transition-all ${formData.status === 'PUBLIC'
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10 shadow-lg'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    PUBLIC
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, status: 'PRIVATE' })}
                    className={`flex-1 px-4 py-3 border text-sm font-bold transition-all ${formData.status === 'PRIVATE'
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10 shadow-lg'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    PRIVATE
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => router.push('/creator')}
                  className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                >
                  NEXT →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Top Traders */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-2">TOP TRADERS</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Select top traders to copy trade from. Their wallet addresses will be used as signal providers.</p>
              <TopTradersSelector selectedIds={selectedTopTraders} onChange={setSelectedTopTraders} />
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
              <h2 className="font-display text-2xl mb-2">CT ACCOUNTS</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Select CT accounts your agent should mirror.</p>
              <CtAccountSelector
                selectedIds={selectedCtAccounts}
                onToggle={toggleCtAccount}
                onNext={nextStep}
                onBack={prevStep}
              />
              {selectedCtAccounts.size === 0 && (
                <p className="text-sm text-[var(--accent)]">⚠️ Select at least one CT account</p>
              )}
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

          {/* Step 6: Review */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl mb-2">REVIEW CHANGES</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Review your changes before saving.</p>

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
                  <p className="font-bold text-[var(--text-primary)] mb-1">{formData.name}</p>
                  <p className="text-sm text-[var(--text-secondary)]">Status: <span className="font-semibold">{formData.status}</span></p>
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
                        onClick={() => setStep(2)}
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
                      <p className="text-sm text-[var(--text-muted)] mt-1">Loading...</p>
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
                      onClick={() => setStep(3)}
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
                            {inst.x_handle && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1">@{inst.x_handle}</p>
                            )}
                          </div>
                          <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] mt-1">Loading...</p>
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
                      onClick={() => setStep(4)}
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
                            </div>
                          </div>
                          <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] mt-1">Loading...</p>
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
                      onClick={() => setStep(5)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
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
                            <Check className="h-4 w-4 text-[var(--accent)] flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  ) : selectedTelegramUsers.size > 0 ? (
                    <p className="text-sm text-[var(--text-muted)] mt-1">Loading...</p>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] mt-1">No telegram users selected</p>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={saving}
                  className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  BACK
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Activity className="h-5 w-5 animate-pulse" />
                      SAVING...
                    </>
                  ) : (
                    'SAVE CHANGES'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

