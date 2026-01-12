/**
 * TradeQuotaService
 * 
 * Manages user trade quotas - minting, using, and checking available trades.
 * Used by signal-generator-worker to verify quota before creating signals.
 */

import { prisma } from './index';

export class TradeQuotaService {
    /**
     * Mint trade quota to a user on purchase
     * Updates: trades_total += trades, trades_remaining += trades
     */
    static async mintTradeQuota(
        userWallet: string,
        trades: number,
        referenceId?: string
    ) {
        const normalizedWallet = userWallet.toLowerCase().trim();

        // @ts-ignore - user_trade_quota may not be in types yet
        const quota = await prisma.user_trade_quota.upsert({
            where: { user_wallet: normalizedWallet },
            update: {
                trades_total: { increment: trades },
                trades_remaining: { increment: trades }
            },
            create: {
                user_wallet: normalizedWallet,
                trades_total: trades,
                trades_used: 0,
                trades_remaining: trades
            }
        });

        console.log(`[TradeQuota] Minted ${trades} trades to ${normalizedWallet}. Total: ${quota.trades_total}, Remaining: ${quota.trades_remaining}`);
        return quota;
    }

    /**
     * Use one trade from user's quota
     * Updates: trades_used += 1, trades_remaining -= 1
     * Returns true if successful, throws if insufficient quota
     */
    static async useTradeQuota(userWallet: string): Promise<boolean> {
        const normalizedWallet = userWallet.toLowerCase().trim();
        console.log(`[TradeQuota] Using trade quota for ${normalizedWallet}`);
        // @ts-ignore - user_trade_quota may not be in types yet
        const quota = await prisma.user_trade_quota.findUnique({
            where: { user_wallet: normalizedWallet }
        });

        if (!quota) {
            throw new Error('No trade quota found for this wallet');
        }

        if (quota.trades_remaining <= 0) {
            throw new Error('Insufficient trade quota');
        }

        // @ts-ignore
        await prisma.user_trade_quota.update({
            where: { user_wallet: normalizedWallet },
            data: {
                trades_used: { increment: 1 },
                trades_remaining: { decrement: 1 }
            }
        });

        return true;
    }

    /**
     * Get user's trade quota info
     * Returns all three fields: trades_total, trades_used, trades_remaining
     */
    static async getTradeQuota(userWallet: string) {
        const normalizedWallet = userWallet.toLowerCase().trim();

        // @ts-ignore
        const quota = await prisma.user_trade_quota.findUnique({
            where: { user_wallet: normalizedWallet }
        });

        if (!quota) {
            return { trades_total: 0, trades_used: 0, trades_remaining: 0 };
        }

        return {
            trades_total: quota.trades_total,
            trades_used: quota.trades_used,
            trades_remaining: quota.trades_remaining
        };
    }

    /**
     * Check if user has available trades
     */
    static async hasAvailableTrades(userWallet: string): Promise<boolean> {
        const quota = await this.getTradeQuota(userWallet);
        return quota.trades_remaining > 0;
    }
}
