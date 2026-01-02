import { prisma, withTransaction } from './prisma';
import { Decimal } from '@prisma/client/runtime/library';

export type CreditEntryType = 'PURCHASE' | 'USAGE' | 'REWARD' | 'ADJUSTMENT';

export class CreditService {
    /**
     * The address used for the system treasury.
     * Can be configured via TREASURY_WALLET_ADDRESS env var.
     */
    static get TREASURY_WALLET(): string {
        return (process.env.TREASURY_WALLET_ADDRESS || 'SYSTEM_TREASURY').toLowerCase();
    }

    /**
     * Mint credits to a user (PURCHASE or REWARD)
     * This follows double-entry logic: 
     * 1. Credit User Ledger
     * 2. Debit Treasury Ledger
     * 3. Update User Balance
     * 4. Update Treasury Stats
     */
    static async mintCredits(
        userWallet: string,
        amount: number | string,
        purpose: string,
        referenceId?: string,
        metadata?: any
    ) {
        const normalizedWallet = userWallet.toLowerCase();
        const creditAmount = new Decimal(amount);

        return await withTransaction(async (tx) => {
            // 1. Check idempotency if referenceId is provided
            if (referenceId) {
                // @ts-ignore
                const existing = await tx.credit_ledger_entry.findUnique({
                    where: { reference_id: referenceId }
                });
                if (existing) return existing;
            }

            // 2. Record User Credit Entry
            // @ts-ignore
            const userEntry = await tx.credit_ledger_entry.create({
                data: {
                    user_wallet: normalizedWallet,
                    amount: creditAmount,
                    entry_type: 'PURCHASE',
                    purpose,
                    reference_id: referenceId,
                    metadata
                }
            });

            // 3. Record Treasury Debit Entry (Double-Entry)
            // @ts-ignore
            await tx.credit_ledger_entry.create({
                data: {
                    user_wallet: CreditService.TREASURY_WALLET,
                    amount: creditAmount.negated(),
                    entry_type: 'PURCHASE',
                    purpose: `MINT: ${purpose}`,
                    metadata: { target_wallet: normalizedWallet, ...metadata }
                }
            });

            // 4. Update User Balance (Upsert)
            // @ts-ignore
            await tx.user_credit_balance.upsert({
                where: { user_wallet: normalizedWallet },
                update: { balance: { increment: creditAmount } },
                create: { user_wallet: normalizedWallet, balance: creditAmount }
            });

            // 5. Update Treasury Global Stats
            // @ts-ignore
            await tx.system_treasury.upsert({
                where: { id: 'GLOBAL_TREASURY' },
                update: { total_minted: { increment: creditAmount } },
                create: { id: 'GLOBAL_TREASURY', total_minted: creditAmount }
            });

            return userEntry;
        });
    }

    /**
     * Spend credits from a user (USAGE)
     */
    static async spendCredits(
        userWallet: string,
        amount: number | string,
        purpose: string,
        metadata?: any
    ) {
        const normalizedWallet = userWallet.toLowerCase();
        const spendAmount = new Decimal(amount);

        return await withTransaction(async (tx) => {
            // 1. Check balance
            // @ts-ignore
            const balanceRecord = await tx.user_credit_balance.findUnique({
                where: { user_wallet: normalizedWallet }
            });

            if (!balanceRecord || balanceRecord.balance.lt(spendAmount)) {
                throw new Error('Insufficient credit balance');
            }

            // 2. Record User Debit Entry
            // @ts-ignore
            const userEntry = await tx.credit_ledger_entry.create({
                data: {
                    user_wallet: normalizedWallet,
                    amount: spendAmount.negated(),
                    entry_type: 'USAGE',
                    purpose,
                    metadata
                }
            });

            // 3. Record Treasury Credit Entry
            // @ts-ignore
            await tx.credit_ledger_entry.create({
                data: {
                    user_wallet: CreditService.TREASURY_WALLET,
                    amount: spendAmount,
                    entry_type: 'USAGE',
                    purpose: `CONSUME: ${purpose}`,
                    metadata: { source_wallet: normalizedWallet, ...metadata }
                }
            });

            // 4. Update User Balance
            // @ts-ignore
            await tx.user_credit_balance.update({
                where: { user_wallet: normalizedWallet },
                data: { balance: { decrement: spendAmount } }
            });

            // 5. Update Treasury Global Stats
            // @ts-ignore
            await tx.system_treasury.upsert({
                where: { id: 'GLOBAL_TREASURY' },
                update: { total_consumed: { increment: spendAmount } },
                create: { id: 'GLOBAL_TREASURY', total_consumed: spendAmount }
            });

            return userEntry;
        });
    }

    static async getBalance(userWallet: string) {
        const normalizedWallet = userWallet.toLowerCase();
        // @ts-ignore
        const record = await prisma.user_credit_balance.findFirst({
            where: {
                user_wallet: {
                    equals: normalizedWallet,
                    mode: 'insensitive'
                }
            }
        });
        return record ? record.balance.toString() : '0';
    }

    static async getHistory(userWallet: string, limit = 50) {
        const normalizedWallet = userWallet.toLowerCase();
        // @ts-ignore
        return await prisma.credit_ledger_entry.findMany({
            where: {
                user_wallet: {
                    equals: normalizedWallet,
                    mode: 'insensitive'
                }
            },
            orderBy: { created_at: 'desc' },
            take: limit
        });
    }

    /**
     * Purchase access to alpha sources.
     * 10% additional platform fee added to subtotal.
     */
    static async purchaseAlphaAccess(
        tx: any,
        payerWallet: string,
        alphaInfos: { id: string, price: string | number, providerWallet: string }[],
        referenceId: string
    ) {
        const db = tx || prisma;
        const normalizedPayer = payerWallet.toLowerCase();

        let subtotal = new Decimal(0);
        for (const alpha of alphaInfos) {
            subtotal = subtotal.plus(new Decimal(alpha.price));
        }

        const platformFeePercentage = new Decimal('0.1');
        const platformFee = subtotal.times(platformFeePercentage);
        const grandTotal = subtotal.plus(platformFee);

        // 1. Check payer balance
        // @ts-ignore
        const balanceRecord = await db.user_credit_balance.findUnique({
            where: { user_wallet: normalizedPayer }
        });

        if (!balanceRecord || balanceRecord.balance.lt(grandTotal)) {
            throw new Error(`Insufficient credit balance. Required: ${grandTotal.toString()}, Available: ${balanceRecord?.balance?.toString() || '0'}`);
        }

        // 2. Debit Payer (Full Amount)
        // @ts-ignore
        await db.credit_ledger_entry.create({
            data: {
                user_wallet: normalizedPayer,
                amount: grandTotal.negated(),
                entry_type: 'USAGE',
                purpose: `PURCHASE_ALPHAS: ${referenceId}`,
                reference_id: referenceId,
                metadata: { alpha_count: alphaInfos.length, subtotal: subtotal.toString(), platform_fee: platformFee.toString() }
            }
        });

        // @ts-ignore
        await db.user_credit_balance.update({
            where: { user_wallet: normalizedPayer },
            data: { balance: { decrement: grandTotal } }
        });

        // 3. Credit Each Provider (Subtotal parts)
        for (const alpha of alphaInfos) {
            const amount = new Decimal(alpha.price);
            if (amount.isZero() || !alpha.providerWallet) continue;
            const normalizedProvider = alpha.providerWallet.toLowerCase();

            // @ts-ignore
            await db.credit_ledger_entry.create({
                data: {
                    user_wallet: normalizedProvider,
                    amount: amount,
                    entry_type: 'REWARD',
                    purpose: `ALPHA_REVENUE: ${referenceId}`,
                    metadata: { alpha_id: alpha.id, payer_wallet: normalizedPayer }
                }
            });

            // @ts-ignore
            await db.user_credit_balance.upsert({
                where: { user_wallet: normalizedProvider },
                update: { balance: { increment: amount } },
                create: { user_wallet: normalizedProvider, balance: amount }
            });
        }

        // 4. Credit System Treasury (Platform Fee part)
        if (platformFee.gt(0)) {
            // @ts-ignore
            await db.credit_ledger_entry.create({
                data: {
                    user_wallet: CreditService.TREASURY_WALLET,
                    amount: platformFee,
                    entry_type: 'USAGE',
                    purpose: `PLATFORM_FEE: ${referenceId}`,
                    metadata: { source_wallet: normalizedPayer, subtotal: subtotal.toString() }
                }
            });

            // @ts-ignore
            await db.system_treasury.upsert({
                where: { id: 'GLOBAL_TREASURY' },
                update: { total_consumed: { increment: platformFee } },
                create: { id: 'GLOBAL_TREASURY', total_consumed: platformFee }
            });
        }

        return { subtotal, platformFee, grandTotal };
    }
}
