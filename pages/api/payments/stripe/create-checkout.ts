import { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@lib/stripe';

const pricingTiers: Record<string, { price: number; credits: number; trades: number; llmCreditsCents: number }> = {
    "STARTER": { price: 29, credits: 1000, trades: 100, llmCreditsCents: 200 },
    "PRO": { price: 49, credits: 5000, trades: 200, llmCreditsCents: 2000 },
    "WHALE": { price: 99, credits: 15000, trades: 400, llmCreditsCents: 0 }
};

const openclawTradeQuota: Record<string, number> = {
    "STARTER": 20,
    "PRO": 50,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { tierName, userWallet, returnUrl, source } = req.body;

        if (!tierName || !userWallet) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const tier = pricingTiers[tierName];
        if (!tier) {
            return res.status(400).json({ error: 'Invalid tier name' });
        }

        const origin = req.headers.origin || 'http://localhost:3000';

        const successUrl = returnUrl
            ? `${returnUrl}?payment=success&tier=${tierName}`
            : `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = returnUrl
            ? `${returnUrl}?payment=cancelled`
            : `${origin}/payment/cancel`;

        const isOpenClawPlan = source === 'openclaw';
        const creditsForPlan = isOpenClawPlan ? 0 : tier.credits;
        const tradesForPlan = isOpenClawPlan ? openclawTradeQuota[tierName] || 0 : tier.trades;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: isOpenClawPlan ? `OpenClaw ${tierName.charAt(0) + tierName.slice(1).toLowerCase()} Plan` : `Maxxit Credits: ${tierName} Plan`,
                            description: isOpenClawPlan
                                ? `${tierName === 'PRO' ? '$20' : '$2'} LLM credits + ${tradesForPlan} trades for OpenClaw AI assistant`
                                : `${tier.credits.toLocaleString()} Trading Credits for Maxxit Agents`,
                        },
                        unit_amount: tier.price * 100, // Amount in cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            allow_promotion_codes: true,
            metadata: {
                userWallet,
                tierName,
                credits: creditsForPlan.toString(),
                trades: tradesForPlan.toString(),
                llmCreditsCents: tier.llmCreditsCents.toString(),
                type: 'plan_purchase',
                source: source || 'pricing',
            },
        });

        res.status(200).json({ url: session.url });
    } catch (error: any) {
        console.error('Stripe Checkout Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
