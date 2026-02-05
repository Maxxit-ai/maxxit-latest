/**
 * Ostium Symbol Mapper
 * 
 * Maps extracted token symbols from LLM classification to Ostium-compatible trading pairs.
 * Uses in-memory cache with periodic refresh from database.
 * 
 * Flow:
 * 1. Load pairs from ostium_available_pairs table on startup
 * 2. Refresh cache every hour (configurable)
 * 3. Map user-friendly names (GOLD, SILVER) to Ostium symbols (XAU, XAG)
 * 4. Validate that mapped symbol exists in available pairs
 */

import { prisma } from '@maxxit/database';

// Cache refresh interval: 24 hours (in milliseconds)
const CACHE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

// Types
interface OstiumPair {
    id: number;
    symbol: string;        // e.g., "XAU/USD", "BTC/USD"
    baseSymbol: string;    // e.g., "XAU", "BTC"
    quoteSymbol: string;   // e.g., "USD", "JPY"
    group: string;         // e.g., "crypto", "commodities", "forex"
    maxLeverage: number;
}

interface SymbolMappingResult {
    originalSymbol: string;      // What LLM extracted (e.g., "GOLD")
    ostiumSymbol: string | null; // Mapped Ostium symbol (e.g., "XAU") or null if not supported
    ostiumPair: string | null;   // Full pair (e.g., "XAU/USD") or null if not supported
    pairId: number | null;       // Ostium pair ID for trading
    isSupported: boolean;        // Whether this can be traded on Ostium
    group: string | null;        // Asset group (crypto, commodities, forex, etc.)
}

// ============================================================================
// STATIC ALIAS MAPPING
// Maps common names/aliases to Ostium base symbols
// ============================================================================
const SYMBOL_ALIASES: Record<string, string> = {
    // Commodities - Precious Metals
    'GOLD': 'XAU',
    'XAUUSD': 'XAU',
    'GLD': 'XAU',
    'SILVER': 'XAG',
    'XAGUSD': 'XAG',
    'SLV': 'XAG',
    'PLATINUM': 'XPT',
    'PALLADIUM': 'XPD',

    // Commodities - Energy
    'OIL': 'CL',
    'CRUDE': 'CL',
    'CRUDEOIL': 'CL',
    'WTI': 'CL',
    'USOIL': 'CL',
    'BRENT': 'CL',
    'COPPER': 'HG',

    // Crypto - Full names
    'BITCOIN': 'BTC',
    'ETHEREUM': 'ETH',
    'SOLANA': 'SOL',
    'RIPPLE': 'XRP',
    'BINANCECOIN': 'BNB',
    'CARDANO': 'ADA',
    'CHAINLINK': 'LINK',
    'TRON': 'TRX',
    'HYPERLIQUID': 'HYPE',

    // Forex - Common variations
    'EURUSD': 'EUR',
    'GBPUSD': 'GBP',
    'USDJPY': 'USD',  // Note: This is tricky, USD/JPY has USD as base
    'AUDUSD': 'AUD',
    'NZDUSD': 'NZD',
    'USDCAD': 'USD',
    'USDCHF': 'USD',
    'USDMXN': 'USD',

    // Indices - Common names
    'SP500': 'SPX',
    'S&P500': 'SPX',
    'S&P': 'SPX',
    'SPY': 'SPX',
    'NASDAQ': 'NDX',
    'NASDAQ100': 'NDX',
    'QQQ': 'NDX',
    'DOWJONES': 'DJI',
    'DOW': 'DJI',
    'DJ30': 'DJI',
    'NIKKEI': 'NIK',
    'NIKKEI225': 'NIK',
    'FTSE100': 'FTSE',
    'HANGSENG': 'HSI',
    'HSI': 'HSI',

    // Stocks - Common variations
    'NVIDIA': 'NVDA',
    'GOOGLE': 'GOOG',
    'ALPHABET': 'GOOG',
    'AMAZON': 'AMZN',
    'FACEBOOK': 'META',
    'TESLA': 'TSLA',
    'APPLE': 'AAPL',
    'MICROSOFT': 'MSFT',
    'COINBASE': 'COIN',
    'ROBINHOOD': 'HOOD',
    'MICROSTRATEGY': 'MSTR',
    'CIRCLE': 'CRCL',
    'GALAXY': 'GLXY',
    'GALAXYDIGITAL': 'GLXY',
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
let cachedPairs: Map<string, OstiumPair> = new Map();  // fullSymbol (e.g., "XAU/USD") -> pair info
let baseSymbolMap: Map<string, string[]> = new Map();  // baseSymbol (e.g., "XAU") -> array of full symbols
let cacheLastRefresh: Date | null = null;
let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Load pairs from database into cache
 */
async function refreshPairsCache(): Promise<void> {
    try {
        console.log('[OstiumMapper] 🔄 Refreshing pairs cache from database...');

        const pairs = await prisma.ostium_available_pairs.findMany({
            select: {
                id: true,
                symbol: true,
                group: true,
                max_leverage: true,
            },
        });

        const newCache = new Map<string, OstiumPair>();
        const newBaseMap = new Map<string, string[]>();

        for (const pair of pairs) {
            // Parse symbol (e.g., "XAU/USD" -> baseSymbol="XAU", quoteSymbol="USD")
            const [baseSymbol, quoteSymbol] = pair.symbol.split('/');

            if (baseSymbol) {
                const pairInfo: OstiumPair = {
                    id: pair.id,
                    symbol: pair.symbol,
                    baseSymbol: baseSymbol.toUpperCase(),
                    quoteSymbol: quoteSymbol?.toUpperCase() || 'USD',
                    group: pair.group || 'unknown',
                    maxLeverage: pair.max_leverage || 1,
                };

                // Store by FULL symbol (e.g., "XAU/USD")
                newCache.set(pair.symbol, pairInfo);

                // Also track which base symbols map to which full symbols
                const baseUpper = baseSymbol.toUpperCase();
                if (!newBaseMap.has(baseUpper)) {
                    newBaseMap.set(baseUpper, []);
                }
                newBaseMap.get(baseUpper)!.push(pair.symbol);
            }
        }

        cachedPairs = newCache;
        baseSymbolMap = newBaseMap;
        cacheLastRefresh = new Date();

        console.log(`[OstiumMapper] ✅ Loaded ${cachedPairs.size} pairs into cache`);
        console.log(`[OstiumMapper] 📋 Unique base symbols: ${baseSymbolMap.size}`);
    } catch (error: any) {
        console.error('[OstiumMapper] ❌ Failed to refresh pairs cache:', error.message);
        // Don't clear existing cache on error - use stale data rather than no data
    }
}

/**
 * Initialize the mapper - call this on worker startup
 */
export async function initializeOstiumMapper(): Promise<void> {
    console.log('[OstiumMapper] 🚀 Initializing Ostium Symbol Mapper...');

    // Load initial cache
    await refreshPairsCache();

    // Set up periodic refresh
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }

    refreshInterval = setInterval(async () => {
        await refreshPairsCache();
    }, CACHE_REFRESH_INTERVAL);

    console.log(`[OstiumMapper] ⏱️  Cache refresh interval: ${CACHE_REFRESH_INTERVAL / 1000 / 60} minutes`);
    console.log('[OstiumMapper] ✅ Ostium Symbol Mapper initialized');
}

/**
 * Cleanup - call on worker shutdown
 */
export function shutdownOstiumMapper(): void {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    console.log('[OstiumMapper] 🛑 Ostium Symbol Mapper stopped');
}

/**
 * Map a symbol extracted by LLM to an Ostium-compatible pair
 * 
 * @param extractedSymbol - The symbol extracted by LLM (e.g., "GOLD", "BTC", "SILVER")
 * @returns Mapping result with Ostium pair info or null if not supported
 */
export function mapToOstiumSymbol(extractedSymbol: string): SymbolMappingResult {
    const upperSymbol = extractedSymbol.toUpperCase().trim();
    console.log("upperSymbol: ", upperSymbol);

    // Step 1: Check if it's an alias that needs translation
    const translatedSymbol = SYMBOL_ALIASES[upperSymbol] || upperSymbol;
    console.log("translatedSymbol: ", translatedSymbol);

    // Step 2: Look up base symbol in baseSymbolMap to get full symbol(s)
    const fullSymbols = baseSymbolMap.get(translatedSymbol);

    if (fullSymbols && fullSymbols.length > 0) {
        // Get the first matching pair (prefer USD pairs for most assets)
        const preferredPair = fullSymbols.find(s => s.endsWith('/USD')) || fullSymbols[0];
        const pair = cachedPairs.get(preferredPair);

        if (pair) {
            console.log(`[OstiumMapper] ✅ Mapped "${extractedSymbol}" → "${pair.symbol}" (${pair.group})`);
            return {
                originalSymbol: extractedSymbol,
                ostiumSymbol: pair.baseSymbol,
                ostiumPair: pair.symbol,
                pairId: pair.id,
                isSupported: true,
                group: pair.group,
            };
        }
    }

    // Step 3: Not found - check if alias was applied but still no match
    if (translatedSymbol !== upperSymbol) {
        console.log(`[OstiumMapper] ⚠️  "${extractedSymbol}" → "${translatedSymbol}" (alias found, but not available on Ostium)`);
    } else {
        console.log(`[OstiumMapper] ⚠️  "${extractedSymbol}" not available on Ostium`);
    }

    return {
        originalSymbol: extractedSymbol,
        ostiumSymbol: null,
        ostiumPair: null,
        pairId: null,
        isSupported: false,
        group: null,
    };
}

/**
 * Map multiple symbols and filter to only supported ones
 * 
 * @param extractedTokens - Array of tokens extracted by LLM
 * @returns Object with supported and unsupported mappings
 */
export function mapTokensToOstium(extractedTokens: string[]): {
    supported: SymbolMappingResult[];
    unsupported: SymbolMappingResult[];
    all: SymbolMappingResult[];
} {
    const results = extractedTokens.map(token => mapToOstiumSymbol(token));

    return {
        supported: results.filter(r => r.isSupported),
        unsupported: results.filter(r => !r.isSupported),
        all: results,
    };
}

/**
 * Check if cache is initialized and fresh
 */
export function isCacheReady(): boolean {
    return cachedPairs.size > 0 && cacheLastRefresh !== null;
}

/**
 * Get cache stats for health checks
 */
export function getCacheStats(): {
    pairCount: number;
    lastRefresh: Date | null;
    isReady: boolean;
} {
    return {
        pairCount: cachedPairs.size,
        lastRefresh: cacheLastRefresh,
        isReady: isCacheReady(),
    };
}

/**
 * Get all available Ostium pairs (for debugging/admin)
 */
export function getAvailablePairs(): OstiumPair[] {
    return Array.from(cachedPairs.values());
}

/**
 * Force refresh cache (for admin/testing)
 */
export async function forceRefreshCache(): Promise<void> {
    await refreshPairsCache();
}
