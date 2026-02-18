/**
 * Unified Wallet Provider Hook
 * 
 * Provides a single interface to get an EIP-1193 provider and ethers.js
 * Provider/Signer that works with both:
 * - External wallets (MetaMask, etc.) via window.ethereum
 * - Privy embedded wallets (for email-login users)
 * 
 * Usage:
 *   const { getEip1193Provider, getProvider, getSigner } = useWalletProvider();
 *   const signer = await getSigner();
 */

import { useWallets } from '@privy-io/react-auth';
import { useCrossAppAccounts, usePrivy } from '@privy-io/react-auth';
import { ethers } from 'ethers';

type WalletSource = 'cross_app' | 'embedded' | 'connected_wallet' | 'injected' | 'none';
type WalletTxRequest = {
    to: string;
    chainId: number;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
    nonce?: number;
};

export function useWalletProvider() {
    const { user } = usePrivy();
    const { sendTransaction: sendCrossAppTransaction } = useCrossAppAccounts();
    const { wallets } = useWallets();
    const crossAppProviderId = process.env.NEXT_PUBLIC_PRIVY_PROVIDER_APP_ID;

    const crossAppAccount = user?.linkedAccounts?.find((account: any) => {
        return account?.type === 'cross_app' && (!crossAppProviderId || account?.providerApp?.id === crossAppProviderId);
    }) as any;

    const crossAppEmbeddedWalletAddress = crossAppAccount?.embeddedWallets?.[0]?.address || null;
    const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === 'privy') || null;
    const firstConnectedWallet = wallets[0] || null;
    const resolvedWalletAddress =
        crossAppEmbeddedWalletAddress ||
        embeddedWallet?.address ||
        firstConnectedWallet?.address ||
        user?.wallet?.address ||
        null;
    const walletSource: WalletSource = crossAppEmbeddedWalletAddress
        ? 'cross_app'
        : embeddedWallet
            ? 'embedded'
            : firstConnectedWallet
                ? 'connected_wallet'
                : typeof window !== 'undefined' && (window as any).ethereum
                    ? 'injected'
                    : 'none';

    /**
     * Returns the raw EIP-1193 provider.
     * Prefers the Privy embedded wallet, falls back to the first connected wallet,
     * then finally falls back to window.ethereum (MetaMask/injected).
     */
    const getEip1193Provider = async () => {
        // Try Privy wallets first (handles both embedded + external wallets)
        if (wallets.length > 0) {
            // Prefer the embedded wallet if available, otherwise use the first wallet
            const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];
            if (wallet) {
                return await wallet.getEthereumProvider();
            }
        }

        // Fallback to injected provider (MetaMask, etc.)
        if (typeof window !== 'undefined' && (window as any).ethereum) {
            return (window as any).ethereum;
        }

        throw new Error('No wallet provider found. Please connect your wallet.');
    };

    /**
     * Returns an ethers.js Web3Provider wrapping the EIP-1193 provider.
     */
    const getProvider = async (): Promise<ethers.providers.Web3Provider> => {
        const eip1193 = await getEip1193Provider();
        return new ethers.providers.Web3Provider(eip1193);
    };

    /**
     * Returns an ethers.js Signer from the connected wallet.
     */
    const getSigner = async (): Promise<ethers.Signer> => {
        const provider = await getProvider();
        return provider.getSigner();
    };

    const toBigIntIfHex = (value?: string): bigint | undefined => {
        if (!value) return undefined;
        try {
            return BigInt(value);
        } catch {
            return undefined;
        }
    };

    const sendWalletTransaction = async (request: WalletTxRequest): Promise<string> => {
        if (!resolvedWalletAddress) {
            throw new Error('No resolved wallet address available.');
        }

        if (walletSource === 'cross_app') {
            const txHash = await sendCrossAppTransaction(
                {
                    chainId: request.chainId,
                    to: request.to,
                    data: request.data || '0x',
                    value: toBigIntIfHex(request.value) ?? 0n,
                    gasLimit: toBigIntIfHex(request.gasLimit),
                    gasPrice: toBigIntIfHex(request.gasPrice),
                    nonce: request.nonce,
                },
                { address: resolvedWalletAddress }
            );
            return txHash;
        }

        const provider = await getEip1193Provider();
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [
                {
                    from: resolvedWalletAddress,
                    to: request.to,
                    data: request.data || '0x',
                    ...(request.value ? { value: request.value } : {}),
                    ...(request.gasLimit ? { gas: request.gasLimit } : {}),
                    ...(request.gasPrice ? { gasPrice: request.gasPrice } : {}),
                    ...(typeof request.nonce === 'number' ? { nonce: ethers.utils.hexValue(request.nonce) } : {}),
                },
            ],
        });
        return txHash;
    };

    const waitForTransaction = async (
        txHash: string,
        rpcUrl: string
    ): Promise<ethers.providers.TransactionReceipt | null> => {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        return provider.waitForTransaction(txHash);
    };

    return {
        wallets,
        user,
        crossAppAccount,
        crossAppEmbeddedWalletAddress,
        resolvedWalletAddress,
        walletSource,
        providerAppIdMatched: Boolean(crossAppAccount),
        getEip1193Provider,
        getProvider,
        getSigner,
        sendWalletTransaction,
        waitForTransaction,
        isCrossAppExecution: walletSource === 'cross_app',
    };
}
