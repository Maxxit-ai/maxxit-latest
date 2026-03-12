import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { getUsdcBalance, sendUsdc } from "../../../lib/usdc-transfer";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet, promoCode } = req.body as {
      userWallet?: string;
      promoCode?: string;
    };

    if (!userWallet || !promoCode) {
      return res.status(400).json({
        error: "Missing required fields: userWallet, promoCode",
      });
    }

    const expectedPromoCode = process.env.OPENCLAW_OSTIUM_TESTNET_PROMO_CODE;

    if (!expectedPromoCode) {
      return res.status(503).json({
        error: "Ostium testnet promo code is not configured",
      });
    }

    if (promoCode.trim() !== expectedPromoCode.trim()) {
      return res.status(403).json({
        error: "Invalid promo code",
      });
    }

    const fundingPrivateKey = process.env.OPENCLAW_OSTIUM_TESTNET_USDC_PRIVATE_KEY;
    if (!fundingPrivateKey) {
      return res.status(503).json({
        error: "OpenClaw Ostium testnet funding key is not configured",
      });
    }

    const fundingAmount = process.env.OPENCLAW_OSTIUM_TESTNET_USDC_AMOUNT || "50";
    const checksummedWallet = ethers.utils.getAddress(userWallet.trim());
    const funderAddress = new ethers.Wallet(fundingPrivateKey).address;
    const existingUserBalance = await getUsdcBalance(checksummedWallet, true);

    if (parseFloat(existingUserBalance) > 0) {
      return res.status(200).json({
        success: true,
        isTestnet: true,
        walletAddress: checksummedWallet,
        fundingSkipped: true,
        existingUsdcBalance: existingUserBalance,
        message: "Ostium testnet is already enabled for this wallet. Existing testnet USDC balance detected, so no additional USDC was sent.",
      });
    }

    const transferResult = await sendUsdc(
      fundingPrivateKey,
      checksummedWallet,
      fundingAmount,
      true
    );
    const funderBalanceAfter = await getUsdcBalance(funderAddress, true);

    return res.status(200).json({
      success: true,
      isTestnet: true,
      walletAddress: checksummedWallet,
      funding: {
        txHash: transferResult.txHash,
        blockNumber: transferResult.blockNumber,
        from: transferResult.from,
        amount: fundingAmount,
        funderBalanceAfter,
      },
      message: "Ostium testnet enabled and testnet USDC sent",
    });
  } catch (error: any) {
    console.error("[OpenClaw] Enable Ostium testnet error:", error);
    return res.status(500).json({
      error: error.message || "Failed to enable Ostium testnet",
    });
  }
}
