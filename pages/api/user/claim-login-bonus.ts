import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withTransaction } from '../../../lib/prisma';
import { CreditService } from '../../../lib/credit-service';
import { TradeQuotaService } from '../../../lib/trade-quota-service';

// Login bonus constants
const LOGIN_BONUS_CREDITS = 100;
const LOGIN_BONUS_TRADES = 10;
const LOGIN_BONUS_PURPOSE = 'LOGIN_BONUS_NEW_USER';

interface ClaimBonusResponse {
    success: boolean;
    alreadyClaimed: boolean;
    creditsGranted?: number;
    tradesGranted?: number;
    message: string;
}

/**
 * POST /api/user/claim-login-bonus
 * 
 * Claims login bonus for new wallet addresses.
 * Grants 100 credits + 10 free trades if wallet is NEW (not present in either table).
 * 
 * This endpoint is idempotent - calling multiple times for same wallet is safe.
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<ClaimBonusResponse | { error: string }>
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'walletAddress is required' });
    }

    const normalizedWallet = walletAddress.toLowerCase().trim();

    try {
        // Check if wallet already exists in EITHER table
        // If exists in any → already claimed (not a new user)
        const [existingCredits, existingQuota] = await Promise.all([
            // @ts-ignore
            prisma.user_credit_balance.findUnique({
                where: { user_wallet: normalizedWallet }
            }),
            // @ts-ignore
            prisma.user_trade_quota.findUnique({
                where: { user_wallet: normalizedWallet }
            })
        ]);

        // If wallet exists in either table, they're not a new user
        if (existingCredits || existingQuota) {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                message: 'Login bonus already claimed or user is not new'
            });
        }

        // New user! Grant login bonus atomically
        await withTransaction(async (tx) => {
            // 1. Mint credits using CreditService pattern (REWARD type)
            // Record User Credit Entry
            // @ts-ignore
            await tx.credit_ledger_entry.create({
                data: {
                    user_wallet: normalizedWallet,
                    amount: LOGIN_BONUS_CREDITS,
                    entry_type: 'REWARD',
                    purpose: LOGIN_BONUS_PURPOSE,
                    reference_id: `LOGIN_BONUS_${normalizedWallet}_${Date.now()}`,
                    metadata: { bonus_type: 'new_user_welcome', credits: LOGIN_BONUS_CREDITS, trades: LOGIN_BONUS_TRADES }
                }
            });

            // Record Treasury Debit Entry (Double-Entry)
            // @ts-ignore
            await tx.credit_ledger_entry.create({
                data: {
                    user_wallet: CreditService.TREASURY_WALLET,
                    amount: -LOGIN_BONUS_CREDITS,
                    entry_type: 'REWARD',
                    purpose: `MINT: ${LOGIN_BONUS_PURPOSE}`,
                    metadata: { target_wallet: normalizedWallet }
                }
            });

            // Create User Balance
            // @ts-ignore
            await tx.user_credit_balance.create({
                data: {
                    user_wallet: normalizedWallet,
                    balance: LOGIN_BONUS_CREDITS
                }
            });

            // Update Treasury Global Stats
            // @ts-ignore
            await tx.system_treasury.upsert({
                where: { id: 'GLOBAL_TREASURY' },
                update: { total_minted: { increment: LOGIN_BONUS_CREDITS } },
                create: { id: 'GLOBAL_TREASURY', total_minted: LOGIN_BONUS_CREDITS }
            });

            // 2. Mint trade quota
            // @ts-ignore
            await tx.user_trade_quota.create({
                data: {
                    user_wallet: normalizedWallet,
                    trades_total: LOGIN_BONUS_TRADES,
                    trades_used: 0,
                    trades_remaining: LOGIN_BONUS_TRADES
                }
            });
        });

        console.log(`[LoginBonus] Granted ${LOGIN_BONUS_CREDITS} credits + ${LOGIN_BONUS_TRADES} trades to new user: ${normalizedWallet}`);

        return res.status(200).json({
            success: true,
            alreadyClaimed: false,
            creditsGranted: LOGIN_BONUS_CREDITS,
            tradesGranted: LOGIN_BONUS_TRADES,
            message: `Welcome! You've received ${LOGIN_BONUS_CREDITS} credits and ${LOGIN_BONUS_TRADES} free trades.`
        });

    } catch (error) {
        console.error('[LoginBonus] Error claiming bonus:', error);

        // Handle unique constraint violation (race condition - another request already created)
        if ((error as any)?.code === 'P2002') {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                message: 'Login bonus already claimed'
            });
        }

        return res.status(500).json({ error: 'Failed to claim login bonus' });
    }
}
