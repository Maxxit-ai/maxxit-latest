/**
 * Fetch all available stocks from LunarCrush API
 * This script retrieves the complete list of stocks available in LunarCrush
 */

import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import path from "path";

dotenv.config();

const API_BASE_URL = "https://lunarcrush.com/api4";
const STOCKS_ENDPOINT = `${API_BASE_URL}/public/stocks/list/v1`;

interface LunarCrushStock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  volume_24h: number;
  market_cap: number;
  percent_change_24h: number;
  galaxy_score: number;
  alt_rank: number;
  sentiment: number;
  social_volume_24h: number;
  volatility: number;
  market_cap_rank: number;
  social_dominance: number;
  market_dominance: number;
  interactions_24h: number;
}

/**
 * Validate that required environment variables are set
 */
function validateEnvironment(): void {
  if (!process.env.LUNARCRUSH_API_KEY) {
    throw new Error("LUNARCRUSH_API_KEY environment variable is not set");
  }
}

/**
 * Fetch all stocks from LunarCrush API
 */
async function fetchAllStocks(): Promise<LunarCrushStock[]> {
  console.log("🔗 Fetching stocks from LunarCrush API...");
  console.log(`   Endpoint: ${STOCKS_ENDPOINT}`);

  const apiKey = process.env.LUNARCRUSH_API_KEY;

  try {
    const response = await axios.get(STOCKS_ENDPOINT, {
      params: { key: apiKey }
    });

    if (!response.data?.data) {
      throw new Error("No data returned from LunarCrush API");
    }

    const stocks = response.data.data as LunarCrushStock[];
    console.log(`✅ Successfully fetched ${stocks.length} stocks`);
    
    return stocks;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `LunarCrush API request failed: ${error.response?.status} ${error.response?.statusText}\n` +
        `Response: ${JSON.stringify(error.response?.data, null, 2)}`
      );
    }
    throw error;
  }
}

/**
 * Save stocks data to a JSON file
 */
function saveStocksToFile(stocks: LunarCrushStock[], filename: string): void {
  const outputPath = path.join(__dirname, filename);
  fs.writeFileSync(outputPath, JSON.stringify(stocks, null, 2), "utf-8");
  console.log(`💾 Saved ${stocks.length} stocks to ${filename}`);
}

/**
 * Display a summary of the fetched stocks
 */
function displayStocksSummary(stocks: LunarCrushStock[]): void {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 STOCKS SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Total Stocks: ${stocks.length}`);
  console.log(`  Total Market Cap: $${(stocks.reduce((sum, s) => sum + (s.market_cap || 0), 0) / 1e12).toFixed(2)}T`);
  console.log(`  Top 10 Stocks by Market Cap:`);
  
  const sortedByMarketCap = [...stocks].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
  sortedByMarketCap.slice(0, 10).forEach((stock, index) => {
    console.log(`    ${index + 1}. ${stock.symbol} - ${stock.name} - $${(stock.market_cap / 1e9).toFixed(2)}B`);
  });
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

/**
 * Main function to fetch and display stocks
 */
async function main(): Promise<void> {
  try {
    console.log("🚀 Starting LunarCrush Stocks Fetcher\n");

    // Validate environment
    validateEnvironment();
    console.log("✅ Environment validation passed\n");

    // Fetch stocks
    const stocks = await fetchAllStocks();

    // Display summary
    displayStocksSummary(stocks);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `lunarcrush-stocks-${timestamp}.json`;
    saveStocksToFile(stocks, filename);

    console.log("✅ Script completed successfully");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}

export { fetchAllStocks, type LunarCrushStock };
