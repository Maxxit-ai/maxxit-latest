/**
 * Avantis Adapter
 * TypeScript wrapper for Avantis Python service
 * Similar to ostium-adapter.ts but for Base-based Avantis
 */

import fetch from 'node-fetch';

const AVANTIS_SERVICE_URL =
    process.env.AVANTIS_SERVICE_URL || 'http://localhost:5003';

export interface AvantisPosition {
    market: string;
    marketFull?: string;
    side: 'long' | 'short';
    collateral: number;
    entryPrice: number;
    leverage: number;
    unrealizedPnl: number;
    tradeId: string;
    txHash?: string;
    pairIndex?: string;
    tradeIndex?: string;
    stopLossPrice?: number;
    takeProfitPrice?: number;
}

export interface AvantisClosedPosition {
    market: string;
    marketFull: string;
    side: 'long' | 'short';
    collateral: number;
    leverage: number;
    entryPrice: number;
    closePrice: number;
    pnlUsdc: number;
    profitPercent: number;
    executedAt: string;
    executedTx: string;
    tradeId: string;
    tradeIndex: string;
}

export interface AvantisBalance {
    address: string;
    usdcBalance: string;
    ethBalance: string;
}

export interface OpenPositionParams {
    privateKey: string;
    market: string;
    size: number;
    side: 'long' | 'short';
    leverage?: number;
    useDelegation?: boolean;
    userAddress?: string;
    stopLoss?: number;
    takeProfit?: number;
    isTestnet?: boolean;
}

export interface ClosePositionParams {
    privateKey?: string;
    agentAddress?: string;
    market: string;
    tradeId?: string;
    useDelegation?: boolean;
    userAddress?: string;
    actualTradeIndex?: number;
    isTestnet?: boolean;
}

export interface TransferParams {
    agentPrivateKey: string;
    toAddress: string;
    amount: number;
    vaultAddress?: string;
}

// Get Avantis balance for an address
export async function getAvantisBalance(
    address: string,
    isTestnet?: boolean
): Promise<AvantisBalance> {
    const response = await fetch(`${AVANTIS_SERVICE_URL}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, isTestnet }),
    });

    const data = (await response.json()) as any;

    if (!data.success) {
        throw new Error(data.error || 'Failed to get Avantis balance');
    }

    return {
        address: data.address,
        usdcBalance: data.usdcBalance,
        ethBalance: data.ethBalance,
    };
}

// Get open positions for an address
export async function getAvantisPositions(
    address: string,
    isTestnet?: boolean
): Promise<AvantisPosition[]> {
    const response = await fetch(`${AVANTIS_SERVICE_URL}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, isTestnet }),
    });

    const data = (await response.json()) as any;

    if (!data.success) {
        throw new Error(data.error || 'Failed to get Avantis positions');
    }

    return data.positions;
}

// Open a position on Avantis
export async function openAvantisPosition(params: OpenPositionParams) {
    const response = await fetch(`${AVANTIS_SERVICE_URL}/open-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            privateKey: params.privateKey,
            market: params.market,
            size: params.size,
            side: params.side,
            leverage: params.leverage || 10,
            useDelegation: params.useDelegation || false,
            userAddress: params.userAddress,
            stopLoss: params.stopLoss,
            takeProfit: params.takeProfit,
            isTestnet: params.isTestnet,
        }),
    });

    const data = (await response.json()) as any;
    return data;
}

// Close a position on Avantis (idempotent)
export async function closeAvantisPosition(params: ClosePositionParams) {
    const body: any = {
        market: params.market,
        isTestnet: params.isTestnet,
    };

    if (params.agentAddress) {
        body.agentAddress = params.agentAddress;
    } else if (params.privateKey) {
        body.privateKey = params.privateKey;
    }

    if (params.tradeId) body.tradeId = params.tradeId;
    if (params.useDelegation) body.useDelegation = params.useDelegation;
    if (params.userAddress) body.userAddress = params.userAddress;
    if (params.actualTradeIndex !== undefined) body.actualTradeIndex = params.actualTradeIndex;

    const response = await fetch(`${AVANTIS_SERVICE_URL}/close-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = (await response.json()) as any;
    return data;
}

// Transfer USDC (for profit share collection)
export async function transferAvantisUSDC(params: TransferParams) {
    const response = await fetch(`${AVANTIS_SERVICE_URL}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            agentPrivateKey: params.agentPrivateKey,
            toAddress: params.toAddress,
            amount: params.amount,
            vaultAddress: params.vaultAddress,
        }),
    });

    const data = (await response.json()) as any;
    return data;
}

// Get available trading pairs
export async function getAvantisMarketInfo() {
    const response = await fetch(`${AVANTIS_SERVICE_URL}/markets`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });

    const data = (await response.json()) as any;
    return data;
}

// Check Avantis service health
export async function checkAvantisHealth() {
    try {
        const response = await fetch(`${AVANTIS_SERVICE_URL}/health`, {
            method: 'GET',
        });
        const data = (await response.json()) as any;
        return { healthy: data.status === 'ok', ...data };
    } catch (error) {
        return { healthy: false, error: String(error) };
    }
}
