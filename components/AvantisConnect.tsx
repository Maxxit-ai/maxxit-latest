/**
 * Avantis Connection Flow - Brutalist Design
 * Multi-step flow: connect → preferences → agent → approvals → complete
 * Adapted from OstiumConnect for Base chain / Avantis DEX
 */

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Zap, Activity, ExternalLink, ArrowRight, Plus } from 'lucide-react';
import { ethers } from 'ethers';
import { TradingPreferencesForm, TradingPreferences } from './TradingPreferencesModal';
import { getAvantisConfig } from '../lib/avantis-config';
import { Web3CheckoutModal } from './Web3CheckoutModal';
import { PaymentSelectorModal } from './PaymentSelectorModal';

const pricingTiers = [
    { name: "STARTER", price: "$19", credits: "1,000 Credits", value: 1000, description: "Kickstart your automated trading.", accent: "var(--accent)" },
    { name: "PRO", price: "$49", credits: "5,000 Credits", value: 5000, description: "The sweet spot for active traders.", accent: "var(--accent)" },
    { name: "WHALE", price: "$99", credits: "15,000 Credits", value: 15000, description: "Maximum power for institutional-grade trading.", accent: "#ffaa00" },
];

interface AvantisConnectProps {
    agentId: string;
    agentName: string;
    onClose: () => void;
    onSuccess?: () => void;
}

const { tradingContract: AVANTIS_TRADING_CONTRACT, usdcContract: USDC_TOKEN, tradingStorageContract: AVANTIS_STORAGE, chainId: BASE_CHAIN_ID, blockExplorerUrl, chainName } = getAvantisConfig();
const AVANTIS_TRADING_ABI = ['function setDelegate(address delegate) external'];
const USDC_ABI = [
    'function approve(address spender, uint256 amount) public returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

export function AvantisConnect({ agentId, agentName, onClose, onSuccess }: AvantisConnectProps) {
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
    const [tradingPreferences, setTradingPreferences] = useState<TradingPreferences | null>(null);
    const tradingPreferencesRef = useRef<TradingPreferences | null>(null);
    const [firstDeploymentPreferences, setFirstDeploymentPreferences] = useState<TradingPreferences | null>(null);
    const [loadingFirstDeploymentPreferences, setLoadingFirstDeploymentPreferences] = useState(false);
    const isCheckingRef = useRef(false);
    const isAssigningRef = useRef(false);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [agentData, setAgentData] = useState<any>(null);
    const [creditBalance, setCreditBalance] = useState<number>(0);
    const [totalCost, setTotalCost] = useState<number>(0);
    const [isWeb3ModalOpen, setIsWeb3ModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedTier, setSelectedTier] = useState<any>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);
    const [showTopUpUI, setShowTopUpUI] = useState(false);
    const [isCreator, setIsCreator] = useState(false);

    useEffect(() => {
        if (authenticated && user?.wallet?.address) { loadAgentData(); loadCreditBalance(); }
    }, [authenticated, user?.wallet?.address]);

    useEffect(() => {
        if (authenticated && user?.wallet?.address && step === 'connect' && !hasInitialized) {
            setHasInitialized(true);
            loadAgentData(); loadCreditBalance();
            setLoadingFirstDeploymentPreferences(true);
            loadFirstDeploymentPreferences().then((prefs) => {
                if (prefs) setFirstDeploymentPreferences(prefs);
                setLoadingFirstDeploymentPreferences(false);
            });
            setStep('preferences');
        }
    }, [authenticated, user?.wallet?.address, step, hasInitialized]);

    const loadAgentData = async () => {
        try {
            const response = await fetch(`/api/agents/${agentId}`);
            if (response.ok) {
                const data = await response.json();
                setAgentData(data);
                const userWallet = user?.wallet?.address?.toLowerCase() || '';
                const creatorWallet = (data.creator_wallet || '').toLowerCase();
                setIsCreator(userWallet && creatorWallet ? userWallet === creatorWallet : false);
                let subtotal = 0;
                if (data.agent_telegram_users) {
                    data.agent_telegram_users.forEach((au: any) => { if (au.telegram_alpha_users?.credit_price) subtotal += parseFloat(au.telegram_alpha_users.credit_price); });
                }
                setTotalCost(subtotal + subtotal * 0.1);
            }
        } catch (err) { console.error('[AvantisConnect] Error loading agent data:', err); }
    };

    const loadCreditBalance = async () => {
        if (!user?.wallet?.address) return;
        try {
            const response = await fetch(`/api/user/credits/balance?wallet=${user.wallet.address}`);
            if (response.ok) { const data = await response.json(); setCreditBalance(parseFloat(data.balance || '0')); }
        } catch (err) { console.error('[AvantisConnect] Error loading credit balance:', err); }
    };

    const checkSetupStatus = async () => {
        if (!user?.wallet?.address) return;
        if (isCheckingRef.current) return;
        isCheckingRef.current = true;
        try {
            const setupResponse = await fetch(`/api/user/check-setup-status?userWallet=${user.wallet.address}&agentId=${agentId}`);
            if (setupResponse.ok) {
                const setupData = await setupResponse.json();
                if (setupData.hasAvantisAddress || setupData.hasOstiumAddress) {
                    const addr = setupData.addresses?.avantis || setupData.addresses?.ostium;
                    setAgentAddress(addr);
                    const approvalResponse = await fetch(`/api/avantis/check-approval-status?userWallet=${user.wallet.address}`);
                    if (approvalResponse.ok) {
                        const approvalData = await approvalResponse.json();
                        if (approvalData.hasApproval) {
                            setDelegateApproved(true); setUsdcApproved(true); setStep('complete'); setLoading(false); return;
                        }
                    }
                    setDelegateApproved(true); setStep('approvals'); setLoading(false);
                } else {
                    setStep('agent'); setLoading(false);
                }
            } else { setStep('agent'); setLoading(false); }
        } catch (err) { setStep('agent'); setLoading(false); }
        finally { isCheckingRef.current = false; }
    };

    const assignAgent = async () => {
        if (isAssigningRef.current) return;
        isAssigningRef.current = true;
        setLoading(true); setError('');
        try {
            const addressResponse = await fetch(`/api/agents/${agentId}/generate-deployment-address`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userWallet: user?.wallet?.address, venue: 'AVANTIS' }),
            });
            if (!addressResponse.ok) { const errorData = await addressResponse.json(); throw new Error(errorData.error || 'Failed to generate agent address'); }
            const addressData = await addressResponse.json();
            const agentAddr = addressData.address || addressData.addresses?.avantis?.address;
            if (!agentAddr) throw new Error('No Avantis agent address returned');
            setAgentAddress(agentAddr);
        } catch (err: any) { setError(err.message || 'Failed to assign agent wallet'); }
        finally { setLoading(false); isAssigningRef.current = false; }
    };

    const joinAgent = async () => {
        if (!isCreator && totalCost > 0 && creditBalance < totalCost) { setShowTopUpUI(true); return; }
        setJoiningAgent(true); setError('');
        try {
            const requestBody: Record<string, unknown> = { agentId, userWallet: user?.wallet?.address };
            if (tradingPreferencesRef.current) requestBody.tradingPreferences = tradingPreferencesRef.current;
            const response = await fetch('/api/agents/join-with-payment', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
            });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'Failed to join agent'); }
            const data = await response.json();
            setDeploymentId(data.deployment.id);
            loadCreditBalance();
            if (onSuccess) onSuccess();
        } catch (err: any) { setError(err.message || 'Failed to join agent'); }
        finally { setJoiningAgent(false); }
    };

    const handleBuyCredits = (tier: any) => { setSelectedTier(tier); setIsPaymentModalOpen(true); };

    const handlePaymentSelection = async (method: 'stripe' | 'web3') => {
        if (method === 'stripe') {
            setIsRedirecting(true);
            try {
                const response = await fetch('/api/payments/stripe/create-checkout', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tierName: selectedTier.name, userWallet: user?.wallet?.address }),
                });
                const data = await response.json();
                if (data.url) window.location.href = data.url;
                else alert('Failed to start Stripe checkout.');
            } catch (error) { alert('An error occurred.'); }
            finally { setIsRedirecting(false); setIsPaymentModalOpen(false); }
        } else { setIsPaymentModalOpen(false); setIsWeb3ModalOpen(true); }
    };

    const approveAgent = async () => {
        setLoading(true); setError('');
        try {
            if (!authenticated || !user?.wallet?.address) throw new Error('Please connect your wallet');
            if (!agentAddress) throw new Error('Agent not assigned yet');
            const provider = (window as any).ethereum;
            if (!provider) throw new Error('No wallet provider found.');
            const ethersProvider = new ethers.providers.Web3Provider(provider);
            const network = await ethersProvider.getNetwork();
            if (network.chainId !== BASE_CHAIN_ID) {
                try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }] }); }
                catch (switchError: any) { throw new Error(switchError.code === 4902 ? `Please add ${chainName} to your wallet` : `Please switch to ${chainName}`); }
            }
            const signer = ethersProvider.getSigner();
            const contract = new ethers.Contract(AVANTIS_TRADING_CONTRACT, AVANTIS_TRADING_ABI, signer);
            const gasEstimate = await contract.estimateGas.setDelegate(agentAddress);
            const tx = await contract.setDelegate(agentAddress, { gasLimit: gasEstimate.mul(150).div(100) });
            setTxHash(tx.hash); await tx.wait();
            setDelegateApproved(true); setDelegationStatus(true); setTxHash(null);
            await checkAndApproveUsdc();
        } catch (err: any) {
            if (err.code === 4001) setError('Transaction rejected');
            else setError(err.message || 'Failed to approve agent');
        } finally { setLoading(false); }
    };

    const checkAndApproveUsdc = async () => {
        setLoading(true); setError('');
        try {
            if (!authenticated || !user?.wallet?.address) throw new Error('Please connect your wallet');
            const provider = (window as any).ethereum;
            if (!provider) throw new Error('No wallet provider found.');
            const ethersProvider = new ethers.providers.Web3Provider(provider);
            await ethersProvider.send('eth_requestAccounts', []);
            const network = await ethersProvider.getNetwork();
            if (network.chainId !== BASE_CHAIN_ID) throw new Error(`Please switch to ${chainName}`);
            const signer = ethersProvider.getSigner();
            const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);
            const currentAllowance = await usdcContract.allowance(user.wallet.address, AVANTIS_STORAGE);
            const storageAllowance = parseFloat(ethers.utils.formatUnits(currentAllowance, 6));
            if (storageAllowance >= 100) { setUsdcApproved(true); setUsdcAllowanceStatus(true); setLoading(false); return; }
            await approveUsdcTransaction();
        } catch (err: any) { setError(err.message || 'Failed to check USDC approval'); setLoading(false); }
    };

    const approveUsdcTransaction = async () => {
        if (!authenticated || !user?.wallet?.address) throw new Error('Please connect your wallet');
        const provider = (window as any).ethereum;
        const ethersProvider = new ethers.providers.Web3Provider(provider);
        const signer = ethersProvider.getSigner();
        const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);
        const allowanceAmount = ethers.utils.parseUnits('1000000', 6);
        const approveData = usdcContract.interface.encodeFunctionData('approve', [AVANTIS_STORAGE, allowanceAmount]);
        const gasEstimate = await ethersProvider.estimateGas({ to: USDC_TOKEN, from: user.wallet.address, data: approveData });
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: user.wallet.address, to: USDC_TOKEN, data: approveData, gas: gasEstimate.mul(150).div(100).toHexString() }],
        });
        setTxHash(txHash);
        await ethersProvider.waitForTransaction(txHash);
        setUsdcApproved(true); setUsdcAllowanceStatus(true); setLoading(false);
    };

    const enableOneClickTrading = async () => {
        setLoading(true); setError('');
        try {
            if (!authenticated || !user?.wallet?.address) throw new Error('Please connect your wallet');
            if (!agentAddress) throw new Error('Agent not assigned yet');
            const { isDelegated, hasApproval } = await checkApprovalStatus();
            if (!isDelegated) { await approveAgent(); return; }
            if (isDelegated && !hasApproval) { await checkAndApproveUsdc(); return; }
            setLoading(false);
        } catch (err: any) {
            if (err.code === 4001 || err.message?.includes('rejected')) setError('Transaction rejected');
            else setError(err.message || 'Failed to enable 1-click trading');
            setLoading(false);
        }
    };

    const checkApprovalStatus = async (): Promise<{ isDelegated: boolean; hasApproval: boolean }> => {
        if (!user?.wallet?.address || !agentAddress) return { isDelegated: false, hasApproval: false };
        setCheckingApprovalStatus(true);
        try {
            let isDelegated = false, hasApproval = false;
            const delRes = await fetch(`/api/avantis/check-delegation-status?userWallet=${user.wallet.address}&agentAddress=${agentAddress}`);
            if (delRes.ok) { const d = await delRes.json(); isDelegated = d.isDelegatedToAgent; setDelegationStatus(isDelegated); setDelegateApproved(isDelegated); }
            const allowRes = await fetch(`/api/avantis/check-approval-status?userWallet=${user.wallet.address}`);
            if (allowRes.ok) { const a = await allowRes.json(); hasApproval = a.hasApproval; setUsdcAllowanceStatus(hasApproval); setUsdcApproved(hasApproval); }
            return { isDelegated, hasApproval };
        } catch (err) { return { isDelegated: false, hasApproval: false }; }
        finally { setCheckingApprovalStatus(false); }
    };

    const handleConnect = () => { if (!authenticated) login(); };
    const handlePreferencesSet = (preferences: TradingPreferences) => { tradingPreferencesRef.current = preferences; setTradingPreferences(preferences); };
    const handlePreferencesNext = () => { setLoading(true); checkSetupStatus(); };

    const loadFirstDeploymentPreferences = async () => {
        if (!user?.wallet?.address) return null;
        try {
            const response = await fetch(`/api/user/first-deployment-preferences?userWallet=${user.wallet.address}&agentId=${agentId}`);
            if (!response.ok) return null;
            const data = await response.json();
            return data.isFirstDeployment ? null : data.preferences;
        } catch (err) { return null; }
    };

    const goBack = () => {
        if (step === 'preferences') setStep('connect');
        else if (step === 'agent' || step === 'approvals') setStep('preferences');
        else if (step === 'complete') setStep('approvals');
    };

    useEffect(() => { if (step === 'agent' && user?.wallet?.address && !agentAddress && !loading && !isAssigningRef.current) assignAgent(); }, [step, user?.wallet?.address, agentAddress, loading]);
    useEffect(() => { if (step === 'preferences' && tradingPreferencesRef.current && !tradingPreferences) setTradingPreferences(tradingPreferencesRef.current); }, [step, tradingPreferences]);
    useEffect(() => { if (step === 'approvals' && user?.wallet?.address && agentAddress && !checkingApprovalStatus) checkApprovalStatus(); }, [step, user?.wallet?.address, agentAddress]);
    useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = 'unset'; }; }, []);

    // ── RENDER ──────────────────────────────────────────────────────────────────

    const stepLabels = [
        { key: 'connect', num: 1, title: 'Connect wallet', desc: 'Authorize your Base wallet.' },
        { key: 'preferences', num: 2, title: 'Trading style', desc: 'Set risk, frequency, and filters.' },
        { key: 'approvals', num: 3, title: 'Enable 1-Click Trading', desc: 'Delegate signatures and set allowance.' },
        { key: 'complete', num: 4, title: 'Join Agent', desc: 'Deploy the agent and start trading.' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-1 sm:p-2 md:p-4" onWheelCapture={(e) => e.stopPropagation()}>
            <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-5xl w-full max-h-[98vh] sm:max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden overscroll-contain">
                {/* Header */}
                <div className="border-b border-[var(--border)] px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 flex-shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-0 flex-1">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border border-[var(--accent)] flex items-center justify-center flex-shrink-0">
                            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-[var(--accent)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="data-label mb-0.5 sm:mb-1 text-[9px] sm:text-[10px] md:text-xs">JOIN ALPHA CLUB (AVANTIS)</p>
                            <h2 className="font-display text-xs sm:text-sm md:text-lg lg:text-xl truncate">Join {agentName}</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 sm:p-1.5 md:p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
                        <X className="h-4 w-4 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                    </button>
                </div>

                <div className="flex-1 flex">
                    {/* Left sidebar steps */}
                    <aside className="hidden lg:flex w-56 xl:w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-deep)] px-4 xl:px-6 py-4 xl:py-6 space-y-4 xl:space-y-6">
                        <div>
                            <p className="text-[10px] xl:text-xs font-semibold text-[var(--text-muted)] mb-1 xl:mb-2">Your setup journey</p>
                            <p className="text-[10px] xl:text-xs text-[var(--text-secondary)]">Follow the steps to connect, set trading style, and let the agent trade on Avantis (Base).</p>
                        </div>
                        <ol className="space-y-3 xl:space-y-4 text-[10px] xl:text-xs">
                            {stepLabels.map((s) => (
                                <li key={s.key} className="flex items-start gap-2 xl:gap-3">
                                    <span className={`flex h-5 w-5 xl:h-6 xl:w-6 items-center justify-center rounded-full border text-[8px] xl:text-[10px] font-bold ${step === s.key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{s.num}</span>
                                    <div><p className="font-semibold">{s.title}</p><p className="text-[8px] xl:text-[10px] text-[var(--text-muted)]">{s.desc}</p></div>
                                </li>
                            ))}
                        </ol>
                    </aside>

                    {/* Main content */}
                    <div className="flex-1 p-2 sm:p-3 md:p-4 lg:p-6 space-y-2 sm:space-y-3 md:space-y-4 overflow-y-auto custom-scrollbar min-h-0"
                        onWheelCapture={(e) => { const el = e.currentTarget; const isScrollable = el.scrollHeight > el.clientHeight; const isAtTop = el.scrollTop === 0; const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1; if (isScrollable && !(isAtTop && e.deltaY < 0) && !(isAtBottom && e.deltaY > 0)) e.stopPropagation(); }}>

                        {showTopUpUI ? (
                            <div className="space-y-3 sm:space-y-4 md:space-y-5">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border border-[var(--accent)] flex items-center justify-center bg-[var(--accent)]/10 flex-shrink-0"><Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent)]" /></div>
                                    <div><h3 className="font-display text-xs sm:text-sm md:text-lg uppercase tracking-tight">Top-up Required</h3><p className="text-[8px] sm:text-[9px] md:text-[10px] text-[var(--text-muted)]">You need more credits to join.</p></div>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3">
                                    <div className="border border-[var(--border)] p-1.5 sm:p-2 md:p-3"><p className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-muted)] uppercase font-bold mb-0.5">Join Cost</p><p className="text-xs sm:text-sm md:text-lg font-display">{totalCost.toFixed(0)} <span className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-secondary)]">CREDS</span></p></div>
                                    <div className="border border-[var(--border)] p-1.5 sm:p-2 md:p-3"><p className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-muted)] uppercase font-bold mb-0.5">Your Balance</p><p className="text-xs sm:text-sm md:text-lg font-display">{creditBalance.toFixed(0)} <span className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--text-secondary)]">CREDS</span></p></div>
                                    <div className="border border-[var(--accent)]/30 p-1.5 sm:p-2 md:p-3 bg-[var(--accent)]/5"><p className="text-[7px] sm:text-[8px] md:text-[9px] text-[var(--accent)] uppercase font-bold mb-0.5">Shortfall</p><p className="text-xs sm:text-sm md:text-lg font-display text-[var(--accent)]">{(totalCost - creditBalance).toFixed(0)} <span className="text-[7px] sm:text-[8px] md:text-[9px]">CREDS</span></p></div>
                                </div>
                                <div className="space-y-2 sm:space-y-3">
                                    <p className="text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-widest uppercase text-[var(--text-secondary)]">Select a Package</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                        {pricingTiers.map((tier) => (
                                            <button key={tier.name} onClick={() => handleBuyCredits(tier)} className="relative text-left p-2.5 sm:p-3 md:p-4 border border-[var(--border)] hover:border-[var(--accent)]/50 bg-[var(--bg-elevated)]/30 transition-all group overflow-hidden">
                                                <p className="text-[7px] sm:text-[8px] font-bold text-[var(--text-muted)] uppercase mb-0.5">{tier.name}</p>
                                                <p className="text-xs sm:text-sm md:text-md font-display text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{tier.credits}</p>
                                                <p className="text-sm sm:text-md md:text-lg font-display text-[var(--accent)] mt-1">{tier.price}</p>
                                                <div className="mt-2 sm:mt-3 flex items-center gap-1 text-[7px] sm:text-[8px] md:text-[9px] font-bold text-[var(--text-muted)]">BUY NOW <ArrowRight className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3" /></div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-[var(--border)]">
                                    <button onClick={() => setShowTopUpUI(false)} className="px-4 sm:px-5 py-2 sm:py-2.5 border border-[var(--border)] text-[var(--text-secondary)] text-[10px] sm:text-xs font-bold hover:text-[var(--text-primary)] transition-colors">CANCEL</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {error && (<div className="flex items-start gap-3 p-4 border border-[var(--danger)] bg-[var(--danger)]/10"><AlertCircle className="w-5 h-5 text-[var(--danger)] flex-shrink-0 mt-0.5" /><span className="text-sm text-[var(--danger)]">{error}</span></div>)}

                                {step === 'connect' ? (
                                    authenticated && user?.wallet?.address ? (
                                        <div className="space-y-3 sm:space-y-4">
                                            <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border border-[var(--accent)]/60 bg-[var(--accent)]/5 rounded">
                                                <div className="w-10 h-10 sm:w-12 sm:h-12 border border-[var(--accent)] flex items-center justify-center bg-[var(--bg-deep)] flex-shrink-0"><Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-[var(--accent)]" /></div>
                                                <div className="flex-1 min-w-0"><p className="text-xs sm:text-sm font-semibold">Wallet connected</p><p className="text-[10px] sm:text-xs text-[var(--text-secondary)] truncate font-mono">{user.wallet.address}</p></div>
                                                <div className="text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 sm:py-1 border border-[var(--accent)] text-[var(--accent)] font-bold whitespace-nowrap">BASE</div>
                                            </div>
                                            <button onClick={() => setStep('preferences')} className="w-full py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors text-sm sm:text-base">Continue</button>
                                        </div>
                                    ) : (
                                        <div className="text-center space-y-4 sm:space-y-6 py-3 sm:py-4">
                                            <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto border border-[var(--accent)] flex items-center justify-center"><Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--accent)]" /></div>
                                            <div><h3 className="font-display text-base sm:text-lg mb-1 sm:mb-2">CONNECT WALLET</h3><p className="text-xs sm:text-sm text-[var(--text-secondary)]">Connect your Base wallet to whitelist the agent</p></div>
                                            <button onClick={handleConnect} className="w-full py-3 sm:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-2"><Wallet className="w-4 h-4 sm:w-5 sm:h-5" /> CONNECT WALLET</button>
                                        </div>
                                    )
                                ) : step === 'preferences' ? (
                                    <div className="space-y-2 sm:space-y-3 md:space-y-4 py-1 sm:py-2">
                                        <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 border border-[var(--accent)] flex items-center justify-center flex-shrink-0"><Zap className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[var(--accent)]" /></div>
                                            <div className="min-w-0 flex-1"><h3 className="font-display text-xs sm:text-sm md:text-lg">Set Your Trading Preferences</h3><p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-muted)]">{firstDeploymentPreferences ? 'Using values from your first deployment.' : 'Configure how this agent should size and filter trades.'}</p></div>
                                        </div>
                                        <div className="border border-[var(--border)] bg-[var(--bg-deep)] flex flex-col max-h-[55vh] sm:max-h-[60vh]">
                                            {loadingFirstDeploymentPreferences ? (
                                                <div className="flex items-center justify-center py-12 sm:py-20"><Activity className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--accent)] animate-spin" /></div>
                                            ) : (
                                                <TradingPreferencesForm userWallet={user?.wallet?.address || ''} onClose={onClose} onBack={goBack} localOnly={true} onSaveLocal={handlePreferencesSet} primaryLabel="Save and Next" initialPreferences={tradingPreferencesRef.current || firstDeploymentPreferences || tradingPreferences || undefined} onNext={handlePreferencesNext} nextDisabled={loading} nextLoading={loading} />
                                            )}
                                        </div>
                                    </div>
                                ) : step === 'agent' ? (
                                    <div className="space-y-4 sm:space-y-5 md:space-y-6 py-2 sm:py-3 md:py-4">
                                        <div><h3 className="font-display text-lg sm:text-xl md:text-2xl mb-1 sm:mb-2">Assign Agent Wallet</h3><p className="text-xs sm:text-sm text-[var(--text-secondary)]">Generate a unique agent wallet address for Avantis (Base).</p></div>
                                        {loading ? (
                                            <div className="text-center space-y-3 sm:space-y-4 py-6 sm:py-8"><Activity className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto text-[var(--accent)] animate-pulse" /><div><h3 className="font-display text-sm sm:text-base md:text-lg mb-1 sm:mb-2">ASSIGNING AGENT...</h3></div></div>
                                        ) : agentAddress ? (
                                            <div className="border border-[var(--accent)]/60 bg-[var(--accent)]/5 p-3 sm:p-4 rounded"><p className="text-[10px] sm:text-xs font-semibold text-[var(--accent)] mb-1 sm:mb-2 uppercase">Agent Address Assigned</p><p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)] font-mono break-all">{agentAddress}</p></div>
                                        ) : (
                                            <div className="border border-[var(--border)] p-3 sm:p-4 rounded"><p className="text-xs sm:text-sm text-[var(--text-secondary)]">Generating your agent wallet address...</p></div>
                                        )}
                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-end">
                                            <button onClick={goBack} disabled={loading} className="w-full sm:w-auto px-3 sm:px-4 py-2 sm:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm">Back</button>
                                            {agentAddress && (<button onClick={() => setStep('approvals')} className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">Next <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" /></button>)}
                                        </div>
                                    </div>
                                ) : step === 'approvals' ? (
                                    <div className="space-y-4 sm:space-y-5 md:space-y-6">
                                        <div><h3 className="font-display text-base sm:text-lg md:text-2xl mb-1 sm:mb-2">Enable 1-Click Trading</h3><p className="text-[10px] sm:text-xs md:text-sm text-[var(--text-secondary)]">Enable gasless transactions and 1-click trading on Avantis (Base).</p></div>
                                        <div className="space-y-2 sm:space-y-3 md:space-y-4">
                                            <div><p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-[var(--text-muted)] mb-1 sm:mb-2">STEPS</p><p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)] mb-2 sm:mb-3 md:mb-4">Sign the following wallet requests.</p></div>
                                            {/* Step 1: Delegation */}
                                            <div className="flex items-start gap-2 sm:gap-3 md:gap-4 p-2.5 sm:p-3 md:p-4 border border-[var(--border)] rounded">
                                                <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded border-2 flex items-center justify-center flex-shrink-0 ${delegateApproved ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--bg-deep)]'}`}>
                                                    {checkingApprovalStatus && delegationStatus === null ? <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--text-muted)] animate-spin" /> : delegateApproved ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent)]" /> : <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 border-2 border-[var(--text-muted)] rounded" />}
                                                </div>
                                                <div className="flex-1 min-w-0"><p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-[var(--text-muted)] mb-0.5 sm:mb-1">ENABLE ACCOUNT DELEGATION</p><p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)]">Delegate signatures to a smart wallet.</p></div>
                                            </div>
                                            {/* Step 2: USDC */}
                                            <div className="flex items-start gap-2 sm:gap-3 md:gap-4 p-2.5 sm:p-3 md:p-4 border border-[var(--border)] rounded">
                                                <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded border-2 flex items-center justify-center flex-shrink-0 ${usdcApproved ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--bg-deep)]'}`}>
                                                    {checkingApprovalStatus && usdcAllowanceStatus === null ? <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--text-muted)] animate-spin" /> : usdcApproved ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent)]" /> : <span className="text-[10px] sm:text-xs md:text-sm font-bold text-[var(--text-muted)]">2</span>}
                                                </div>
                                                <div className="flex-1 min-w-0"><p className="text-[9px] sm:text-[10px] md:text-xs font-semibold text-[var(--text-muted)] mb-0.5 sm:mb-1">SET ALLOWANCE</p><p className="text-[9px] sm:text-[10px] md:text-xs text-[var(--text-secondary)]">Set the maximum USDC allowance for Avantis.</p></div>
                                            </div>
                                        </div>
                                        {txHash && (<div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-2.5 sm:p-3 rounded"><p className="text-[var(--accent)] text-xs sm:text-sm mb-1 sm:mb-2">✓ Transaction confirmed</p><a href={`${blockExplorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] sm:text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1">View on BaseScan <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" /></a></div>)}
                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                                            <button onClick={goBack} disabled={loading || checkingApprovalStatus} className="w-full sm:w-32 py-2 sm:py-2.5 md:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm">Back</button>
                                            {delegateApproved && usdcApproved ? (
                                                <button onClick={() => setStep('complete')} className="flex-1 py-2.5 sm:py-3 md:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm"><CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" /> Next <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" /></button>
                                            ) : (
                                                <button onClick={enableOneClickTrading} disabled={loading || checkingApprovalStatus} className="flex-1 py-2.5 sm:py-3 md:py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">
                                                    {checkingApprovalStatus ? (<><Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 animate-spin" /><span className="hidden sm:inline">CHECKING STATUS...</span><span className="sm:hidden">CHECKING...</span></>) : loading ? (<><Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 animate-pulse" /> SIGNING...</>) : (<><span className="hidden sm:inline">ENABLE 1-CLICK TRADING</span><span className="sm:hidden">ENABLE TRADING</span></>)}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : deploymentId ? (
                                    <div className="text-center space-y-4 sm:space-y-5 md:space-y-6 py-3 sm:py-4">
                                        <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto border border-[var(--accent)] bg-[var(--accent)] flex items-center justify-center"><CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[var(--bg-deep)]" /></div>
                                        <div><h3 className="font-display text-lg sm:text-xl mb-1 sm:mb-2">AGENT DEPLOYED</h3><p className="text-xs sm:text-sm text-[var(--text-secondary)] px-2">Agent is now live and ready to trade on Avantis (Base)</p></div>
                                        <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3 sm:p-4 space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-left">
                                            {['Agent whitelisted', 'USDC approved', 'Agent deployed and active', 'Ready to execute signals'].map((t) => (<div key={t} className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] flex-shrink-0" /><span>{t}</span></div>))}
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                                            <button onClick={goBack} className="w-full sm:w-auto px-4 py-2.5 sm:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm">Back</button>
                                            <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors text-xs sm:text-sm">Close</button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Complete step - Join Agent */
                                    <div className="text-center space-y-4 sm:space-y-5 md:space-y-6 py-3 sm:py-4">
                                        <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 mx-auto border border-[var(--accent)] flex items-center justify-center"><Zap className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-[var(--accent)]" /></div>
                                        <div><h3 className="font-display text-lg sm:text-xl mb-1 sm:mb-2">AGENT LIVE</h3><p className="text-xs sm:text-sm text-[var(--text-secondary)] px-2">All approvals complete. Ready to deploy on Avantis.</p></div>
                                        <div className="border border-[var(--border)] bg-[var(--bg-deep)]/50 p-3 sm:p-4 space-y-3 sm:space-y-4 text-left">
                                            <div className="flex items-center justify-between"><p className="text-[10px] sm:text-xs font-bold text-[var(--accent)] uppercase tracking-widest">Setup Complete</p><div className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)]" /><span className="text-[9px] sm:text-[10px] text-[var(--text-muted)] font-bold">READY TO ACTIVATE</span></div></div>
                                            <div className="space-y-1.5 sm:space-y-2">
                                                <div className="flex items-center gap-2 py-0.5"><div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full flex-shrink-0" /><span className="text-[10px] sm:text-xs text-[var(--text-secondary)]">Agent whitelisted & assigned</span></div>
                                                <div className="flex items-center gap-2 py-0.5"><div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full flex-shrink-0" /><span className="text-[10px] sm:text-xs text-[var(--text-secondary)]">USDC approved (Non-custodial)</span></div>
                                            </div>
                                            {totalCost > 0 && (
                                                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-[var(--border)]">
                                                    <div className="flex items-center justify-between mb-2"><p className="text-[10px] sm:text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Credit Summary</p><span className={`text-[9px] sm:text-[10px] px-2 py-0.5 border font-bold rounded ${isCreator ? 'border-green-500/30 text-green-500' : 'border-[var(--accent)]/30 text-[var(--accent)]'}`}>{isCreator ? 'CREATOR - FREE ACCESS' : 'PAID ACCESS'}</span></div>
                                                    {!isCreator && (
                                                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                                            <div className="space-y-1"><p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase">Cost to Join</p><p className="text-lg sm:text-xl font-display">{totalCost.toFixed(0)} <span className="text-[9px] sm:text-[10px] text-[var(--text-secondary)]">CREDS</span></p></div>
                                                            <div className="space-y-1 text-right"><p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase">Your Balance</p><p className={`text-lg sm:text-xl font-display ${creditBalance < totalCost ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{creditBalance.toFixed(0)} <span className="text-[9px] sm:text-[10px] text-[var(--text-secondary)]">CREDS</span></p></div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
                                            <button onClick={goBack} className="w-full sm:w-auto px-4 py-2.5 sm:py-3 border border-[var(--accent)]/60 text-[var(--text-primary)] font-semibold hover:border-[var(--accent)] transition-colors text-xs sm:text-sm">Back</button>
                                            <button onClick={joinAgent} disabled={joiningAgent || (!isCreator && totalCost > 0 && creditBalance < totalCost)} className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs sm:text-sm">
                                                {joiningAgent ? (<><Activity className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> JOINING...</>) : (<><Zap className="w-4 h-4 sm:w-5 sm:h-5" /><span className="hidden sm:inline">{isCreator ? 'JOIN AGENT (FREE)' : totalCost > 0 ? `JOIN AGENT (${totalCost.toFixed(0)} CREDS)` : 'JOIN AGENT (FREE)'}</span><span className="sm:hidden">JOIN AGENT</span></>)}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <PaymentSelectorModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} tier={selectedTier} onSelectPayment={handlePaymentSelection} />
                <Web3CheckoutModal isOpen={isWeb3ModalOpen} onClose={() => setIsWeb3ModalOpen(false)} tier={selectedTier} userWallet={user?.wallet?.address} onSuccess={(hash) => { setIsWeb3ModalOpen(false); setShowTopUpUI(false); loadCreditBalance(); }} />
                {isRedirecting && (
                    <div className="fixed inset-0 z-[200] bg-[var(--bg-deep)]/90 backdrop-blur-xl flex items-center justify-center flex-col gap-4 sm:gap-6 px-4">
                        <Activity className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-[var(--accent)] animate-spin" />
                        <div className="text-center"><h2 className="text-lg sm:text-xl md:text-2xl font-display uppercase tracking-widest text-[var(--accent)] mb-1 sm:mb-2">Redirecting to Secure Payment</h2><p className="text-[var(--text-muted)] text-[10px] sm:text-xs font-bold">PLEASE WAIT · STACK: STRIPE</p></div>
                    </div>
                )}
            </div>
        </div>
    );
}
