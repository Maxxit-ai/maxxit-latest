import { prisma } from '@maxxit/database';
/**
 * Trade Executor - Calls external venue services via HTTP
 * Routes signals to appropriate venue services (Hyperliquid, Ostium)
 */

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  positionId?: string;
  error?: string;
  reason?: string;
  ostiumTradeIndex?: number;
  tradeId?: string;
  orderId?: string;
  entryPrice?: number;
  collateral?: number;
  leverage?: number;
}

const HYPERLIQUID_SERVICE_URL = process.env.HYPERLIQUID_SERVICE_URL || 'https://hyperliquid-service.onrender.com';
const OSTIUM_SERVICE_URL = process.env.OSTIUM_SERVICE_URL || 'http://localhost:5002';

/**
 * Execute a trade signal by calling the appropriate venue service
 */
export async function executeTrade(
  signal: any,
  deployment: any
): Promise<ExecutionResult> {
  try {
    console.log(`[TradeExecutor] Executing ${signal.side} ${signal.token_symbol} on ${signal.venue}`);
    
    // Route to appropriate venue service
    if (signal.venue === 'HYPERLIQUID') {
      return await executeHyperliquidTrade(signal, deployment);
    } else if (signal.venue === 'OSTIUM' || signal.venue === 'MULTI') {
      return await executeOstiumTrade(signal, deployment);
    } else {
      return {
        success: false,
        error: `Venue ${signal.venue} not supported yet`,
      };
    }
  } catch (error: any) {
    console.error('[TradeExecutor] Execution error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute trade on Hyperliquid via external service
 */
async function executeHyperliquidTrade(
  signal: any,
  deployment: any
): Promise<ExecutionResult> {
  try {
    const sizeModel = typeof signal.size_model === 'string' 
      ? JSON.parse(signal.size_model) 
      : signal.size_model;
    
    const riskModel = typeof signal.risk_model === 'string'
      ? JSON.parse(signal.risk_model)
      : signal.risk_model;

    // Get user's Hyperliquid agent address from user_agent_addresses
    const userAddress = await prisma.user_agent_addresses.findUnique({
      where: { user_wallet: deployment.user_wallet.toLowerCase() },
      select: { hyperliquid_agent_address: true },
    });

    if (!userAddress?.hyperliquid_agent_address) {
      throw new Error('No Hyperliquid agent address configured for this user. Please run setup first.');
    }

    // Get agent private key (handles user_agent_addresses encryption)
    const { getPrivateKeyForAddress } = await import('./wallet-helper');
    const agentPrivateKey = await getPrivateKeyForAddress(userAddress.hyperliquid_agent_address);

    if (!agentPrivateKey) {
      throw new Error(`Agent private key not found for address ${userAddress.hyperliquid_agent_address}`);
    }

    // Get user's Hyperliquid balance via Python service
    const balanceResponse = await fetch(`${HYPERLIQUID_SERVICE_URL}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: userAddress.hyperliquid_agent_address,
      }),
    });
    
    if (!balanceResponse.ok) {
      throw new Error(`Failed to fetch Hyperliquid balance: ${balanceResponse.status}`);
    }
    
    const balanceData = await balanceResponse.json() as any;
    
    if (!balanceData.success) {
      throw new Error(balanceData.error || 'Failed to get Hyperliquid balance');
    }
    
    const availableBalance = parseFloat(balanceData.withdrawable || '0');
    
    // Hyperliquid minimum order size is $10
    const HYPERLIQUID_MIN_ORDER = 10;
    
    if (availableBalance < HYPERLIQUID_MIN_ORDER) {
      throw new Error(`Order must have minimum value of $10. Available: $${availableBalance.toFixed(2)}`);
    }
    
    let positionSize: number;
    
    // Use LLM decision for position size if available, otherwise fall back to size_model
    if (signal.llm_should_trade && signal.llm_fund_allocation) {
      // Use LLM-generated allocation
      positionSize = (availableBalance * signal.llm_fund_allocation) / 100;
      console.log(`[TradeExecutor] Using LLM decision for position sizing: ${signal.llm_fund_allocation.toFixed(2)}% of balance`);
    } else {
      // Fall back to size_model
      if (sizeModel.type === 'fixed-usdc') {
        // Manual trades: Use exact USDC amount specified
        positionSize = sizeModel.value || 0;
      } else {
        // Auto trades: Use percentage of actual balance (from Agent HOW)
        const percentageToUse = sizeModel.value || 5;
        positionSize = (availableBalance * percentageToUse) / 100;
      }
      console.log(`[TradeExecutor] Using size_model for position sizing: ${sizeModel.value || 5}% of balance`);
    }
    
    // Ensure position size meets minimum requirement
    positionSize = Math.max(positionSize, HYPERLIQUID_MIN_ORDER);
    
    // Validate positionSize
    if (!positionSize || positionSize <= 0 || isNaN(positionSize)) {
      throw new Error(`Invalid position size calculated: $${positionSize}. Please check balance and percentage settings.`);
    }
    
    // Final check: ensure user has enough balance
    if (positionSize > availableBalance) {
      throw new Error(`Insufficient balance. Available: $${availableBalance.toFixed(2)}, Required: $${positionSize.toFixed(2)}`);
    }
    
    console.log(`[TradeExecutor] Position sizing: ${positionSize.toFixed(2)} USDC`);
    if (signal.llm_decision) {
      console.log(`[TradeExecutor] LLM Reasoning: ${signal.llm_decision}`);
    }

    // Call Hyperliquid service /open-position endpoint
    const response = await fetch(`${HYPERLIQUID_SERVICE_URL}/open-position`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agentPrivateKey: agentPrivateKey, // From user_agent_addresses (decrypted)
        coin: signal.token_symbol,
        isBuy: signal.side === 'LONG',
        size: positionSize, // Use calculated percentage-based position size
        slippage: 0.01, // 1% slippage
        vaultAddress: deployment.safe_wallet || deployment.user_wallet, // User's wallet (agent trading on behalf)
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hyperliquid service error: ${response.status} ${error}`);
    }

    const result = await response.json() as any;
    
    return {
      success: true,
      txHash: result.txHash || result.hash,
      positionId: result.positionId,
    };
  } catch (error: any) {
    console.error('[TradeExecutor] Hyperliquid execution failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Execute trade on Ostium via external service
 */
async function executeOstiumTrade(
  signal: any,
  deployment: any
): Promise<ExecutionResult> {
  try {
    const sizeModel = typeof signal.size_model === 'string' 
      ? JSON.parse(signal.size_model) 
      : signal.size_model;
    
    const riskModel = typeof signal.risk_model === 'string'
      ? JSON.parse(signal.risk_model)
      : signal.risk_model;

    // Get user's Ostium agent address from user_agent_addresses
    const userAddress = await prisma.user_agent_addresses.findUnique({
      where: { user_wallet: deployment.user_wallet.toLowerCase() },
      select: { ostium_agent_address: true },
    });

    if (!userAddress?.ostium_agent_address) {
      throw new Error('No Ostium agent address configured for this user. Please run setup first.');
    }

    if (!deployment.safe_wallet) {
      throw new Error('No safe_wallet (user address) configured for this deployment');
    }

    if (!signal.token_symbol) {
      throw new Error('No token_symbol in signal');
    }

    // Get user's USDC balance on Ostium via Python service
    const userArbitrumWallet = deployment.safe_wallet || deployment.user_wallet;
    const balanceResponse = await fetch(`${OSTIUM_SERVICE_URL}/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: userArbitrumWallet,
      }),
    });
    
    if (!balanceResponse.ok) {
      throw new Error(`Failed to fetch Ostium balance: ${balanceResponse.status}`);
    }
    
    const balanceData = await balanceResponse.json() as any;
    
    if (!balanceData.success) {
      throw new Error(balanceData.error || 'Failed to get Ostium balance');
    }
    
    const usdcBalance = parseFloat(balanceData.usdcBalance || '0');
    
    // Ostium minimum order size is $10
    const OSTIUM_MIN_ORDER = 0.1;
    
    if (usdcBalance < OSTIUM_MIN_ORDER) {
      throw new Error(`Order must have minimum value of $0.1. Balance: $${usdcBalance.toFixed(2)}`);
    }

    // ====== STEP 1: Find max leverage for this token from ostium_available_pairs ======
    const tokenSymbol = signal.token_symbol;
    
    // Try multiple matching strategies
    const possibleSymbols = [
      `${tokenSymbol}/USD`,  // BTC/USD
      `USD/${tokenSymbol}`,  // USD/JPY
    ];
    
    let ostiumPair = null;
    
    // First try exact matches with /USD or USD/
    for (const symbol of possibleSymbols) {
      ostiumPair = await prisma.ostium_available_pairs.findFirst({
        where: { symbol },
      });
      if (ostiumPair) break;
    }
    
    // If no match, try partial match (token appears in either part of the pair)
    if (!ostiumPair) {
      ostiumPair = await prisma.ostium_available_pairs.findFirst({
        where: {
          OR: [
            { symbol: { startsWith: `${tokenSymbol}/` } },
            { symbol: { endsWith: `/${tokenSymbol}` } },
          ],
        },
      });
    }
    
    if (!ostiumPair) {
      throw new Error(`Token ${tokenSymbol} not found in Ostium available pairs. Please check if this market is supported.`);
    }
    
    const maxLeverage = ostiumPair.max_leverage;
    console.log(`[TradeExecutor] Found Ostium pair: ${ostiumPair.symbol} with max leverage: ${maxLeverage}x`);
    
    // Use LLM decision for fund allocation and leverage if available, otherwise fall back to original logic
    let collateralUSDC: number;
    let leverage: number;
    
    if (signal.llm_should_trade && signal.llm_fund_allocation && signal.llm_leverage) {
      // Use LLM-generated allocation and leverage
      collateralUSDC = (usdcBalance * signal.llm_fund_allocation) / 100;
      leverage = Math.max(1, Math.min(maxLeverage || 10, signal.llm_leverage));
      console.log(`[TradeExecutor] Using LLM decision: ${signal.llm_fund_allocation.toFixed(2)}% allocation, ${leverage}x leverage`);
    } else {
      // Fall back to original logic
      
      // Fetch user trading preferences
      const userPreferences = await prisma.user_trading_preferences.findUnique({
        where: { user_wallet: deployment.user_wallet.toLowerCase() },
      });
      
      // Calculate weighted score from preferences
      let leveragePercentage = 50; // Default to 50% if no preferences set
      
      if (userPreferences) {
        // Weighted calculation (higher weight for risk_tolerance, social_sentiment, trade_frequency)
        const weightedScore = 
          (userPreferences.risk_tolerance * 0.30) +      // 30% weight
          (userPreferences.social_sentiment_weight * 0.25) + // 25% weight
          (userPreferences.trade_frequency * 0.25) +     // 25% weight
          (userPreferences.price_momentum_focus * 0.10) + // 10% weight
          (userPreferences.market_rank_priority * 0.10);  // 10% weight
        
        leveragePercentage = Math.round(weightedScore); // Already 0-100
        console.log(`[TradeExecutor] User preferences calculated leverage percentage: ${leveragePercentage}%`);
        console.log(`[TradeExecutor]   - Risk Tolerance: ${userPreferences.risk_tolerance}`);
        console.log(`[TradeExecutor]   - Social Sentiment: ${userPreferences.social_sentiment_weight}`);
        console.log(`[TradeExecutor]   - Trade Frequency: ${userPreferences.trade_frequency}`);
        console.log(`[TradeExecutor]   - Price Momentum: ${userPreferences.price_momentum_focus}`);
        console.log(`[TradeExecutor]   - Market Rank: ${userPreferences.market_rank_priority}`);
      } else {
        console.log(`[TradeExecutor] No user preferences found, using default ${leveragePercentage}% of max leverage`);
      }
      
      // Use default max leverage of 10x if not available
      const defaultMaxLeverage = 10;
      const effectiveMaxLeverage = maxLeverage || defaultMaxLeverage;
      leverage = Math.max(1, Math.floor((effectiveMaxLeverage * leveragePercentage) / 100));
      console.log(`[TradeExecutor] Calculated leverage: ${leverage}x (${leveragePercentage}% of max ${effectiveMaxLeverage}x)`);
      
      // Calculate collateral based on signal's size_model (Agent HOW percentage)
      if (sizeModel.type === 'fixed-usdc') {
        // Manual trades: Use exact USDC amount specified
        collateralUSDC = sizeModel.value || 0;
      } else {
        // Auto trades: Use percentage of actual balance (from Agent HOW)
        const percentageToUse = sizeModel.value || 5;
        collateralUSDC = (usdcBalance * percentageToUse) / 100;
      }
    }

    // Ensure collateral meets minimum requirement
    collateralUSDC = Math.max(collateralUSDC, OSTIUM_MIN_ORDER);
    
    // Validate collateralUSDC
    if (!collateralUSDC || collateralUSDC <= 0 || isNaN(collateralUSDC)) {
      throw new Error(`Invalid position size calculated: $${collateralUSDC}. Please check balance and percentage settings.`);
    }
    
    // Final check: ensure user has enough balance
    if (collateralUSDC > usdcBalance) {
      throw new Error(`Insufficient balance. Available: $${usdcBalance.toFixed(2)}, Required: $${collateralUSDC.toFixed(2)}`);
    }

    console.log(`[TradeExecutor] Preparing Ostium request:`);
    console.log(`[TradeExecutor]    agentAddress: ${userAddress.ostium_agent_address}`);
    console.log(`[TradeExecutor]    userAddress: ${userArbitrumWallet}`);
    console.log(`[TradeExecutor]    market: ${signal.token_symbol}`);
    console.log(`[TradeExecutor]    side: ${signal.side.toLowerCase()}`);
    console.log(`[TradeExecutor]    collateral: ${collateralUSDC.toFixed(2)} USDC`);
    console.log(`[TradeExecutor]    leverage: ${leverage}x`);
    
    if (signal.llm_decision) {
      console.log(`[TradeExecutor]    LLM Reasoning: ${signal.llm_decision}`);
    }

    // Extract TP/SL from riskModel if available
    const stopLossPercent = riskModel?.stopLoss || riskModel?.stop_loss_percent;
    const takeProfitPercent = riskModel?.takeProfit || riskModel?.take_profit_percent;
    
    if (stopLossPercent) {
      console.log(`[TradeExecutor]    stopLoss: ${(stopLossPercent * 100).toFixed(2)}%`);
    }
    if (takeProfitPercent) {
      console.log(`[TradeExecutor]    takeProfit: ${(takeProfitPercent * 100).toFixed(2)}%`);
    }

    // Call Ostium service /open-position endpoint
    const response = await fetch(`${OSTIUM_SERVICE_URL}/open-position`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agentAddress: userAddress.ostium_agent_address, // Agent's address (private key looked up in service)
        userAddress: userArbitrumWallet, // User's wallet
        market: signal.token_symbol,
        side: signal.side.toLowerCase(), // "long" or "short"
        collateral: collateralUSDC, // Use calculated percentage-based collateral
        leverage: leverage,
        stopLossPercent: stopLossPercent, // Pass SL percentage to service
        takeProfitPercent: takeProfitPercent, // Pass TP percentage to service
        deploymentId: deployment.id,
        signalId: signal.id,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ostium service error: ${response.status} ${error}`);
    }

    const result = await response.json() as any;

    console.log(`[TradeExecutor] Ostium response:`, JSON.stringify(result, null, 2));

    const actualTradeIndex = result.actualTradeIndex ?? result.result?.actualTradeIndex;
    const resultData = result.result || {};
    
    const entryPrice = result.entryPrice || resultData.entryPrice || 0;
    
    const tradeId = result.tradeId || result.orderId || null;
    const orderId = result.orderId || result.tradeId || null;
    
    console.log(`[TradeExecutor]    Trade Index: ${actualTradeIndex ?? 'pending (keeper not filled yet)'}`);
    console.log(`[TradeExecutor]    Entry Price: $${entryPrice || 'pending'}`);
    console.log(`[TradeExecutor]    Collateral: ${resultData.collateral || collateralUSDC} USDC`);
    console.log(`[TradeExecutor]    Leverage: ${resultData.leverage || leverage}x`);

    return {
      success: true,
      txHash: result.txHash || result.transactionHash,
      positionId: result.positionId || orderId || tradeId,
      ostiumTradeIndex: actualTradeIndex,
      tradeId: tradeId,
      orderId: orderId,
      entryPrice: entryPrice,
      collateral: resultData.collateral || collateralUSDC,
      leverage: resultData.leverage || leverage,
    };
  } catch (error: any) {
    console.error('[TradeExecutor] Ostium execution failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if venue service is available
 */
export async function checkVenueServiceHealth(venue: string): Promise<boolean> {
  try {
    let url = '';
    if (venue === 'HYPERLIQUID') {
      url = `${HYPERLIQUID_SERVICE_URL}/health`;
    } else if (venue === 'OSTIUM') {
      url = `${OSTIUM_SERVICE_URL}/health`;
    } else {
      return false;
    }

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}
