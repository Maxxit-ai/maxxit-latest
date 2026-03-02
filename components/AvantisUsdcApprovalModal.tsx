/**
 * Avantis USDC Approval Modal - For approving USDC spending on Avantis (Base chain)
 * USDC allowance must be set by the main wallet, not the delegate
 */

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { X, Wallet, CheckCircle, AlertCircle, Activity, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import { getAvantisConfig } from '../lib/avantis-config';

interface AvantisUsdcApprovalModalProps {
    onClose: () => void;
    onSuccess?: () => void;
}

const {
    usdcContract: USDC_TOKEN,
    tradingStorageContract: AVANTIS_STORAGE,
    chainId: BASE_CHAIN_ID,
    blockExplorerUrl,
    chainName
} = getAvantisConfig();

const USDC_ABI = [
    'function approve(address spender, uint256 amount) public returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

export function AvantisUsdcApprovalModal({
    onClose,
    onSuccess,
}: AvantisUsdcApprovalModalProps) {
    const { authenticated, user, login } = usePrivy();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [step, setStep] = useState<'connect' | 'approve' | 'complete'>('connect');

    useEffect(() => {
        if (authenticated && user?.wallet?.address && step === 'connect') {
            setStep('approve');
        }
    }, [authenticated, user?.wallet?.address, step]);

    const approveUsdc = async () => {
        console.log('[AvantisUsdcApproval] approveUsdc called - starting USDC approval flow');
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
            if (network.chainId !== BASE_CHAIN_ID) {
                throw new Error(`Please switch to ${chainName}`);
            }

            const signer = ethersProvider.getSigner();
            const usdcContract = new ethers.Contract(USDC_TOKEN, USDC_ABI, signer);

            const currentAllowanceStorage = await usdcContract.allowance(user.wallet.address, AVANTIS_STORAGE);
            const allowanceAmount = ethers.utils.parseUnits('1000000', 6);

            const storageAllowance = parseFloat(ethers.utils.formatUnits(currentAllowanceStorage, 6));
            const requiredAmount = parseFloat(ethers.utils.formatUnits(allowanceAmount, 6));

            console.log('[AvantisUsdcApproval] USDC Approval Check:');
            console.log('  Storage allowance:', storageAllowance, 'USDC');
            console.log('  Required amount:', requiredAmount, 'USDC');

            const MIN_REQUIRED_APPROVAL = 100; // $100 minimum to skip
            const needsStorageApproval = storageAllowance < MIN_REQUIRED_APPROVAL;

            console.log('  Needs Storage approval:', needsStorageApproval, `(current: ${storageAllowance}, required: ${MIN_REQUIRED_APPROVAL})`);

            if (!needsStorageApproval) {
                console.log('[AvantisUsdcApproval] USDC already sufficiently approved, skipping to complete');
                setStep('complete');

                if (onSuccess) {
                    onSuccess();
                }
                return;
            }

            console.log('[AvantisUsdcApproval] USDC approval needed, proceeding with transaction');

            const approveData = usdcContract.interface.encodeFunctionData('approve', [AVANTIS_STORAGE, allowanceAmount]);
            const gasEstimate = await ethersProvider.estimateGas({
                to: USDC_TOKEN,
                from: user.wallet.address,
                data: approveData,
            });

            const gasWithBuffer = gasEstimate.mul(150).div(100);
            console.log(`[AvantisUsdcApproval] USDC Storage approval - Gas estimate: ${gasEstimate.toString()}, with 50% buffer: ${gasWithBuffer.toString()}`);

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

            setStep('complete');

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
                e.stopPropagation();
            }}
        >
            <div className="bg-[var(--bg-deep)] border border-[var(--border)] max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden overscroll-contain">
                {/* Header */}
                <div className="border-b border-[var(--border)] p-6 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 border border-[var(--accent)] flex items-center justify-center">
                                <Wallet className="h-5 w-5 text-[var(--accent)]" />
                            </div>
                            <div>
                                <h2 className="font-display text-xl">APPROVE USDC</h2>
                                <p className="text-xs text-[var(--text-muted)]">Avantis Storage (Base)</p>
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
                <div
                    className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar min-h-0"
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
                            <div className="text-center space-y-4 py-8">
                                <Activity className="w-16 h-16 mx-auto text-[var(--accent)] animate-pulse" />
                                <div>
                                    <h3 className="font-display text-lg mb-2">INITIALIZING...</h3>
                                    <p className="text-sm text-[var(--text-muted)]">
                                        Setting up USDC approval
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-6 py-4">
                                <div className="w-16 h-16 mx-auto border border-[var(--accent)] flex items-center justify-center">
                                    <Wallet className="w-8 h-8 text-[var(--accent)]" />
                                </div>
                                <div>
                                    <h3 className="font-display text-lg mb-2">CONNECT WALLET</h3>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        Connect your Base wallet to approve USDC spending
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
                    ) : step === 'approve' ? (
                        <>
                            <div className="border border-[var(--border)] p-4 space-y-3 text-sm">
                                <p className="font-bold">APPROVE USDC SPENDING</p>
                                <div className="flex items-start gap-2 text-[var(--text-secondary)]">
                                    <span className="text-[var(--accent)]">→</span>
                                    <span>Sign transaction to approve USDC spending on Avantis</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mt-3">
                                    This allows Avantis to use your USDC for trading on Base.
                                </p>
                            </div>

                            <div className="border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
                                <strong className="text-[var(--text-primary)]">TIP:</strong> We&apos;re approving $1M to prevent repeated approvals.
                            </div>

                            {txHash && (
                                <div className="border border-[var(--accent)] bg-[var(--accent)]/5 p-3">
                                    <p className="text-[var(--accent)] text-sm mb-2">✓ Transaction confirmed</p>
                                    <a
                                        href={`${blockExplorerUrl}/tx/${txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                                    >
                                        View on Explorer <ExternalLink className="w-3 h-3" />
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
                                <h3 className="font-display text-xl mb-2">USDC APPROVED</h3>
                                <p className="text-sm text-[var(--text-secondary)]">
                                    Your USDC is now approved for trading on Avantis
                                </p>
                            </div>

                            {txHash && (
                                <a
                                    href={`${blockExplorerUrl}/tx/${txHash}`}
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
                                    <span>USDC approved</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-[var(--accent)]" />
                                    <span>Ready for trading</span>
                                </div>
                            </div>

                            <button
                                onClick={onClose}
                                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
                            >
                                DONE
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
