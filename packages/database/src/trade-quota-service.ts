/**
 * TradeQuotaService
 *
 * Manages user trade quotas - minting, using, and checking available trades.
 * Used by signal-generator-worker to verify quota before creating signals.
 *
 * IMPORTANT: Use reserveTradeQuota() for atomic check-and-deduct operations
 * to prevent race conditions when multiple workers process signals in parallel.
 */

import { prisma } from "./index";
import { Prisma } from "@prisma/client";

export interface QuotaReservationResult {
  success: boolean;
  remaining: number;
  message: string;
}

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
        trades_remaining: { increment: trades },
      },
      create: {
        user_wallet: normalizedWallet,
        trades_total: trades,
        trades_used: 0,
        trades_remaining: trades,
      },
    });

    console.log(
      `[TradeQuota] Minted ${trades} trades to ${normalizedWallet}. Total: ${quota.trades_total}, Remaining: ${quota.trades_remaining}`
    );
    return quota;
  }

  /**
   * ATOMIC: Reserve one trade quota (check and deduct in single operation)
   *
   * This method uses a database-level atomic update with a WHERE condition
   * to prevent race conditions when multiple workers check quota simultaneously.
   *
   * The UPDATE only succeeds if trades_remaining > 0, preventing negative balances.
   *
   * @param userWallet - The user's wallet address
   * @returns QuotaReservationResult with success status and remaining count
   */
  static async reserveTradeQuota(
    userWallet: string
  ): Promise<QuotaReservationResult> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    try {
      // Atomic update: only deduct if trades_remaining > 0
      // This prevents race conditions - the WHERE clause ensures we only update
      // if there's actually quota available
      const result = await prisma.$executeRaw`
                UPDATE user_trade_quota 
                SET trades_used = trades_used + 1,
                    trades_remaining = trades_remaining - 1,
                    updated_at = NOW()
                WHERE user_wallet = ${normalizedWallet} 
                AND trades_remaining > 0
            `;

      if (result === 0) {
        // No rows updated - either wallet doesn't exist or insufficient quota
        const quota = await this.getTradeQuota(normalizedWallet);

        if (quota.trades_total === 0) {
          return {
            success: false,
            remaining: 0,
            message: "No trade quota found for this wallet",
          };
        }

        return {
          success: false,
          remaining: quota.trades_remaining,
          message: "Insufficient trade quota",
        };
      }

      // Successfully reserved
      const quota = await this.getTradeQuota(normalizedWallet);
      console.log(
        `[TradeQuota] Reserved 1 trade for ${normalizedWallet.substring(
          0,
          10
        )}... Remaining: ${quota.trades_remaining}`
      );

      return {
        success: true,
        remaining: quota.trades_remaining,
        message: "Trade quota reserved successfully",
      };
    } catch (error: any) {
      console.error(
        `[TradeQuota] Error reserving quota for ${normalizedWallet}:`,
        error.message
      );
      return {
        success: false,
        remaining: 0,
        message: `Error reserving quota: ${error.message}`,
      };
    }
  }

  /**
   * Use one trade from user's quota
   * Updates: trades_used += 1, trades_remaining -= 1
   * Returns true if successful, throws if insufficient quota
   *
   * @deprecated Use reserveTradeQuota() instead for atomic operations
   */
  static async useTradeQuota(userWallet: string): Promise<boolean> {
    const normalizedWallet = userWallet.toLowerCase().trim();
    console.log(`[TradeQuota] Using trade quota for ${normalizedWallet}`);
    // @ts-ignore - user_trade_quota may not be in types yet
    const quota = await prisma.user_trade_quota.findUnique({
      where: { user_wallet: normalizedWallet },
    });

    if (!quota) {
      throw new Error("No trade quota found for this wallet");
    }

    if (quota.trades_remaining <= 0) {
      throw new Error("Insufficient trade quota");
    }

    // @ts-ignore
    await prisma.user_trade_quota.update({
      where: { user_wallet: normalizedWallet },
      data: {
        trades_used: { increment: 1 },
        trades_remaining: { decrement: 1 },
      },
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
      where: { user_wallet: normalizedWallet },
    });

    if (!quota) {
      return { trades_total: 0, trades_used: 0, trades_remaining: 0 };
    }

    return {
      trades_total: quota.trades_total,
      trades_used: quota.trades_used,
      trades_remaining: quota.trades_remaining,
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
