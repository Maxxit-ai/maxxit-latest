/**
 * Ostium Adapter
 * TypeScript wrapper for Ostium Python service
 * Similar to hyperliquid-adapter.ts but for Arbitrum-based Ostium
 */

import fetch from 'node-fetch';

const OSTIUM_SERVICE_URL =
  process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';

export interface OstiumPosition {
  market: string;
  marketFull?: string;
  side: 'long' | 'short';
  size: number;
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

export interface OstiumClosedPosition {
  market: string;
  marketFull: string;
  side: 'long' | 'short';
  orderAction: string;
  collateral: number;
  leverage: number;
  price: number;
  amountSentToTrader: number;
  pnlUsdc: number;
  profitPercent: number;
  totalProfitPercent: number;
  rolloverFee: number;
  fundingFee: number;
  executedAt: string;
  executedTx: string;
  tradeId: string;
  tradeIndex: string;
  isCancelled: boolean;
  cancelReason: string;
}

export interface OstiumBalance {
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
  stopLoss?: number;     // Stop-loss price level (protocol-level)
  takeProfit?: number;   // Take-profit price level (protocol-level)
}

export interface ClosePositionParams {
  privateKey?: string; // Legacy format
  agentAddress?: string; // New format (preferred)
  market: string;
  tradeId?: string; // Optional - more precise than market matching
  useDelegation?: boolean;
  userAddress?: string;
  actualTradeIndex?: number; // Stored trade index from when position was opened (fixes SDK bug)
}

export interface TransferParams {
  agentPrivateKey: string;
  toAddress: string;
  amount: number;
  vaultAddress?: string; // User's address for delegation
}

/**
 * Get Ostium balance for an address
 */
export async function getOstiumBalance(
  address: string
): Promise<OstiumBalance> {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get balance');
    }

    return data as OstiumBalance;
  } catch (error: any) {
    console.error('[Ostium] Balance check failed:', error.message);
    throw error;
  }
}

/**
 * Get open positions for an address
 */
export async function getOstiumPositions(
  address: string
): Promise<OstiumPosition[]> {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get positions');
    }

    return data.positions || [];
  } catch (error: any) {
    console.error('[Ostium] Get positions failed:', error.message);
    throw error;
  }
}

/**
 * Open a position on Ostium
 */
export async function openOstiumPosition(params: OpenPositionParams) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/open-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to open position');
    }

    // Return full response including orderId, txHash, and result
    return {
      ...data.result,
      orderId: data.orderId,
      tradeId: data.tradeId,
      txHash: data.txHash || data.transactionHash,
      status: data.status,
      message: data.message,
    };
  } catch (error: any) {
    console.error('[Ostium] Open position failed:', error.message);
    throw error;
  }
}

/**
 * Close a position on Ostium (idempotent)
 */
export async function closeOstiumPosition(params: ClosePositionParams) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/close-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to close position');
    }

    return data;
  } catch (error: any) {
    console.error('[Ostium] Close position failed:', error.message);
    throw error;
  }
}

/**
 * Transfer USDC (for profit share collection)
 */
export async function transferOstiumUSDC(params: TransferParams) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to transfer USDC');
    }

    return data.result;
  } catch (error: any) {
    console.error('[Ostium] Transfer failed:', error.message);
    throw error;
  }
}

/**
 * User approves agent to trade on their behalf
 */
export async function approveOstiumAgent(params: {
  userPrivateKey: string;
  agentAddress: string;
}) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/approve-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to approve agent');
    }

    return data;
  } catch (error: any) {
    console.error('[Ostium] Approve agent failed:', error.message);
    throw error;
  }
}

/**
 * Request testnet USDC from faucet
 */
export async function requestOstiumFaucet(address: string) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Faucet request failed');
    }

    return data;
  } catch (error: any) {
    console.error('[Ostium] Faucet request failed:', error.message);
    throw error;
  }
}

/**
 * Get available trading pairs
 */
export async function getOstiumMarketInfo() {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/market-info`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get market info');
    }

    return data.pairs;
  } catch (error: any) {
    console.error('[Ostium] Get market info failed:', error.message);
    throw error;
  }
}

/**
 * Check Ostium service health
 */
export async function checkOstiumHealth() {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/health`, {
      method: 'GET',
    });

    return await response.json();
  } catch (error: any) {
    console.error('[Ostium] Health check failed:', error.message);
    return { status: 'error', error: error.message };
  }
}

/**
 * Get closed position history for an address
 * Returns positions with actual PnL from Ostium's subgraph
 */
export async function getOstiumClosedPositions(
  address: string,
  count: number = 50
): Promise<OstiumClosedPosition[]> {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/closed-positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, count }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get closed positions');
    }

    return data.positions || [];
  } catch (error: any) {
    console.error('[Ostium] Get closed positions failed:', error.message);
    throw error;
  }
}

/**
 * Get a single order by ID (open or close)
 */
export async function getOstiumOrderById(orderId: string) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/order-by-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get order');
    }

    return data.order;
  } catch (error: any) {
    console.error('[Ostium] Get order by id failed:', error.message);
    throw error;
  }
}

/**
 * Get trade details by trade ID
 * Returns trade information including whether the position is still open
 */
export async function getOstiumTradeById(tradeId: string) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/trade-by-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get trade');
    }

    return data.trade;
  } catch (error: any) {
    console.error('[Ostium] Get trade by id failed:', error.message);
    throw error;
  }
}

/**
 * Get closed orders for a specific trade ID
 * Returns closed orders with PnL information (orderAction: "Close" and isCancelled: false)
 */
export async function getOstiumClosedTradeById(tradeId: string) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/closed-trade-by-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get closed trade');
    }

    return data.orders || [];
  } catch (error: any) {
    console.error('[Ostium] Get closed trade by id failed:', error.message);
    throw error;
  }
}

/**
 * Get cancelled orders for a specific trade ID
 * Returns cancelled orders
 */
export async function getOstiumCancelledOrdersById(tradeId: string) {
  try {
    const response = await fetch(`${OSTIUM_SERVICE_URL}/cancelled-orders-by-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get cancelled orders');
    }

    return data.orders || [];
  } catch (error: any) {
    console.error('[Ostium] Get cancelled orders by id failed:', error.message);
    throw error;
  }
}

