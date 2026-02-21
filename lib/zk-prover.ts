/**
 * SP1 ZK Prover Integration for Alpha Marketplace
 *
 * This library handles:
 * 1. Fetching trader performance data from the Ostium subgraph
 * 2. Computing trading metrics (PnL, win rate, trade count)
 * 3. Generating ZK proofs via the SP1 host binary (when available)
 * 4. Falling back to subgraph-computed metrics when SP1 is not configured
 *
 * Environment variables:
 *   SP1_PROVER_MODE     — "execute" (fast/test), "prove" (ZK proof), or empty (simulation)
 *   SP1_HOST_BINARY     — Path to compiled SP1 host binary (default: sp1/script/target/release/ostium-trader-host)
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

const TRADER_REGISTRY_ADDRESS = process.env.TRADER_REGISTRY_ADDRESS;
const ARBITRUM_SEPOLIA_RPC = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const SP1_PRIVATE_KEY = process.env.SP1_PRIVATE_KEY;

const TRADER_REGISTRY_ABI = [
    "function verifyTraderPerformance(bytes calldata publicValues, bytes calldata proofBytes) external",
    "function registry(address trader) external view returns (uint32 tradeCount, uint32 winCount, int64 totalPnl, uint64 totalCollateral, uint64 startTimestamp, uint64 endTimestamp, uint256 verifiedAt)"
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

export interface TraderMetrics {
    totalPnl: number;
    tradeCount: number;
    winCount: number;
    totalCollateral: number;
    startBlock: number | null;
    endBlock: number | null;
}

export interface ProofResult {
    success: boolean;
    metrics: TraderMetrics;
    proofId: string | null;  // Becomes vkeyHash in SP1
    proof: string | null;    // New: actual ZK proof bytes (hex)
    publicValues: string | null; // New: committed public values (hex)
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

// ============================================================================
// Metric Computation (TypeScript fallback — matches Rust guest logic)
// ============================================================================

/**
 * Compute trader performance metrics from subgraph trade data.
 *
 * - PnL: (closePrice - openPrice) * collateral * leverage / openPrice, minus fees
 * - Collateral in USDC (6 decimals in subgraph)
 * - Funding/rollover in 18 decimals
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

            // Funding and rollover are in 18 decimals
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
 * Converts subgraph trades to the guest's input format, spawns the host,
 * and parses the proof output.
 */
async function generateSP1Proof(
    closedTrades: SubgraphTrade[],
    _metrics: TraderMetrics
): Promise<{
    proofId: string | null;
    proof: string | null;
    publicValues: string | null;
    txHash: string | null;
    isSimulated: boolean
}> {
    if (!SP1_PROVER_MODE) {
        console.log("[sp1] No SP1_PROVER_MODE configured — using simulation mode");
        return { proofId: null, proof: null, publicValues: null, txHash: null, isSimulated: true };
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

        const tradesJson = JSON.stringify(guestTrades);

        console.log(`[sp1] Running SP1 host in '${SP1_PROVER_MODE}' mode with ${closedTrades.length} trades`);

        // Spawn the SP1 host binary and pipe trade data via stdin
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
                reject(new Error("SP1 host timed out after 10 minutes"));
            }, 600_000);

            child.on("error", (err: Error) => {
                clearTimeout(timeout);
                reject(err);
            });

            child.on("close", (code: number | null) => {
                clearTimeout(timeout);
                if (stderr) console.log(`[sp1] Host stderr: ${stderr}`);
                if (code !== 0) {
                    reject(new Error(`SP1 host exited with code ${code}: ${stderr}`));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error(`Failed to parse SP1 output: ${stdout.slice(0, 200)}`));
                }
            });

            // Write trade data to stdin and close it
            child.stdin.write(tradesJson);
            child.stdin.end();
        });

        if (!result.success) {
            throw new Error(result.error || "SP1 proof generation failed");
        }

        console.log(`[sp1] Proof generated: mode=${result.mode}, trades=${result.metrics.trade_count}`);

        return {
            proofId: result.vkey_hash || null,
            proof: result.proof || null,
            publicValues: result.public_values || null,
            txHash: null, // On-chain submission happens separately
            isSimulated: result.mode === "execute",
        };
    } catch (error: any) {
        console.error("[sp1] ZK proof generation failed:", error.message);
        console.log("[sp1] Falling back to simulation mode");
        return { proofId: null, proof: null, publicValues: null, txHash: null, isSimulated: true };
    }
}

/**
 * The SP1 host currently outputs hex(serde_json(proof)), i.e. the full JSON
 * envelope.  The on-chain verifier expects the compact binary format returned
 * by `SP1ProofWithPublicValues::bytes()`:
 *   [4-byte groth16_vkey_hash prefix] ++ [decoded encoded_proof]
 *
 * This helper bridges the gap until the Rust host is rebuilt with `proof.bytes()`.
 */
function extractGroth16ProofBytes(hexEncodedProof: string): string {
    try {
        const jsonStr = Buffer.from(hexEncodedProof, "hex").toString("utf-8");
        const envelope = JSON.parse(jsonStr);

        const groth16 = envelope?.proof?.Groth16;
        if (!groth16?.encoded_proof || !groth16?.groth16_vkey_hash) {
            return hexEncodedProof;
        }

        // First 4 bytes of the 32-byte vkey hash
        const vkeyPrefix = Buffer.from(groth16.groth16_vkey_hash.slice(0, 4)).toString("hex");

        return vkeyPrefix + groth16.encoded_proof;
    } catch {
        // Already raw proof bytes — pass through unchanged
        return hexEncodedProof;
    }
}

/**
 * Submits a generated SP1 proof to the TraderRegistry contract.
 */
export async function submitProofToRegistry(
    publicValues: string,
    proof: string
): Promise<string> {
    if (!TRADER_REGISTRY_ADDRESS || !SP1_PRIVATE_KEY) {
        throw new Error("Missing TRADER_REGISTRY_ADDRESS or SP1_PRIVATE_KEY in environment");
    }

    console.log(`[sp1] Submitting proof to registry at ${TRADER_REGISTRY_ADDRESS}...`);

    const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(SP1_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(TRADER_REGISTRY_ADDRESS, TRADER_REGISTRY_ABI, wallet);

    const publicValuesHex = publicValues.startsWith("0x") ? publicValues : `0x${publicValues}`;
    const proofBytes = extractGroth16ProofBytes(proof);
    const proofHex = proofBytes.startsWith("0x") ? proofBytes : `0x${proofBytes}`;

    console.log(`[sp1] publicValues length: ${(publicValuesHex.length - 2) / 2} bytes`);
    console.log(`[sp1] proofBytes length: ${(proofHex.length - 2) / 2} bytes`);

    const tx = await contract.verifyTraderPerformance(publicValuesHex, proofHex);
    console.log(`[sp1] Submission transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log("[sp1] Submission verified on-chain");

    return tx.hash;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Generate a proof of trading performance for a given trader address.
 *
 * Flow:
 * 1. Fetch all closed and open trades from Ostium subgraph
 * 2. Compute performance metrics
 * 3. If SP1 is configured, generate a ZK proof
 * 4. Otherwise, use subgraph-computed metrics (simulation mode)
 */
export async function generateProof(
    traderAddress: string
): Promise<ProofResult> {
    try {
        console.log(`[sp1] Generating proof for trader: ${traderAddress}`);

        // ---- Step 1: Fetch trades from subgraph ----
        const [closedTrades, openTrades] = await Promise.all([
            fetchClosedTrades(traderAddress),
            fetchOpenTrades(traderAddress),
        ]);

        console.log(
            `[sp1] Fetched ${closedTrades.length} closed, ${openTrades.length} open trades`
        );

        if (closedTrades.length === 0) {
            return {
                success: true,
                metrics: {
                    totalPnl: 0,
                    tradeCount: 0,
                    winCount: 0,
                    totalCollateral: 0,
                    startBlock: null,
                    endBlock: null,
                },
                proofId: null,
                txHash: null,
                isSimulated: true,
                proof: null,
                publicValues: null,
            };
        }

        // ---- Step 2: Compute metrics ----
        const metrics = computeMetrics(closedTrades, openTrades);
        console.log(
            `[sp1] Computed metrics: PnL=${metrics.totalPnl}, trades=${metrics.tradeCount}, wins=${metrics.winCount}, collateral=${metrics.totalCollateral}`
        );

        // ---- Step 3: Attempt SP1 ZK proof or fallback ----
        const sp1Result = await generateSP1Proof(closedTrades, metrics);

        return {
            success: true,
            metrics,
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
