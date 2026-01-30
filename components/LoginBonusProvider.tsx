import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface LoginBonusContextType {
    bonusClaimed: boolean | null; // null = not checked yet, true = claimed, false = not claimed
    isClaimingBonus: boolean;
    bonusAmount: { credits: number; trades: number } | null;
    showWelcomeModal: boolean;
    dismissWelcomeModal: () => void;
}

const LoginBonusContext = createContext<LoginBonusContextType>({
    bonusClaimed: null,
    isClaimingBonus: false,
    bonusAmount: null,
    showWelcomeModal: false,
    dismissWelcomeModal: () => { }
});

export const useLoginBonus = () => useContext(LoginBonusContext);

const LOCAL_STORAGE_KEY = 'maxxit_login_bonus_claimed';
const MODAL_DISMISSED_KEY = 'maxxit_welcome_modal_dismissed';

interface Props {
    children: ReactNode;
}

/**
 * LoginBonusProvider
 * 
 * Centralized component that watches for wallet connections and
 * automatically claims the login bonus (100 credits + 10 trades)
 * for new users.
 * 
 * Uses localStorage to prevent redundant API calls for the same wallet
 * in the same browser session.
 */
export function LoginBonusProvider({ children }: Props) {
    const { authenticated, user, ready } = usePrivy();
    const [bonusClaimed, setBonusClaimed] = useState<boolean | null>(null);
    const [isClaimingBonus, setIsClaimingBonus] = useState(false);
    const [bonusAmount, setBonusAmount] = useState<{ credits: number; trades: number } | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);

    const dismissWelcomeModal = useCallback(() => {
        setShowWelcomeModal(false);
        // Mark modal as dismissed in localStorage to prevent showing again
        if (user?.wallet?.address) {
            localStorage.setItem(`${MODAL_DISMISSED_KEY}_${user.wallet.address.toLowerCase()}`, 'true');
        }
    }, [user?.wallet?.address]);

    const claimBonus = useCallback(async (walletAddress: string) => {
        // Check localStorage to avoid redundant API calls
        const claimed = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${walletAddress.toLowerCase()}`);
        if (claimed === 'true') {
            setBonusClaimed(true);
            return;
        }

        setIsClaimingBonus(true);
        try {
            const response = await fetch('/api/user/claim-login-bonus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress })
            });

            const data = await response.json();

            if (data.success) {
                // Mark as claimed in localStorage to prevent future calls
                localStorage.setItem(`${LOCAL_STORAGE_KEY}_${walletAddress.toLowerCase()}`, 'true');
                setBonusClaimed(true);

                if (!data.alreadyClaimed && data.creditsGranted && data.tradesGranted) {
                    setBonusAmount({ credits: data.creditsGranted, trades: data.tradesGranted });
                    console.log(`[LoginBonus] New user bonus claimed: ${data.creditsGranted} credits, ${data.tradesGranted} trades`);

                    // Show welcome modal for new users (only if not already dismissed)
                    const modalDismissed = localStorage.getItem(`${MODAL_DISMISSED_KEY}_${walletAddress.toLowerCase()}`);
                    if (!modalDismissed) {
                        setShowWelcomeModal(true);
                    }
                }
            }
        } catch (error) {
            console.error('[LoginBonus] Failed to claim bonus:', error);
        } finally {
            setIsClaimingBonus(false);
        }
    }, []);

    useEffect(() => {
        // Wait for Privy to be ready
        if (!ready) return;

        // Only proceed if authenticated and has wallet
        if (!authenticated || !user) {
            setBonusClaimed(null);
            return;
        }

        // Get wallet address from Privy user
        const walletAddress = user.wallet?.address;
        if (!walletAddress) return;

        // Claim bonus for this wallet
        claimBonus(walletAddress);
    }, [ready, authenticated, user, claimBonus]);

    return (
        <LoginBonusContext.Provider value={{
            bonusClaimed,
            isClaimingBonus,
            bonusAmount,
            showWelcomeModal,
            dismissWelcomeModal
        }}>
            {children}
        </LoginBonusContext.Provider>
    );
}
