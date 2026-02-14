import { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@lib/stripe';
import { CreditService } from '@lib/credit-service';
import { TradeQuotaService } from '@lib/trade-quota-service';
import { LLMCreditService } from '@lib/llm-credit-service';

// Disable Next.js body parser to handle raw body for Stripe signature verification
export const config = {
    api: {
        bodyParser: false,
    },
};

const getRawBody = async (req: NextApiRequest): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const body: any[] = [];
        req.on('data', (chunk) => body.push(chunk));
        req.on('end', () => resolve(Buffer.concat(body)));
        req.on('error', (err) => reject(err));
    });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
        console.error('Missing stripe-signature or STRIPE_WEBHOOK_SECRET');
        return res.status(400).send('Webhook Error: Missing signature or secret');
    }

    let event;

    try {
        const rawBody = await getRawBody(req);
        event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
    } catch (err: any) {
        console.error(`Webhook Signature Verification Failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;

        const userWallet = session.metadata?.userWallet;
        const credits = session.metadata?.credits;
        const trades = session.metadata?.trades;
        const tierName = session.metadata?.tierName;
        const type = session.metadata?.type;

        if (type === 'plan_purchase') {
            const plan = session.metadata?.tierName?.toLowerCase();
            const llmCreditsCents = session.metadata?.llmCreditsCents;

            console.log(`🔍 [Webhook] Plan purchase detected. Session ID: ${session.id}`);
            console.log(`🔍 [Webhook] Metadata: userWallet=${userWallet}, plan=${plan}, llmCreditsCents=${llmCreditsCents}, type=${type}`);

            if (!userWallet || !plan) {
                console.error('Missing metadata for plan purchase in Stripe session:', session.id);
                console.error('Available metadata:', JSON.stringify(session.metadata));
                return res.status(200).json({ received: true, error: 'Missing plan purchase metadata' });
            }

            try {
                if (llmCreditsCents && parseInt(llmCreditsCents) > 0) {
                    console.log(`📝 [Webhook] Processing Plan Purchase LLM Credit Grant for ${userWallet}: plan=${plan}, llmCreditsCents=${llmCreditsCents}`);

                    const result = await LLMCreditService.grantPlanCredits(
                        userWallet,
                        plan as 'starter' | 'pro',
                        session.id
                    );

                    console.log(`📝 [Webhook] LLMCreditService.grantPlanCredits result:`, JSON.stringify(result));
                    await LLMCreditService.clearLimitReached(userWallet);

                    console.log(`✅ [Webhook] Successfully granted ${llmCreditsCents} cents LLM credits to ${userWallet} for ${plan} plan`);
                    const balance = await LLMCreditService.getBalance(userWallet);
                    console.log(`✅ [Webhook] Verified balance for ${userWallet}:`, JSON.stringify(balance));
                }

                if (credits && parseInt(credits) > 0) {
                    console.log(`📝 [Webhook] Processing regular credits for ${userWallet}: ${credits} credits`);

                    await CreditService.mintCredits(
                        userWallet,
                        credits,
                        `Stripe Purchase: ${tierName}`,
                        `${session.id}-credits`,
                        {
                            stripeSessionId: session.id,
                            amount_total: session.amount_total,
                            customer: session.customer
                        }
                    );

                    console.log(`✅ [Webhook] Successfully credited ${credits} credits to ${userWallet}`);
                }

                // Mint trade quota independently of credits (OpenClaw plans have credits=0 but still need trades)
                if (trades && parseInt(trades) > 0) {
                    await TradeQuotaService.mintTradeQuota(
                        userWallet,
                        parseInt(trades),
                        `stripe-trades-${session.id}`
                    );
                    console.log(`✅ [Webhook] Minted ${trades} trades for ${userWallet}`);
                }

            } catch (error: any) {
                console.error('❌ [Webhook] Error processing plan purchase:', error);
                console.error('❌ [Webhook] Error stack:', error.stack);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            return res.status(200).json({ received: true });
        }

        if (type === 'llm_topup') {
            const llmCreditsCents = session.metadata?.llmCreditsCents;

            console.log(`🔍 [Webhook] LLM top-up detected. Session ID: ${session.id}`);
            console.log(`🔍 [Webhook] Metadata: userWallet=${userWallet}, llmCreditsCents=${llmCreditsCents}, type=${type}`);

            if (!userWallet || !llmCreditsCents) {
                console.error('Missing metadata for LLM top-up in Stripe session:', session.id);
                console.error('Available metadata:', JSON.stringify(session.metadata));
                return res.status(200).json({ received: true, error: 'Missing LLM top-up metadata' });
            }

            try {
                console.log(`📝 [Webhook] Processing LLM Credit Top-Up for ${userWallet}: ${llmCreditsCents} cents`);

                const result = await LLMCreditService.addCredits(
                    userWallet,
                    parseInt(llmCreditsCents),
                    'Stripe LLM Top-Up',
                    session.id,
                    {
                        stripeSessionId: session.id,
                        amount_total: session.amount_total,
                        customer: session.customer
                    }
                );

                console.log(`📝 [Webhook] LLMCreditService.addCredits result:`, JSON.stringify(result));

                await LLMCreditService.clearLimitReached(userWallet);

                console.log(`✅ [Webhook] Successfully added ${llmCreditsCents} cents LLM credits to ${userWallet} and cleared limit flag`);

                const balance = await LLMCreditService.getBalance(userWallet);
                console.log(`✅ [Webhook] Verified balance for ${userWallet}:`, JSON.stringify(balance));

            } catch (error: any) {
                console.error('❌ [Webhook] Error processing LLM credit top-up:', error);
                console.error('❌ [Webhook] Error stack:', error.stack);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            return res.status(200).json({ received: true });
        }

        if (!userWallet || !credits) {
            console.error('Missing metadata in Stripe session:', session.id);
            return res.status(200).json({ received: true, error: 'Missing metadata' });
        }

        try {
            console.log(`Processing Stripe Credit for ${userWallet}: ${credits} credits, ${trades} trades`);

            await CreditService.mintCredits(
                userWallet,
                credits,
                `Stripe Purchase: ${tierName}`,
                session.id, // Idempotency key
                {
                    stripeSessionId: session.id,
                    amount_total: session.amount_total,
                    customer: session.customer
                }
            );

            // Mint trade quota alongside credits
            if (trades && parseInt(trades) > 0) {
                await TradeQuotaService.mintTradeQuota(
                    userWallet,
                    parseInt(trades),
                    `stripe-trades-${session.id}`
                );
            }

            console.log(`✅ Successfully credited ${credits} credits and ${trades} trades to ${userWallet}`);
        } catch (error: any) {
            console.error('❌ Error minting credits from Stripe webhook:', error);
            // We return 500 so Stripe retries the webhook
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    res.status(200).json({ received: true });
}
