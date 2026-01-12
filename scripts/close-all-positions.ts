/**
 * Close All Open Positions Script
 * 
 * Closes all open Ostium positions for a specific wallet and agent address.
 * 
 * Usage:
 *   npx tsx scripts/close-all-positions.ts
 * 
 * Environment variables required:
 *   - DATABASE_URL
 *   - OSTIUM_SERVICE_URL (optional, defaults to http://localhost:5002)
 */

import { prisma } from "@maxxit/database";

const OSTIUM_SERVICE_URL = process.env.OSTIUM_SERVICE_URL || "http://localhost:5002";

// Configuration - UPDATE THESE VALUES
const USER_WALLET = "";
const AGENT_ADDRESS = "";

interface CloseResult {
    positionId: string;
    tokenSymbol: string;
    tradeId: string | null;
    success: boolean;
    message?: string;
    error?: string;
}

async function closePosition(
    agentAddress: string,
    userAddress: string,
    market: string,
    tradeId: string | null,
    tradeIndex: number | null
): Promise<{ success: boolean; message?: string; error?: string; closePnl?: number }> {
    try {
        const requestBody: any = {
            agentAddress,
            userAddress,
            market: market.toUpperCase(),
        };

        if (tradeId) {
            requestBody.tradeId = tradeId;
        }
        if (tradeIndex !== null && tradeIndex !== undefined) {
            requestBody.actualTradeIndex = tradeIndex;
        }

        console.log(`   📤 Calling close-position API for ${market}...`);
        console.log(`      Agent: ${agentAddress}`);
        console.log(`      User: ${userAddress}`);
        console.log(`      TradeId: ${tradeId || "N/A"}`);
        console.log(`      TradeIndex: ${tradeIndex ?? "N/A"}`);

        const response = await fetch(`${OSTIUM_SERVICE_URL}/close-position`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        const result = await response.json();

        if (response.ok && result.success) {
            console.log(`   ✅ Position closed successfully!`);
            console.log(`      PnL: $${result.closePnl || 0}`);
            return {
                success: true,
                message: result.message || "Position closed",
                closePnl: result.closePnl || 0,
            };
        } else {
            console.log(`   ❌ Failed to close position: ${result.error || "Unknown error"}`);
            return {
                success: false,
                error: result.error || "Unknown error",
            };
        }
    } catch (error: any) {
        console.log(`   ❌ Error calling close-position API: ${error.message}`);
        return {
            success: false,
            error: error.message,
        };
    }
}

async function main() {
    console.log("╔═══════════════════════════════════════════════════════════════╗");
    console.log("║       CLOSE ALL OPEN POSITIONS (ALL DEPLOYMENTS)              ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log(`🔧 Configuration:`);
    console.log(`   User Wallet: ${USER_WALLET}`);
    console.log(`   Ostium Service: ${OSTIUM_SERVICE_URL}`);
    console.log("");

    // Check Ostium service health
    try {
        console.log("🏥 Checking Ostium service health...");
        const healthResponse = await fetch(`${OSTIUM_SERVICE_URL}/health`);
        if (!healthResponse.ok) {
            throw new Error(`Service returned ${healthResponse.status}`);
        }
        const healthData = await healthResponse.json();
        console.log(`   ✅ Ostium service is healthy: ${healthData.status}`);
    } catch (error: any) {
        console.error(`   ❌ Ostium service is not available: ${error.message}`);
        console.error(`   Please ensure the ostium-service is running on ${OSTIUM_SERVICE_URL}`);
        process.exit(1);
    }

    console.log("");

    // Find ALL deployments for this wallet
    console.log("🔍 Finding all deployments...");
    const deployments = await prisma.agent_deployments.findMany({
        where: {
            user_wallet: {
                equals: USER_WALLET,
                mode: "insensitive",
            },
            status: "ACTIVE",
        },
        include: {
            agents: true,
        },
    });

    if (deployments.length === 0) {
        console.error(`   ❌ No active deployments found for wallet ${USER_WALLET}`);
        process.exit(1);
    }

    console.log(`   ✅ Found ${deployments.length} active deployment(s)`);
    for (const dep of deployments) {
        console.log(`      - ${dep.agents.name} (${dep.id.substring(0, 8)}...) | Agent: ${dep.safe_wallet.substring(0, 10)}...`);
    }
    console.log("");

    // Collect all open positions across all deployments
    console.log("🔍 Finding open positions across all deployments...");

    interface PositionWithDeployment {
        position: Awaited<ReturnType<typeof prisma.positions.findMany>>[0];
        deployment: typeof deployments[0];
    }

    const allPositions: PositionWithDeployment[] = [];

    for (const deployment of deployments) {
        const openPositions = await prisma.positions.findMany({
            where: {
                deployment_id: deployment.id,
                venue: "OSTIUM",
                status: "OPEN",
                closed_at: null,
            },
            orderBy: {
                opened_at: "desc",
            },
        });

        for (const position of openPositions) {
            allPositions.push({ position, deployment });
        }
    }

    if (allPositions.length === 0) {
        console.log("   ✅ No open positions found across all deployments. All positions are already closed.");
        await prisma.$disconnect();
        process.exit(0);
    }

    console.log(`   📊 Found ${allPositions.length} open position(s) across ${deployments.length} deployment(s)`);
    console.log("");

    // Display positions grouped by deployment
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("OPEN POSITIONS TO CLOSE:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let currentDeploymentId = "";
    for (const { position, deployment } of allPositions) {
        if (deployment.id !== currentDeploymentId) {
            currentDeploymentId = deployment.id;
            console.log("");
            console.log(`   📦 ${deployment.agents.name} (Agent: ${deployment.safe_wallet.substring(0, 10)}...)`);
            console.log("   ─────────────────────────────────────────────────");
        }
        console.log(`      📊 ${position.token_symbol} ${position.side}`);
        console.log(`         ID: ${position.id.substring(0, 8)}... | Trade ID: ${position.ostium_trade_id || "N/A"}`);
        console.log(`         Entry: $${Number(position.entry_price).toFixed(4)} | Collateral: $${Number(position.qty).toFixed(2)}`);
    }
    console.log("");

    // Confirm before proceeding
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`⚠️  WARNING: This will close ALL ${allPositions.length} positions across ${deployments.length} deployment(s)!`);
    console.log("   Press Ctrl+C within 5 seconds to cancel...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Wait 5 seconds for user to cancel
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("");
    console.log("🚀 Proceeding to close all positions...");
    console.log("");

    // Close each position
    const results: CloseResult[] = [];

    for (let i = 0; i < allPositions.length; i++) {
        const { position, deployment } = allPositions[i];

        console.log(`[${i + 1}/${allPositions.length}] Closing ${position.token_symbol} ${position.side} (${deployment.agents.name})...`);

        const closeResult = await closePosition(
            AGENT_ADDRESS,
            USER_WALLET,
            position.token_symbol,
            position.ostium_trade_id,
            position.ostium_trade_index
        );

        results.push({
            positionId: position.id,
            tokenSymbol: position.token_symbol,
            tradeId: position.ostium_trade_id,
            success: closeResult.success,
            message: closeResult.message,
            error: closeResult.error,
        });

        // Update position in database if close was successful
        if (closeResult.success) {
            try {
                await prisma.positions.update({
                    where: { id: position.id },
                    data: {
                        status: "CLOSED",
                        closed_at: new Date(),
                        exit_reason: "Manual close via script",
                        pnl: closeResult.closePnl || null,
                    },
                });
                console.log(`   💾 Database updated: position marked as CLOSED`);
            } catch (dbError: any) {
                console.log(`   ⚠️  Failed to update database: ${dbError.message}`);
            }
        }

        console.log("");

        // Add a small delay between closes to avoid rate limiting
        if (i < allPositions.length - 1) {
            console.log("   ⏳ Waiting 2 seconds before next close...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    // Summary
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SUMMARY:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(`   ✅ Successfully closed: ${successCount}/${allPositions.length}`);
    console.log(`   ❌ Failed to close: ${failCount}/${allPositions.length}`);

    if (failCount > 0) {
        console.log("");
        console.log("   Failed positions:");
        for (const result of results.filter((r) => !r.success)) {
            console.log(`      - ${result.tokenSymbol}: ${result.error}`);
        }
    }

    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await prisma.$disconnect();
}

main().catch((error) => {
    console.error("Fatal error:", error);
    prisma.$disconnect();
    process.exit(1);
});
