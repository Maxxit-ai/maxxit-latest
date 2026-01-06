/**
 * Test script for LLM Trade Decision with mock data
 * Run with: npx ts-node services/signal-generator-worker/src/test-trade-decision.ts
 */

import { makeTradeDecision } from "../lib/llm-trade-decision";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function testTradeDecision() {
    console.log("=".repeat(60));
    console.log("Testing LLM Trade Decision with Mock Data");
    console.log("=".repeat(60));

    // Mock data similar to real scenario
    const mockInput = {
        message: "BTC showing bullish momentum with potential breakout above $42,000 resistance level. RSI indicates oversold conditions.",
        confidenceScore: 0.22,
        lunarcrushData: {
            data: {
                galaxy_score: 63.5,
                alt_rank: 2205,
                alt_rank_previous: 11,
                price_change_24h: -3.79,
                sentiment: 88,
                social_volume: 125000,
                social_contributors: 4500,
                market_cap: 820000000000,
                volume_24h: 28500000000,
            },
            descriptions: {
                galaxy_score: "Overall score indicating the health and performance of the asset (0-100)",
                alt_rank: "Ranking of the asset compared to other altcoins based on performance metrics",
                alt_rank_previous: "Previous ranking for comparison",
                price_change_24h: "Percentage price change over the last 24 hours",
                sentiment: "Overall market sentiment score (0-100, higher is more positive)",
                social_volume: "Total number of social media mentions",
                social_contributors: "Number of unique contributors discussing the asset",
                market_cap: "Total market capitalization in USD",
                volume_24h: "24-hour trading volume in USD",
            },
        },
        userTradingPreferences: {
            risk_tolerance: 50,
            trade_frequency: 50,
            social_sentiment_weight: 50,
            price_momentum_focus: 50,
            market_rank_priority: 50,
        },
        userBalance: 22.24,
        venue: "HYPERLIQUID",
        token: "BTC",
        side: "LONG",
        maxLeverage: 50,
    };

    console.log("\n📊 Input Data:");
    console.log("-".repeat(40));
    console.log(`Message: ${mockInput.message}`);
    console.log(`Confidence Score: ${mockInput.confidenceScore}`);
    console.log(`User Balance: $${mockInput.userBalance}`);
    console.log(`Venue: ${mockInput.venue}`);
    console.log(`Token: ${mockInput.token}`);
    console.log(`Side: ${mockInput.side}`);
    console.log("\nTrading Preferences:", JSON.stringify(mockInput.userTradingPreferences, null, 2));
    console.log("\nAnalytics Data (will be transformed):");
    console.log(`  galaxy_score: ${mockInput.lunarcrushData.data.galaxy_score}`);
    console.log(`  alt_rank: ${mockInput.lunarcrushData.data.alt_rank}`);

    console.log("\n🤖 Calling LLM for Trade Decision...\n");
    console.log("-".repeat(40));

    try {
        const decision = await makeTradeDecision(mockInput);

        console.log("\n✅ Trade Decision Result:");
        console.log("=".repeat(60));
        console.log(`Should Open New Position: ${decision.shouldOpenNewPosition ? "✅ YES" : "❌ NO"}`);
        console.log(`Fund Allocation: ${decision.fundAllocation}%`);
        console.log(`Leverage: ${decision.leverage}x`);
        console.log("\n📝 Reason:");
        console.log("-".repeat(40));
        console.log(decision.reason);
        console.log("-".repeat(40));

    } catch (error: any) {
        console.error("\n❌ Error:", error.message);
        console.error("\nMake sure you have PERPLEXITY_API_KEY or OPENAI_API_KEY set in your .env file");
    }

    console.log("\n" + "=".repeat(60));
    console.log("Test Complete");
    console.log("=".repeat(60));
}

// Run the test
testTradeDecision();
