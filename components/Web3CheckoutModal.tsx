import React, { useState } from 'react';
import { X, Wallet, Shield, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { ethers } from 'ethers';

interface Web3CheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    tier: {
        name: string;
        price: string;
        credits: string;
    } | null;
    userWallet: string | undefined;
    onSuccess: (txHash: string) => void;
}

// Set this to true for testing on Sepolia, false for Mainnet
const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === 'true';

const NETWORKS = {
    MAINNET: {
        chainId: 42161,
        chainName: 'Arbitrum One',
        usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        explorer: 'https://arbiscan.io'
    },
    TESTNET: {
        chainId: 421614,
        chainName: 'Arbitrum Sepolia',
        usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // Arbitrum Sepolia USDC
        explorer: 'https://sepolia.arbiscan.io'
    }
};

const ACTIVE_NETWORK = IS_TESTNET ? NETWORKS.TESTNET : NETWORKS.MAINNET;
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS;
const USDC_ABI = [
    'function transfer(address to, uint256 amount) external returns (bool)',
];

export function Web3CheckoutModal({
    isOpen,
    onClose,
    tier,
    userWallet,
    onSuccess
}: Web3CheckoutModalProps) {
    const [status, setStatus] = useState<'idle' | 'preparing' | 'signing' | 'pending' | 'verifying' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    if (!isOpen || !tier) return null;

    const handleConfirmPayment = async () => {
        if (!window.ethereum) {
            setError('No wallet detected. Please install MetaMask or similar.');
            setStatus('error');
            return;
        }

        try {
            setStatus('preparing');
            setError(null);

            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const address = await signer.getAddress();

            // Check network
            const { chainId } = await provider.getNetwork();
            if (chainId !== ACTIVE_NETWORK.chainId) {
                setError(`Please switch to ${ACTIVE_NETWORK.chainName} network to pay with USDC.`);
                setStatus('error');
                return;
            }

            const usdcContract = new ethers.Contract(ACTIVE_NETWORK.usdcAddress, [
                ...USDC_ABI,
                'function balanceOf(address account) external view returns (uint256)'
            ], signer);

            // Tier price is like "$19" -> need to parse 19
            const priceValue = tier.price.replace('$', '');
            // const amount = ethers.utils.parseUnits(priceValue, 6); // USDC has 6 decimals
            const amount = IS_TESTNET ? ethers.utils.parseUnits("0.01", 6) : ethers.utils.parseUnits(priceValue, 6); // USDC has 6 decimals

            // PRE-FLIGHT CHECK: Verify Balance
            const balance = await usdcContract.balanceOf(address);
            if (balance.lt(amount)) {
                setError(`Insufficient USDC balance. You have ${ethers.utils.formatUnits(balance, 6)} USDC, but need ${priceValue} USDC.`);
                setStatus('error');
                return;
            }

            // Check ETH for gas - Arbitrum Sepolia needs at least a tiny bit for a transfer
            const ethBalance = await provider.getBalance(address);
            if (ethBalance.lt(ethers.utils.parseEther("0.0001"))) {
                setError('You need at least 0.0001 ETH for gas fees (Arbitrum Sepolia ETH).');
                setStatus('error');
                return;
            }

            console.log('Payment parameters:', {
                to: TREASURY_WALLET,
                amount: amount.toString(),
                from: address,
                usdcAddress: ACTIVE_NETWORK.usdcAddress
            });

            setStatus('signing');

            // Encode the transfer function call
            const transferData = usdcContract.interface.encodeFunctionData('transfer', [TREASURY_WALLET, amount]);

            // Try explicit gas estimation
            let gasLimit;
            try {
                gasLimit = await usdcContract.estimateGas.transfer(TREASURY_WALLET, amount);
                // Add 50% buffer for Arbitrum/L2 variability
                gasLimit = gasLimit.mul(150).div(100);
                console.log('Estimated gas limit with buffer:', gasLimit.toString());
            } catch (estimateErr) {
                console.error('Gas estimation failed:', estimateErr);
                // Fallback to a safe limit if estimation fails
                gasLimit = ethers.BigNumber.from(150000);
                console.log('Using fallback gas limit: 150000');
            }

            // Use manual eth_sendTransaction to bypass ethers.js/MetaMask EIP-1559 compatibility issues
            // which are the most common cause of "Internal JSON-RPC error" on L2s.
            const txHash = await (window as any).ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: address,
                    to: ACTIVE_NETWORK.usdcAddress,
                    data: transferData,
                    gas: gasLimit.toHexString(),
                }],
            });

            console.log('Transaction sent manually:', txHash);
            setStatus('pending');
            setTxHash(txHash);

            // Wait for confirmation using the provider
            await provider.waitForTransaction(txHash);

            // NEW: Verify with Maxxit Backend to assign credits
            setStatus('verifying');
            try {
                const response = await fetch('/api/payments/web3/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        txHash,
                        tierName: tier.name,
                        userWallet
                    }),
                });

                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Verification failed');
                }

                setStatus('success');
                onSuccess(txHash);
            } catch (vErr: any) {
                console.error('Backend Verification Error:', vErr);
                setError(`Transaction confirmed on-chain, but credit assignment failed: ${vErr.message}. Please contact support with your TX hash.`);
                setStatus('error');
            }
        } catch (err: any) {
            console.error('Web3 Payment Error:', err);

            let errorMessage = 'Transaction failed';

            // Exhaustive error message extraction
            if (err?.code === 4001 || err?.message?.toLowerCase().includes('user rejected')) {
                errorMessage = 'Transaction rejected by user';
            } else if (err?.data?.message) {
                errorMessage = err.data.message;
            } else if (err?.error?.message) {
                errorMessage = err.error.message;
            } else if (err?.reason) {
                errorMessage = err.reason;
            } else if (err?.message) {
                errorMessage = err.message;
            }

            // Remove the generic "Internal JSON-RPC error" if we have more specific info
            if (errorMessage.includes('Internal JSON-RPC error') && (err?.data || err?.error)) {
                const deeperError = err?.data?.message || err?.error?.message;
                if (deeperError) errorMessage = deeperError;
            }

            setError(errorMessage);
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-[var(--bg-deep)]/90 backdrop-blur-md" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                            <Wallet className="h-5 w-5 text-[var(--accent)]" />
                        </div>
                        <h2 className="text-xl font-display uppercase tracking-tight">CRYPTO CHECKOUT</h2>
                    </div>
                    {status !== 'pending' && (
                        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                <div className="p-8">
                    {status === 'idle' || status === 'error' ? (
                        <div className="space-y-6">
                            <div className="p-4 bg-[var(--bg-deep)] border border-[var(--border)] space-y-3">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                    <span>Plan</span>
                                    <span>Amount</span>
                                </div>
                                <div className="flex justify-between items-baseline font-display">
                                    <span className="text-xl">{tier.name}</span>
                                    <span className="text-2xl text-[var(--accent)]">{tier.price} USDC</span>
                                </div>
                                <div className="pt-2 border-t border-[var(--border)]/50">
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-tighter">NETWORK: {ACTIVE_NETWORK.chainName}</p>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
                                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                                    <p className="text-xs text-red-200 leading-relaxed">{error}</p>
                                </div>
                            )}

                            <button
                                onClick={handleConfirmPayment}
                                className="w-full py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold tracking-widest hover:bg-[var(--accent-dim)] transition-all flex items-center justify-center gap-2 group"
                            >
                                CONFIRM & SEND USDC
                                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </button>

                            <p className="text-[10px] text-center text-[var(--text-muted)] uppercase tracking-widest">
                                Transaction requires wallet signature
                            </p>
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center text-center space-y-6">
                            {status === 'success' ? (
                                <div className="relative">
                                    <div className="absolute inset-0 bg-[var(--accent)]/20 blur-xl rounded-full" />
                                    <CheckCircle2 className="h-20 w-20 text-[var(--accent)] relative" />
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="absolute inset-0 bg-[var(--accent)]/10 blur-xl rounded-full animate-pulse" />
                                    <Loader2 className="h-20 w-20 text-[var(--accent)] animate-spin relative" />
                                </div>
                            )}

                            <div className="space-y-2">
                                <h3 className="text-xl font-display uppercase">
                                    {status === 'preparing' && 'PREPARING ASSETS'}
                                    {status === 'signing' && 'AWAITING SIGNATURE'}
                                    {status === 'pending' && 'PROTOCOL CONFIRMATION'}
                                    {status === 'verifying' && 'VERIFYING PAYMENT'}
                                    {status === 'success' && 'PAYMENT VERIFIED'}
                                </h3>
                                <p className="text-[var(--text-muted)] text-sm max-w-xs mx-auto">
                                    {status === 'preparing' && 'Initializing transaction parameters...'}
                                    {status === 'signing' && 'Please confirm the transaction in your wallet.'}
                                    {status === 'pending' && 'Broadcasting to Arbitrum network...'}
                                    {status === 'verifying' && 'Backend is confirming transaction and assigning credits...'}
                                    {status === 'success' && 'Credits have been added to your account.'}
                                </p>
                            </div>

                            {txHash && (
                                <a
                                    href={`${ACTIVE_NETWORK.explorer}/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] uppercase font-bold text-[var(--accent)] border border-[var(--accent)]/30 px-3 py-1 hover:bg-[var(--accent)]/5 transition-colors"
                                >
                                    View on {IS_TESTNET ? 'Arbiscan Sepolia' : 'Arbiscan'}
                                </a>
                            )}

                            {status === 'success' && (
                                <button
                                    onClick={onClose}
                                    className="px-8 py-3 bg-[var(--text-primary)] text-[var(--bg-deep)] font-bold text-sm"
                                >
                                    RETURN TO DASHBOARD
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Secure Badge */}
                <div className="p-6 bg-[var(--bg-elevated)]/30 border-t border-[var(--border)] flex items-center justify-center gap-2">
                    <Shield className="h-4 w-4 text-[var(--text-muted)]" />
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">SMART CONTRACT SECURED TRANSFERS</p>
                </div>
            </div>
        </div>
    );
}
