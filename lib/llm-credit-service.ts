import { prisma, withTransaction } from './prisma';

export type LLMCreditEntryType = 'PURCHASE' | 'USAGE' | 'PLAN_GRANT' | 'ADJUSTMENT';

/**
 * LLM Credit Ledger Entry
 */
export interface LLMCreditLedgerEntry {
  id: string;
  user_wallet: string;
  amount_cents: number;
  entry_type: LLMCreditEntryType;
  purpose: string;
  reference_id?: string;
  metadata?: any;
  created_at: Date;
}

/**
 * LLM Credit Balance
 */
export interface LLMCreditBalance {
  balanceCents: number;
  totalPurchased: number;
  totalUsed: number;
  limitReached: boolean;
}


export const LLMCreditService = {
  async addCredits(
    userWallet: string,
    amountCents: number,
    purpose: string,
    referenceId?: string,
    metadata?: any,
    entryType: LLMCreditEntryType = 'PURCHASE'
  ): Promise<LLMCreditLedgerEntry> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    if (amountCents <= 0) {
      throw new Error('Amount must be positive');
    }

    return await withTransaction(async (tx) => {
      if (referenceId) {
        const existing = await tx.llm_credit_ledger.findUnique({
          where: { reference_id: referenceId }
        });
        if (existing) {
          return existing as LLMCreditLedgerEntry;
        }
      }

      const ledgerEntry = await tx.llm_credit_ledger.create({
        data: {
          user_wallet: normalizedWallet,
          amount_cents: amountCents,
          entry_type: entryType,
          purpose,
          reference_id: referenceId,
          metadata
        }
      });

      await tx.llm_credit_balance.upsert({
        where: { user_wallet: normalizedWallet },
        update: {
          balance_cents: { increment: amountCents },
          total_purchased: { increment: amountCents }
        },
        create: {
          user_wallet: normalizedWallet,
          balance_cents: amountCents,
          total_purchased: amountCents,
          total_used: 0
        }
      });

      return ledgerEntry as LLMCreditLedgerEntry;
    });
  },

  async deductCredits(
    userWallet: string,
    amountCents: number,
    purpose: string,
    referenceId?: string
  ): Promise<LLMCreditLedgerEntry> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    if (amountCents <= 0) {
      throw new Error('Amount must be positive');
    }

    return await withTransaction(async (tx) => {
      if (referenceId) {
        const existing = await tx.llm_credit_ledger.findUnique({
          where: { reference_id: referenceId }
        });
        if (existing) {
          return existing as LLMCreditLedgerEntry;
        }
      }

      const balance = await tx.llm_credit_balance.findUnique({
        where: { user_wallet: normalizedWallet }
      });

      const currentBalance = balance?.balance_cents || 0;

      if (currentBalance < amountCents) {
        throw new Error(
          `Insufficient LLM credit balance. Required: ${amountCents}¢, Available: ${currentBalance}¢`
        );
      }

      const ledgerEntry = await tx.llm_credit_ledger.create({
        data: {
          user_wallet: normalizedWallet,
          amount_cents: -amountCents,
          entry_type: 'USAGE',
          purpose,
          reference_id: referenceId
        }
      });

      await tx.llm_credit_balance.update({
        where: { user_wallet: normalizedWallet },
        data: {
          balance_cents: { decrement: amountCents },
          total_used: { increment: amountCents }
        }
      });

      return ledgerEntry as LLMCreditLedgerEntry;
    });
  },

  /**
   * Get current LLM credit balance for a user
   *
   * @param userWallet - User's wallet address
   * @returns Balance information including limit reached flag
   */
  async getBalance(userWallet: string): Promise<LLMCreditBalance> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    let balance = await prisma.llm_credit_balance.findUnique({
      where: { user_wallet: normalizedWallet }
    });

    if (!balance) {
      balance = await prisma.llm_credit_balance.findFirst({
        where: {
          user_wallet: {
            equals: normalizedWallet,
            mode: 'insensitive'
          }
        }
      });
    }

    if (!balance) {
      // No balance exists yet
      return {
        balanceCents: 0,
        totalPurchased: 0,
        totalUsed: 0,
        limitReached: false
      };
    }

    // Check if user has an OpenClaw instance with limit reached flag
    // @ts-ignore
    const openclawInstance = await prisma.openclaw_instances.findFirst({
      where: { user_wallet: normalizedWallet },
      select: { llm_limit_reached: true }
    });

    return {
      balanceCents: balance.balance_cents,
      totalPurchased: balance.total_purchased,
      totalUsed: balance.total_used,
      limitReached: openclawInstance?.llm_limit_reached || false
    };
  },

  /**
   * Get LLM credit transaction history for a user
   *
   * @param userWallet - User's wallet address
   * @param limit - Maximum number of entries to return (default: 50)
   * @returns Array of ledger entries ordered by date (newest first)
   */
  async getHistory(
    userWallet: string,
    limit: number = 50
  ): Promise<LLMCreditLedgerEntry[]> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    // @ts-ignore
    const entries = await prisma.llm_credit_ledger.findMany({
      where: {
        user_wallet: {
          equals: normalizedWallet,
          mode: 'insensitive'
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    return entries as LLMCreditLedgerEntry[];
  },

  /**
   * Check if user has sufficient LLM credits
   *
   * @param userWallet - User's wallet address
   * @param amountCents - Required amount in cents
   * @returns true if user has sufficient balance, false otherwise
   */
  async hasSufficientBalance(
    userWallet: string,
    amountCents: number
  ): Promise<boolean> {
    const balance = await this.getBalance(userWallet);
    return balance.balanceCents >= amountCents;
  },

  /**
   * Grant monthly plan credits to a user
   *
   * Convenience method for adding plan grant credits.
   *
   * @param userWallet - User's wallet address
   * @param plan - Plan identifier ('starter', 'pro')
   * @param referenceId - Optional reference for idempotency
   * @returns The created ledger entry
   */
  async grantPlanCredits(
    userWallet: string,
    plan: 'starter' | 'pro',
    referenceId?: string
  ): Promise<LLMCreditLedgerEntry> {
    // Plan-based monthly grants (in cents)
    const planGrants: Record<string, number> = {
      starter: 200,   // $2.00
      pro: 2000       // $20.00
    };

    const amountCents = planGrants[plan] || 200;

    return this.addCredits(
      userWallet,
      amountCents,
      `Monthly ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan grant`,
      referenceId,
      { plan, type: 'PLAN_GRANT' },
      'PLAN_GRANT'
    );
  },

  /**
   * Clear the limit reached flag for a user
   *
   * Called after user tops up credits to re-enable OpenClaw.
   *
   * @param userWallet - User's wallet address
   */
  async clearLimitReached(userWallet: string): Promise<void> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    // @ts-ignore
    await prisma.openclaw_instances.updateMany({
      where: { user_wallet: normalizedWallet },
      data: { llm_limit_reached: false }
    });
  },

  /**
   * Set the limit reached flag for a user
   *
   * Called when balance reaches zero during usage sync.
   *
   * @param userWallet - User's wallet address
   */
  async setLimitReached(userWallet: string): Promise<void> {
    const normalizedWallet = userWallet.toLowerCase().trim();

    // @ts-ignore
    await prisma.openclaw_instances.updateMany({
      where: { user_wallet: normalizedWallet },
      data: { llm_limit_reached: true }
    });
  }
};

export default LLMCreditService;
