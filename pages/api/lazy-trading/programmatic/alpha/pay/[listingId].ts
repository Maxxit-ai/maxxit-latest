import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../../../lib/prisma";
import { resolveLazyTradingApiKey } from "../../../../../../lib/lazy-trading-api";
import { getPrivateKeyByAddress } from "../../../../../../lib/deployment-agent-address";
import { sendUsdc, getUsdcBalance } from "../../../../../../lib/usdc-transfer";

const prismaClient = prisma as any;

/**
 * POST /api/lazy-trading/programmatic/alpha/pay/:listingId
 *
 * x402 Payment Helper — handles the USDC transfer step between Phase 1 and Phase 2.
 *
 * Flow:
 *  1. Look up the listing → get producer's profit_receiver_address (payTo)
 *  2. Look up the consumer's agent address from user_agent_addresses
 *  3. Decrypt the agent's private key using getPrivateKeyByAddress()
 *  4. Check the agent's USDC balance on-chain
 *  5. Send USDC from agent → producer's payTo address
 *  6. Return the txHash for use in Phase 2 (X-Payment header)
 *
 * Usage:
 *  Phase 1: GET /purchase/{listingId}       → 402 + paymentDetails
 *  Helper:  POST /pay/{listingId}           → { txHash }  ← THIS ENDPOINT
 *  Phase 2: GET /purchase/{listingId}       → 200 + alpha
 *           + X-Payment: txHash
 */
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        // ── Auth ──────────────────────────────────────────────────────────────
        const apiKeyRecord = await resolveLazyTradingApiKey(req);
        if (!apiKeyRecord) {
            return res.status(401).json({ success: false, error: "Invalid API key" });
        }

        const buyerWallet = apiKeyRecord.user_wallet;

        const { listingId } = req.query;
        if (!listingId || typeof listingId !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing required parameter: listingId",
            });
        }

        // ── Fetch listing + producer's payment address ────────────────────────
        const listing = await prismaClient.alpha_listings.findUnique({
            where: { id: listingId },
            include: {
                agents: {
                    select: {
                        profit_receiver_address: true,
                    },
                },
            },
        });

        if (!listing) {
            return res.status(404).json({
                success: false,
                error: "Alpha listing not found",
            });
        }

        if (!listing.active) {
            return res.status(410).json({
                success: false,
                error: "Alpha listing is no longer active",
            });
        }

        const payTo = listing.agents?.profit_receiver_address;
        if (!payTo) {
            return res.status(404).json({
                success: false,
                error: "Listing agent not found or has no payment address",
            });
        }

        // ── Check if already purchased ────────────────────────────────────────
        const existingPurchase = await prismaClient.alpha_purchases.findFirst({
            where: {
                listing_id: listingId,
                buyer_wallet: buyerWallet.toLowerCase(),
            },
        });

        if (existingPurchase) {
            return res.status(200).json({
                success: true,
                alreadyPaid: true,
                txHash: existingPurchase.tx_hash,
                message: "You have already paid for this listing. Use the txHash in X-Payment header to retrieve alpha content.",
            });
        }

        // ── Look up consumer's agent address ──────────────────────────────────
        // The consumer's agent is stored in user_agent_addresses linked by user_wallet
        const userAgent = await prismaClient.user_agent_addresses.findFirst({
            where: {
                user_wallet: {
                    equals: buyerWallet,
                    mode: "insensitive",
                },
            },
            select: {
                ostium_agent_address: true,
            },
        });

        if (!userAgent || !userAgent.ostium_agent_address) {
            return res.status(400).json({
                success: false,
                error: "No agent address found for your wallet. Please deploy an OpenClaw agent first.",
            });
        }

        const agentAddress = userAgent.ostium_agent_address;

        // ── Decrypt agent's private key ───────────────────────────────────────
        let agentPrivateKey: string | null;
        try {
            agentPrivateKey = await getPrivateKeyByAddress(agentAddress);
        } catch (decryptError: any) {
            console.error("[API /alpha/pay] Key decryption error:", decryptError.message);
            return res.status(500).json({
                success: false,
                error: "Failed to decrypt agent private key",
                message: decryptError.message,
            });
        }

        if (!agentPrivateKey) {
            return res.status(400).json({
                success: false,
                error: "Could not retrieve private key for agent address: " + agentAddress,
            });
        }

        // ── Check USDC balance ────────────────────────────────────────────────
        const isTestnet = process.env.ALPHA_TESTNET_MODE !== "false";
        const priceUsdc = listing.price_usdc.toString();

        let balance: string;
        try {
            balance = await getUsdcBalance(agentAddress, isTestnet);
        } catch (balanceError: any) {
            console.error("[API /alpha/pay] Balance check error:", balanceError.message);
            return res.status(500).json({
                success: false,
                error: "Failed to check USDC balance",
                message: balanceError.message,
            });
        }

        if (parseFloat(balance) < parseFloat(priceUsdc)) {
            return res.status(402).json({
                success: false,
                error: "Insufficient USDC balance",
                required: priceUsdc,
                available: balance,
                agentAddress,
                message: `Your agent (${agentAddress}) needs ${priceUsdc} USDC but only has ${balance} USDC. Please fund your agent wallet.`,
            });
        }

        // ── Send USDC on-chain ────────────────────────────────────────────────
        console.log(`[API /alpha/pay] Sending ${priceUsdc} USDC from ${agentAddress} to ${payTo}`);

        let txResult;
        try {
            txResult = await sendUsdc(agentPrivateKey, payTo, priceUsdc, isTestnet);
        } catch (txError: any) {
            console.error("[API /alpha/pay] USDC transfer error:", txError.message);
            return res.status(500).json({
                success: false,
                error: "USDC transfer failed",
                message: txError.message,
            });
        }

        console.log(`[API /alpha/pay] ✅ USDC sent! txHash: ${txResult.txHash}`);

        // ── Update API key last_used_at ───────────────────────────────────────
        await prismaClient.user_api_keys.update({
            where: { id: apiKeyRecord.id },
            data: { last_used_at: new Date() },
        });

        // ── Return txHash for Phase 2 ─────────────────────────────────────────
        return res.status(200).json({
            success: true,
            txHash: txResult.txHash,
            blockNumber: txResult.blockNumber,
            from: txResult.from,
            to: payTo,
            amount: priceUsdc,
            asset: "USDC",
            network: isTestnet ? "arbitrum-sepolia" : "arbitrum-one",
            message: "USDC payment sent successfully. Use the txHash in the X-Payment header to complete your purchase.",
            nextStep: {
                method: "GET",
                url: `/api/lazy-trading/programmatic/alpha/purchase/${listingId}`,
                headers: {
                    "x-api-key": "YOUR_API_KEY",
                    "X-Payment": txResult.txHash,
                },
            },
        });
    } catch (error: any) {
        console.error("[API /alpha/pay] Error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Failed to process USDC payment",
            message: error.message,
        });
    }
}
