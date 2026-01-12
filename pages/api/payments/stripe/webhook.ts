import { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@lib/stripe';
import { CreditService } from '@lib/credit-service';
import { TradeQuotaService } from '@lib/trade-quota-service';

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
