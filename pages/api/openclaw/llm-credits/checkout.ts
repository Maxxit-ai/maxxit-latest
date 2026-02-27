import { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@lib/stripe";

/**
 * POST /api/openclaw/llm-credits/checkout
 *
 * Creates a Stripe checkout session for LLM credit top-up
 *
 * Request Body:
 * - userWallet: string - User's wallet address
 * - amountCents: number - Amount in cents (e.g., 1000 = $10.00)
 *
 * Response:
 * - success: boolean
 * - checkoutUrl?: string - Stripe checkout URL
 * - error?: string - Error message if failed
 */

// Minimum and maximum top-up amounts (in cents)
const MIN_AMOUNT_CENTS = 100; // $1.00
const MAX_AMOUNT_CENTS = 100000; // $1,000.00

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { userWallet, amountCents } = req.body;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid or missing userWallet",
      });
    }

    if (!amountCents || typeof amountCents !== "number") {
      return res.status(400).json({
        success: false,
        error: "Invalid or missing amountCents",
      });
    }

    if (amountCents < MIN_AMOUNT_CENTS) {
      return res.status(400).json({
        success: false,
        error: `Minimum top-up amount is $${(MIN_AMOUNT_CENTS / 100).toFixed(2)}`,
      });
    }

    if (amountCents > MAX_AMOUNT_CENTS) {
      return res.status(400).json({
        success: false,
        error: `Maximum top-up amount is $${(MAX_AMOUNT_CENTS / 100).toFixed(2)}`,
      });
    }

    const origin = req.headers.origin || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "OpenClaw LLM Credits Top-Up",
              description: `$${(amountCents / 100).toFixed(2)} LLM API credits for OpenClaw`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      allow_promotion_codes: true,
      success_url: `${origin}/openclaw?payment=success&llm_topup=true`,
      cancel_url: `${origin}/openclaw?payment=cancelled`,
      metadata: {
        userWallet: userWallet.toLowerCase().trim(),
        llmCreditsCents: amountCents.toString(),
        type: "llm_topup",
      },
    });

    return res.status(200).json({
      success: true,
      checkoutUrl: session.url,
    });
  } catch (error: any) {
    console.error("LLM Credit Checkout Error:", error);

    if (error.type === "StripeAPIError") {
      return res.status(500).json({
        success: false,
        error: "Payment processing error. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
}
