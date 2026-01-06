import { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';
import { CreditService } from '@lib/credit-service';

// For consistency with frontend toggle
const IS_TESTNET = process.env.USE_TESTNET === 'true';

const NETWORKS = {
    MAINNET: {
        chainId: 42161,
        rpc: 'https://arb1.arbitrum.io/rpc',
        usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    },
    TESTNET: {
        chainId: 421614,
        rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
        usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
    }
};

const ACTIVE_NETWORK = IS_TESTNET ? NETWORKS.TESTNET : NETWORKS.MAINNET;
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS?.toLowerCase();

const pricingTiers: Record<string, { price: number; credits: number }> = {
    "STARTER": { price: 19, credits: 1000 },
    "PRO": { price: 49, credits: 5000 },
    "WHALE": { price: 99, credits: 15000 }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { txHash, tierName, userWallet } = req.body;

        if (!txHash || !tierName || !userWallet) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const tier = pricingTiers[tierName];
        if (!tier) {
            return res.status(400).json({ error: 'Invalid tier' });
        }

        console.log(`Verifying Web3 Tx: ${txHash} for ${userWallet} (${tierName})`);

        // 1. Verify Transaction on Chain
        const provider = new ethers.providers.JsonRpcProvider(ACTIVE_NETWORK.rpc);
        const tx = await provider.getTransactionReceipt(txHash);

        if (!tx) {
            return res.status(400).json({ error: 'Transaction record not found on-chain yet. Please wait a few seconds and try again.' });
        }

        if (tx.status !== 1) {
            return res.status(400).json({ error: 'Transaction failed on-chain.' });
        }

        // 2. Parse Logs to verify USDC transfer
        const transferEventTopic = ethers.utils.id("Transfer(address,address,uint256)");

        const usdcLog = tx.logs.find(log =>
            log.address.toLowerCase() === ACTIVE_NETWORK.usdcAddress.toLowerCase() &&
            log.topics[0] === transferEventTopic &&
            ethers.utils.defaultAbiCoder.decode(['address'], log.topics[2])[0].toLowerCase() === TREASURY_WALLET
        );

        if (!usdcLog) {
            return res.status(400).json({ error: 'No USDC transfer to Maxxit Treasury found in this transaction.' });
        }

        const decodedData = ethers.utils.defaultAbiCoder.decode(['uint256'], usdcLog.data);
        const amountSent = decodedData[0];

        // Accept 0.01 for testing on testnet, otherwise 19/49/99
        const expectedAmount = IS_TESTNET ? ethers.utils.parseUnits("0.01", 6) : ethers.utils.parseUnits(tier.price.toString(), 6);

        if (amountSent.lt(expectedAmount)) {
            return res.status(400).json({ error: `Insufficient amount. Expected at least ${ethers.utils.formatUnits(expectedAmount, 6)} USDC.` });
        }

        // 3. Mint Credits (Reference ID ensures idempotency per Tx Hash)
        const userEntry = await CreditService.mintCredits(
            userWallet,
            tier.credits,
            `Web3 Purchase: ${tierName}`,
            txHash,
            { txHash, network: ACTIVE_NETWORK.chainId, amount_sent: ethers.utils.formatUnits(amountSent, 6) }
        );

        console.log(`✅ Web3 Verification Success: ${userWallet} credited with ${tier.credits}`);

        return res.status(200).json({ success: true, entry: userEntry });

    } catch (error: any) {
        console.error('Web3 Verification Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Verification Error' });
    }
}
