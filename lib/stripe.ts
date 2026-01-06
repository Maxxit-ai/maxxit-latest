import Stripe from 'stripe';

const getStripeKey = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key && process.env.NODE_ENV === 'development') {
        console.warn('STRIPE_SECRET_KEY is missing');
    }
    return key || '';
};

export const stripe = new Stripe(getStripeKey(), {
    // @ts-ignore
    apiVersion: '2024-12-18.acacia',
    typescript: true,
});
