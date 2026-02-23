/**
 * USDC Transfer & Verification Library
 *
 * Uses ethers v5 to send and verify ERC-20 USDC transfers on Arbitrum
 * (Sepolia testnet or mainnet).
 *
 * Used by the x402 purchase flow:
 *  - Consumer sends USDC to producer's profit_receiver_address
 *  - Server verifies the tx on-chain before releasing alpha content
 */

import { ethers } from "ethers";

// ── USDC Contract Addresses ──────────────────────────────────────────────────
const USDC_CONTRACTS: Record<string, string> = {
    // testnet: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia
    testnet: "0xe73B11Fb1e3eeEe8AF2a23079A4410Fe1B370548", // Arbitrum Sepolia
    mainnet: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum One
};

// ── Default RPC URLs ─────────────────────────────────────────────────────────
const DEFAULT_RPC_URLS: Record<string, string> = {
    testnet: "https://sepolia-rollup.arbitrum.io/rpc",
    mainnet: "https://arb1.arbitrum.io/rpc",
};

// ── Minimal ERC-20 ABI for transfer + balanceOf + Transfer event ─────────
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface SendUsdcResult {
    txHash: string;
    blockNumber: number;
    from: string;
}

export interface VerifyUsdcResult {
    verified: boolean;
    from: string;
    to: string;
    amount: string; // human-readable USDC amount
    blockNumber: number;
    error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNetwork(isTestnet: boolean): string {
    return isTestnet ? "testnet" : "mainnet";
}

function getRpcUrl(isTestnet: boolean): string {
    const network = getNetwork(isTestnet);
    if (isTestnet) {
        return (
            process.env.OSTIUM_TESTNET_RPC_URL || DEFAULT_RPC_URLS[network]
        );
    }
    return (
        process.env.OSTIUM_MAINNET_RPC_URL || DEFAULT_RPC_URLS[network]
    );
}

function getUsdcContract(isTestnet: boolean): string {
    return USDC_CONTRACTS[getNetwork(isTestnet)];
}

function getProvider(isTestnet: boolean): ethers.providers.JsonRpcProvider {
    return new ethers.providers.JsonRpcProvider(getRpcUrl(isTestnet));
}

// ── Public Functions ─────────────────────────────────────────────────────────

/**
 * Get the USDC balance of an address.
 * Returns human-readable amount (e.g. "25.5" for 25.5 USDC).
 */
export async function getUsdcBalance(
    address: string,
    isTestnet: boolean
): Promise<string> {
    const provider = getProvider(isTestnet);
    const usdcContract = new ethers.Contract(
        getUsdcContract(isTestnet),
        ERC20_ABI,
        provider
    );
    const balance = await usdcContract.balanceOf(address);
    const decimals = await usdcContract.decimals();
    return ethers.utils.formatUnits(balance, decimals);
}

/**
 * Send USDC from an agent wallet to a recipient.
 *
 * @param privateKey  - Decrypted private key of the sender agent
 * @param toAddress   - Recipient address (producer's profit_receiver_address)
 * @param amountUsdc  - Amount in USDC (e.g. "5" or "5.50")
 * @param isTestnet   - Whether to use Arbitrum Sepolia or mainnet
 * @returns           - Transaction hash, block number, sender address
 */
export async function sendUsdc(
    privateKey: string,
    toAddress: string,
    amountUsdc: string | number,
    isTestnet: boolean
): Promise<SendUsdcResult> {
    const provider = getProvider(isTestnet);
    const wallet = new ethers.Wallet(privateKey, provider);

    const usdcAddress = getUsdcContract(isTestnet);
    const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, wallet);

    // Get decimals and parse amount
    const decimals = await usdcContract.decimals();
    const amountParsed = ethers.utils.parseUnits(
        amountUsdc.toString(),
        decimals
    );

    // Check balance before sending
    const balance = await usdcContract.balanceOf(wallet.address);
    if (balance.lt(amountParsed)) {
        const balanceFormatted = ethers.utils.formatUnits(balance, decimals);
        throw new Error(
            `Insufficient USDC balance. Required: ${amountUsdc}, Available: ${balanceFormatted}`
        );
    }

    // Send transfer
    const tx = await usdcContract.transfer(toAddress, amountParsed);

    // Wait for 1 confirmation
    const receipt = await tx.wait(1);

    return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        from: wallet.address,
    };
}

/**
 * Verify an on-chain USDC transfer matches expected parameters.
 *
 * Used by the purchase endpoint to validate the X-Payment header (tx hash).
 *
 * @param txHash           - Transaction hash to verify
 * @param expectedTo       - Expected recipient address
 * @param expectedAmount   - Expected USDC amount (e.g. "5" or 5)
 * @param isTestnet        - Whether to check Arbitrum Sepolia or mainnet
 * @returns                - Verification result
 */
export async function verifyUsdcTransfer(
    txHash: string,
    expectedTo: string,
    expectedAmount: string | number,
    isTestnet: boolean
): Promise<VerifyUsdcResult> {
    const provider = getProvider(isTestnet);
    const usdcAddress = getUsdcContract(isTestnet);

    const failResult = (error: string): VerifyUsdcResult => ({
        verified: false,
        from: "",
        to: "",
        amount: "0",
        blockNumber: 0,
        error,
    });

    try {
        // 1. Fetch tx receipt
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
            return failResult("Transaction not found or not yet confirmed");
        }

        if (receipt.status !== 1) {
            return failResult("Transaction reverted on-chain");
        }

        // 2. Check the tx was sent to the USDC contract
        const tx = await provider.getTransaction(txHash);
        if (!tx || tx.to?.toLowerCase() !== usdcAddress.toLowerCase()) {
            return failResult(
                "Transaction is not a USDC contract interaction"
            );
        }

        // 3. Parse Transfer event logs
        const iface = new ethers.utils.Interface(ERC20_ABI);
        const transferTopic = iface.getEventTopic("Transfer");

        const transferLogs = receipt.logs.filter(
            (log) =>
                log.address.toLowerCase() === usdcAddress.toLowerCase() &&
                log.topics[0] === transferTopic
        );

        if (transferLogs.length === 0) {
            return failResult("No USDC Transfer event found in transaction");
        }

        // 4. Decode the Transfer event
        const decoded = iface.parseLog(transferLogs[0]);
        const from = decoded.args.from as string;
        const to = decoded.args.to as string;
        const value = decoded.args.value as ethers.BigNumber;

        // 5. Get decimals for formatting
        const usdcContract = new ethers.Contract(
            usdcAddress,
            ERC20_ABI,
            provider
        );
        const decimals = await usdcContract.decimals();

        const actualAmount = ethers.utils.formatUnits(value, decimals);
        const expectedAmountParsed = ethers.utils.parseUnits(
            expectedAmount.toString(),
            decimals
        );

        // 6. Validate recipient
        if (to.toLowerCase() !== expectedTo.toLowerCase()) {
            return failResult(
                `Recipient mismatch. Expected: ${expectedTo}, Got: ${to}`
            );
        }

        // 7. Validate amount (must be >= expected)
        if (value.lt(expectedAmountParsed)) {
            return failResult(
                `Amount insufficient. Expected: ${expectedAmount} USDC, Got: ${actualAmount} USDC`
            );
        }

        return {
            verified: true,
            from,
            to,
            amount: actualAmount,
            blockNumber: receipt.blockNumber,
        };
    } catch (error: any) {
        return failResult(`Verification error: ${error.message}`);
    }
}
