/**
 * SP1 ZK Prover Integration for Alpha Marketplace
 *
 * This library handles:
 * 1. Fetching trader performance data from the Ostium subgraph
 * 2. Computing trading metrics (PnL, win rate, trade count)
 * 3. Generating ZK proofs via the SP1 host binary (when available)
 * 4. Submitting proofs to the PositionRegistry contract on-chain
 *
 * Environment variables:
 *   SP1_PROVER_MODE     — "execute" (fast/test), "prove" (ZK proof), or empty (simulation)
 *   SP1_HOST_BINARY     — Path to compiled SP1 host binary
 *   POSITION_REGISTRY_ADDRESS — Deployed PositionRegistry contract address
 *   SP1_PRIVATE_KEY     — Private key for on-chain submission
 *   ARBITRUM_SEPOLIA_RPC — RPC URL
 *
 * @module lib/zk-prover
 */

import { spawn } from "child_process";
import path from "path";
import { ethers } from "ethers";

// ============================================================================
// Config
// ============================================================================

const OSTIUM_SUBGRAPH_URL =
    "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

const SP1_PROVER_MODE = process.env.SP1_PROVER_MODE || ""; // "" = simulation
const SP1_HOST_BINARY =
    process.env.SP1_HOST_BINARY ||
    path.join(process.cwd(), "sp1/target/release/ostium-trader-host");

// New: PositionRegistry replaces TraderRegistry
const POSITION_REGISTRY_ADDRESS = process.env.POSITION_REGISTRY_ADDRESS || process.env.TRADER_REGISTRY_ADDRESS;
const ARBITRUM_SEPOLIA_RPC = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const SP1_PRIVATE_KEY = process.env.SP1_PRIVATE_KEY;

const POSITION_REGISTRY_ABI = [
    "function verifyAlpha(bytes calldata publicValues, bytes calldata proofBytes) external",
    "function registry(bytes32 key) external view returns (uint32 tradeCount, uint32 winCount, int64 totalPnl, uint64 totalCollateral, uint64 startTimestamp, uint64 endTimestamp, uint64 featuredTradeId, uint32 featuredPairIndex, bool featuredIsBuy, uint32 featuredLeverage, uint64 featuredCollateral, uint128 featuredEntryPrice, bool featuredIsOpen, uint64 featuredTimestamp, uint256 verifiedAt)",
    "function getTraderAlphaCount(address trader) external view returns (uint256)",
    "function getTraderKeys(address trader) external view returns (bytes32[])"
];

// ============================================================================
// Types
// ============================================================================

interface SubgraphTrade {
    id: string;
    trader: string;
    index: string;
    isBuy: boolean;
    isOpen: boolean;
    collateral: string;
    leverage: string;
    openPrice: string;
    closePrice: string;
    timestamp: string;
    closeInitiated: string;
    funding: string;
    rollover: string;
    notional: string;
    pair: {
        id: string;
        from: string;
        to: string;
    };
}

export interface FeaturedPosition {
    trader: string;
    trade_id: number;
    pair_index: number;
    is_buy: boolean;
    leverage: string;   // 2 decimals (e.g. "500" = 5x)
    collateral: string; // 6 decimals (USDC raw)
    entry_price: string;// 18 decimals
    is_open: boolean;
    timestamp: string;
}

export interface TraderMetrics {
    totalPnl: number;
    tradeCount: number;
    winCount: number;
    totalCollateral: number;
    startBlock: number | null;
    endBlock: number | null;
}

export interface FeaturedPositionResult {
    tradeId: number;
    pairIndex: number;
    isBuy: boolean;
    leverage: number;
    collateral: number;
    entryPrice: number;
    isOpen: boolean;
    timestamp: number;
}

export interface ProofResult {
    success: boolean;
    metrics: TraderMetrics;
    featured: FeaturedPositionResult | null;
    proofId: string | null;
    proof: string | null;
    publicValues: string | null;
    txHash: string | null;
    isSimulated: boolean;
    error?: string;
}

// ============================================================================
// Subgraph Queries
// ============================================================================

/**
 * Fetch ALL closed trades for a trader from the Ostium subgraph.
 */
async function fetchClosedTrades(
    traderAddress: string
): Promise<SubgraphTrade[]> {
    const allTrades: SubgraphTrade[] = [];
    let skip = 0;
    const batchSize = 1000;

    while (true) {
        const query = `
      query GetClosedTrades($trader: String!, $first: Int!, $skip: Int!) {
        trades(
          where: {
            trader: $trader,
            isOpen: false
          }
          orderBy: timestamp
          orderDirection: desc
          first: $first
          skip: $skip
        ) {
          id
          trader
          index
          isBuy
          isOpen
          collateral
          leverage
          openPrice
          closePrice
          timestamp
          closeInitiated
          funding
          rollover
          notional
          pair {
            id
            from
            to
          }
        }
      }
    `;

        let response;
        try {
            response = await fetch(OSTIUM_SUBGRAPH_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query,
                    variables: {
                        trader: traderAddress.toLowerCase(),
                        first: batchSize,
                        skip,
                    },
                }),
            });
        } catch (e: any) {
            console.error("[sp1] Fetch failed at URL:", OSTIUM_SUBGRAPH_URL, e);
            throw e;
        }

        const result = (await response.json()) as {
            data?: { trades: SubgraphTrade[] };
            errors?: any[];
        };

        if (result.errors) {
            console.error("[sp1] Subgraph errors:", result.errors);
            throw new Error("Subgraph query failed: " + JSON.stringify(result.errors));
        }

        const trades = result.data?.trades || [];
        allTrades.push(...trades);

        if (trades.length < batchSize) break;
        skip += batchSize;

        if (allTrades.length >= 10000) break;
    }

    return allTrades;
}

/**
 * Fetch all open trades for a trader (for total collateral calculation).
 */
async function fetchOpenTrades(
    traderAddress: string
): Promise<SubgraphTrade[]> {
    const query = `
    query GetOpenTrades($trader: String!, $first: Int!) {
      trades(
        where: {
          trader: $trader,
          isOpen: true
        }
        orderBy: timestamp
        orderDirection: desc
        first: $first
      ) {
        id
        trader
        index
        collateral
        leverage
        openPrice
        timestamp
        isBuy
        isOpen
        notional
        pair {
          id
          from
          to
        }
      }
    }
  `;

    let response;
    try {
        response = await fetch(OSTIUM_SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: {
                    trader: traderAddress.toLowerCase(),
                    first: 1000,
                },
            }),
        });
    } catch (e: any) {
        console.error("[sp1] Open trades fetch failed:", e);
        throw e;
    }

    const result = (await response.json()) as {
        data?: { trades: SubgraphTrade[] };
        errors?: any[];
    };

    if (result.errors) {
        console.error("[sp1] Subgraph open trades errors:", result.errors);
        throw new Error("Subgraph query failed");
    }

    return result.data?.trades || [];
}

/**
 * Fetch a specific trade by its subgraph trade ID (index).
 * Returns the open trade matching the tradeId for the given trader.
 */
export async function fetchTradeById(
    traderAddress: string,
    tradeId: string
): Promise<SubgraphTrade | null> {
    const query = `
    query GetTradeById($tradeId: ID!) {
      trade(id: $tradeId) {
        id
        trader
        index
        isBuy
        isOpen
        collateral
        leverage
        openPrice
        closePrice
        timestamp
        closeInitiated
        funding
        rollover
        notional
        pair {
          id
          from
          to
        }
      }
    }
  `;

    let response;
    try {
        response = await fetch(OSTIUM_SUBGRAPH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                variables: {
                    tradeId: tradeId,
                },
            }),
        });
    } catch (e: any) {
        console.error("[sp1] Fetch trade by id failed:", e);
        throw e;
    }

    const result = (await response.json()) as {
        data?: { trade: SubgraphTrade | null };
        errors?: any[];
    };

    if (result.errors) {
        throw new Error("Subgraph query failed: " + JSON.stringify(result.errors));
    }

    const trade = result.data?.trade || null;
    // Verify trade belongs to this trader
    if (trade && trade.trader.toLowerCase() !== traderAddress.toLowerCase()) {
        return null;
    }
    return trade;
}

/**
 * Convert a SubgraphTrade to the FeaturedPosition format expected by SP1.
 */
export function subgraphTradeToFeatured(trade: SubgraphTrade): FeaturedPosition {
    return {
        trader: trade.trader,
        trade_id: parseInt(trade.id),
        pair_index: parseInt(trade.pair.id),
        is_buy: trade.isBuy,
        leverage: trade.leverage,
        collateral: trade.collateral,
        entry_price: trade.openPrice,
        is_open: trade.isOpen,
        timestamp: trade.timestamp,
    };
}

// ============================================================================
// Metric Computation (TypeScript fallback — matches Rust guest logic)
// ============================================================================

/**
 * Compute trader performance metrics from subgraph trade data.
 */
export function computeMetrics(
    closedTrades: SubgraphTrade[],
    openTrades: SubgraphTrade[] = []
): TraderMetrics {
    let totalPnl = 0;
    let winCount = 0;
    let totalCollateral = 0;

    for (const trade of closedTrades) {
        const collateral = Number(trade.collateral) / 1e6;
        totalCollateral += collateral;

        let tradePnl = 0;
        if (trade.closePrice && trade.openPrice) {
            const openPrice = Number(trade.openPrice) / 1e18;
            const closePrice = Number(trade.closePrice) / 1e18;
            const leverage = parseFloat(trade.leverage) / 100;

            if (openPrice > 0) {
                if (trade.isBuy) {
                    tradePnl = collateral * leverage * ((closePrice - openPrice) / openPrice);
                } else {
                    tradePnl = collateral * leverage * ((openPrice - closePrice) / openPrice);
                }
            }

            const fundingFee = trade.funding ? Number(trade.funding) / 1e18 : 0;
            const rolloverFee = trade.rollover ? Number(trade.rollover) / 1e18 : 0;
            tradePnl -= Math.abs(fundingFee) + Math.abs(rolloverFee);
        }

        totalPnl += tradePnl;
        if (tradePnl > 0) winCount++;
    }

    for (const trade of openTrades) {
        totalCollateral += Number(trade.collateral) / 1e6;
    }

    const allTimestamps = closedTrades
        .map((t) => parseInt(t.timestamp))
        .filter((t) => !isNaN(t));
    const startBlock = allTimestamps.length > 0 ? Math.min(...allTimestamps) : null;
    const endBlock = allTimestamps.length > 0 ? Math.max(...allTimestamps) : null;

    return {
        totalPnl: Math.round(totalPnl * 100) / 100,
        tradeCount: closedTrades.length,
        winCount,
        totalCollateral: Math.round(totalCollateral * 100) / 100,
        startBlock,
        endBlock,
    };
}

// ============================================================================
// SP1 ZK Proof Generation
// ============================================================================

/**
 * Generate a ZK proof via the SP1 host binary.
 * Sends combined input (trades + featured position) to the host via stdin.
 */
async function generateSP1Proof(
    closedTrades: SubgraphTrade[],
    featuredPosition: FeaturedPosition,
    _metrics: TraderMetrics
): Promise<{
    proofId: string | null;
    proof: string | null;
    publicValues: string | null;
    txHash: string | null;
    isSimulated: boolean;
    featured: FeaturedPositionResult | null;
}> {
    if (!SP1_PROVER_MODE) {
        console.log("[sp1] No SP1_PROVER_MODE configured — using simulation mode");
        return { proofId: null, proof: null, publicValues: null, txHash: null, isSimulated: true, featured: null };
    }

    try {
        // Convert subgraph trades to guest format
        const guestTrades = closedTrades.map((t) => ({
            trader: t.trader,
            is_buy: t.isBuy,
            collateral: t.collateral,
            leverage: t.leverage,
            open_price: t.openPrice,
            close_price: t.closePrice || "0",
            timestamp: t.timestamp,
            funding: t.funding || "0",
            rollover: t.rollover || "0",
        }));

        // Combined input: trades + featured position
        const hostInput = {
            trades: guestTrades,
            featured: featuredPosition,
        };

        const inputJson = JSON.stringify(hostInput);

        console.log(`[sp1] Running SP1 host in '${SP1_PROVER_MODE}' mode with ${closedTrades.length} trades + featured tradeId = ${featuredPosition.trade_id} `);

        // Spawn the SP1 host binary and pipe combined input via stdin
        const result = await new Promise<any>((resolve, reject) => {
            const child = spawn(
                SP1_HOST_BINARY,
                ["--mode", SP1_PROVER_MODE],
                {
                    env: { ...process.env },
                    stdio: ["pipe", "pipe", "pipe"],
                }
            );

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
            child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

            const timeout = setTimeout(() => {
                child.kill("SIGKILL");
                reject(new Error("SP1 host timed out after 30 minutes"));
            }, 1_800_000);

            child.on("error", (err: Error) => {
                clearTimeout(timeout);
                reject(err);
            });

            child.on("close", (code: number | null) => {
                clearTimeout(timeout);
                if (stderr) console.log(`[sp1] Host stderr: ${stderr} `);
                if (code !== 0) {
                    reject(new Error(`SP1 host exited with code ${code}: ${stderr} `));
                    return;
                }
                try {
                    // Native Gnark prover prints timing info to stdout before the JSON.
                    // Extract only the JSON object from the output.
                    const jsonStart = stdout.indexOf("{");
                    const jsonEnd = stdout.lastIndexOf("}");
                    if (jsonStart === -1 || jsonEnd === -1) {
                        throw new Error("No JSON object found in output");
                    }
                    const jsonStr = stdout.slice(jsonStart, jsonEnd + 1);
                    resolve(JSON.parse(jsonStr));
                } catch (e) {
                    reject(new Error(`Failed to parse SP1 output: ${stdout.slice(0, 500)} `));
                }
            });

            // Write combined input to stdin and close it
            child.stdin.write(inputJson);
            child.stdin.end();
        });

        if (!result.success) {
            throw new Error(result.error || "SP1 proof generation failed");
        }

        console.log(`[sp1] Proof generated: mode = ${result.mode}, trades = ${result.metrics.trade_count}, featured_tradeId = ${result.featured?.trade_id} `);

        const featuredResult: FeaturedPositionResult | null = result.featured ? {
            tradeId: result.featured.trade_id,
            pairIndex: result.featured.pair_index,
            isBuy: result.featured.is_buy,
            leverage: result.featured.leverage,
            collateral: result.featured.collateral,
            entryPrice: result.featured.entry_price,
            isOpen: result.featured.is_open,
            timestamp: result.featured.timestamp,
        } : null;

        return {
            proofId: result.vkey_hash || null,
            proof: result.proof || null,
            publicValues: result.public_values || null,
            txHash: null,
            isSimulated: result.mode === "execute",
            featured: featuredResult,
        };
    } catch (error: any) {
        console.error("[sp1] ZK proof generation failed:", error.message);
        console.log("[sp1] Falling back to simulation mode");
        return { proofId: null, proof: null, publicValues: null, txHash: null, isSimulated: true, featured: null };
    }
}

/**
 * Submits a generated SP1 proof to the PositionRegistry contract.
 */
export async function submitProofToRegistry(
    publicValues: string,
    proof: string
): Promise<string> {
    if (!POSITION_REGISTRY_ADDRESS || !SP1_PRIVATE_KEY) {
        throw new Error("Missing POSITION_REGISTRY_ADDRESS or SP1_PRIVATE_KEY in environment");
    }

    console.log(`[sp1] Submitting proof to registry at ${POSITION_REGISTRY_ADDRESS}...`);

    const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(SP1_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(POSITION_REGISTRY_ADDRESS, POSITION_REGISTRY_ABI, wallet);

    const publicValuesHex = (publicValues.startsWith("0x") ? publicValues : `0x${publicValues}`).trim();
    const proofHex = (proof.startsWith("0x") ? proof : `0x${proof}`).trim();

    console.log(`[sp1] publicValues length: ${(publicValuesHex.length - 2) / 2} bytes`);
    console.log(`[sp1] proofBytes length: ${(proofHex.length - 2) / 2} bytes`);

    const tx = await contract.verifyAlpha(publicValuesHex, proofHex);
    console.log(`[sp1] Submission transaction sent: ${tx.hash} `);

    await tx.wait();
    console.log("[sp1] Submission verified on-chain");

    return tx.hash;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Generate a proof of trading performance + a featured position.
 *
 * Flow:
 * 1. Fetch all closed trades from Ostium subgraph
 * 2. Fetch/validate the featured position (by tradeId)
 * 3. Compute aggregate performance metrics
 * 4. Generate ZK proof via SP1 (or fallback to simulation)
 *
 * @param traderAddress - The trader's wallet address
 * @param featuredTradeId - Optional: the trade index to feature (from Ostium subgraph)
 */
export async function generateProof(
    traderAddress: string,
    featuredTradeId?: string
): Promise<ProofResult> {
    try {
        console.log(`[sp1] Generating proof for trader: ${traderAddress}${featuredTradeId ? `, featured tradeId: ${featuredTradeId}` : ''} `);

        // ---- Step 1: Fetch trades from subgraph ----
        const [closedTrades, openTrades] = await Promise.all([
            fetchClosedTrades(traderAddress),
            fetchOpenTrades(traderAddress),
        ]);

        console.log(
            `[sp1] Fetched ${closedTrades.length} closed, ${openTrades.length} open trades`
        );

        // ---- Step 2: Resolve the featured position ----
        let featuredPosition: FeaturedPosition;

        if (featuredTradeId) {
            // Fetch the specific trade
            const trade = await fetchTradeById(traderAddress, featuredTradeId);
            if (!trade) {
                return {
                    success: false,
                    metrics: { totalPnl: 0, tradeCount: 0, winCount: 0, totalCollateral: 0, startBlock: null, endBlock: null },
                    featured: null,
                    proofId: null, proof: null, publicValues: null, txHash: null,
                    isSimulated: true,
                    error: `Trade ${featuredTradeId} not found for trader ${traderAddress}`,
                };
            }
            if (!trade.isOpen) {
                return {
                    success: false,
                    metrics: { totalPnl: 0, tradeCount: 0, winCount: 0, totalCollateral: 0, startBlock: null, endBlock: null },
                    featured: null,
                    proofId: null, proof: null, publicValues: null, txHash: null,
                    isSimulated: true,
                    error: `Trade ${featuredTradeId} is not open — can only feature open positions`,
                };
            }
            featuredPosition = subgraphTradeToFeatured(trade);
        } else if (openTrades.length > 0) {
            // Default: use the most recent open trade
            featuredPosition = subgraphTradeToFeatured(openTrades[0]);
            console.log(`[sp1] No tradeId specified, using most recent open trade: ${featuredPosition.trade_id} `);
        } else {
            // No open trades — create a dummy featured position
            featuredPosition = {
                trader: traderAddress.toLowerCase(),
                trade_id: 0,
                pair_index: 0,
                is_buy: false,
                leverage: "0",
                collateral: "0",
                entry_price: "0",
                is_open: false,
                timestamp: "0",
            };
            console.log("[sp1] No open trades, using empty featured position");
        }

        // ---- Step 3: Compute metrics ----
        const metrics = computeMetrics(closedTrades, openTrades);
        console.log(
            `[sp1] Computed metrics: PnL = ${metrics.totalPnl}, trades = ${metrics.tradeCount}, wins = ${metrics.winCount}, collateral = ${metrics.totalCollateral} `
        );

        // ---- Step 4: Generate ZK proof ----
        const sp1Result = await generateSP1Proof(closedTrades, featuredPosition, metrics);

        return {
            success: true,
            metrics,
            featured: sp1Result.featured,
            proofId: sp1Result.proofId,
            txHash: sp1Result.txHash,
            isSimulated: sp1Result.isSimulated,
            proof: sp1Result.proof,
            publicValues: sp1Result.publicValues,
        };
    } catch (error: any) {
        console.error("[sp1] Proof generation failed:", error.message);
        return {
            success: false,
            metrics: {
                totalPnl: 0,
                tradeCount: 0,
                winCount: 0,
                totalCollateral: 0,
                startBlock: null,
                endBlock: null,
            },
            featured: null,
            proofId: null,
            proof: null,
            publicValues: null,
            txHash: null,
            isSimulated: true,
            error: error.message,
        };
    }
}

/**
 * Check if SP1 prover is configured.
 */
export function isSP1Configured(): boolean {
    return !!SP1_PROVER_MODE;
}

/**
 * Get the current SP1 configuration status.
 */
export function getProverConfig() {
    return {
        mode: SP1_PROVER_MODE || "simulation",
        hostBinary: SP1_HOST_BINARY,
        isConfigured: !!SP1_PROVER_MODE,
    };
}
