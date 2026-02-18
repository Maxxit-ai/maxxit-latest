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
import { ethers } from 'ethers';

export function useWalletProvider() {
    const { wallets } = useWallets();

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

    return {
        wallets,
        getEip1193Provider,
        getProvider,
        getSigner,
    };
}
