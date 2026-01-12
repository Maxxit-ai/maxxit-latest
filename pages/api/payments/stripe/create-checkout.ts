import { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@lib/stripe';

const pricingTiers: Record<string, { price: number; credits: number; trades: number }> = {
    "STARTER": { price: 19, credits: 1000, trades: 100 },
    "PRO": { price: 49, credits: 5000, trades: 200 },
    "WHALE": { price: 99, credits: 15000, trades: 400 }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { tierName, userWallet } = req.body;

        if (!tierName || !userWallet) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const tier = pricingTiers[tierName];
        if (!tier) {
            return res.status(400).json({ error: 'Invalid tier name' });
        }

        const origin = req.headers.origin || 'http://localhost:3000';

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Maxxit Credits: ${tierName} Plan`,
                            description: `${tier.credits.toLocaleString()} Trading Credits for Maxxit Agents`,
                        },
                        unit_amount: tier.price * 100, // Amount in cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/payment/cancel`,
            metadata: {
                userWallet,
                tierName,
                credits: tier.credits.toString(),
                trades: tier.trades.toString(),
            },
        });

        res.status(200).json({ url: session.url });
    } catch (error: any) {
        console.error('Stripe Checkout Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
