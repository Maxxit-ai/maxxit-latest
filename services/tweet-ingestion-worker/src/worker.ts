/**
 * Tweet Ingestion Worker (Microservice)
 * Fetches tweets from X API and stores them in the database
 * Interval: 5 minutes (configurable via WORKER_INTERVAL)
 */

import dotenv from "dotenv";
import express from "express";
import { prisma } from "@maxxit/database";
import {
  setupGracefulShutdown,
  registerCleanup,
} from "@maxxit/common";
import { checkDatabaseHealth } from "@maxxit/database";
import { createLLMClassifier } from "./lib/llm-classifier";

dotenv.config();

const PORT = process.env.PORT || 5003;
const INTERVAL = parseInt(process.env.WORKER_INTERVAL || "30000"); // 30 seconds default

let workerInterval: NodeJS.Timeout | null = null;

// Health check server
const app = express();
app.get("/health", async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "ok" : "degraded",
    service: "tweet-ingestion-worker",
    interval: INTERVAL,
    database: dbHealthy ? "connected" : "disconnected",
    isRunning: workerInterval !== null,
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, () => {
  console.log(`🏥 Tweet Ingestion Worker health check on port ${PORT}`);
});

/**
 * Ingest tweets from X accounts
 */
async function ingestTweets() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📥 TWEET INGESTION WORKER");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Get active CT accounts
    const accounts = await prisma.ct_accounts.findMany({
      where: { is_active: true },
    });

    if (accounts.length === 0) {
      console.log(
        "⚠️  No active CT accounts found. Set is_active=true for accounts to monitor.\n"
      );
      return;
    }

    console.log(`📋 Found ${accounts.length} active CT account(s) to process`);

    // Check if Twitter proxy is available
    const TWITTER_PROXY_URL =
      process.env.X_API_PROXY_URL ||
      process.env.TWITTER_PROXY_URL ||
      "https://maxxit.onrender.com";
    let proxyAvailable = false;

    try {
      console.log(`\n🔍 Checking Twitter proxy at: ${TWITTER_PROXY_URL}`);
      const proxyCheck = await fetch(`${TWITTER_PROXY_URL}/health`, {
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      if (proxyCheck.ok) {
        const healthData = (await proxyCheck.json()) as any;
        console.log(
          `✅ Twitter proxy is available (client: ${
            healthData.client_initialized ? "ready" : "not initialized"
          })\n`
        );
        proxyAvailable = true;
      } else {
        console.log(
          "⚠️  Twitter proxy not responding - will process existing tweets\n"
        );
      }
    } catch (error: any) {
      console.log(
        `⚠️  Twitter proxy not available (${error.message}) - will process existing tweets\n`
      );
    }

    let totalFetched = 0;
    let totalProcessed = 0;

    // Process each account
    for (const account of accounts) {
      console.log(`\n[${account.x_username}] Processing...`);

      if (!proxyAvailable) {
        console.log(
          `[${account.x_username}] ⏭️  Skipping (proxy not available)`
        );
        continue;
      }

      try {
        // Get the last tweet we've seen for this account
        const lastTweet = await prisma.ct_posts.findFirst({
          where: { ct_account_id: account.id },
          orderBy: { tweet_created_at: "desc" },
        });

        console.log(`[${account.x_username}] Fetching recent tweets...`);
        if (lastTweet) {
          console.log(
            `[${account.x_username}] Last seen: ${lastTweet.tweet_id}`
          );
        }

        // Call Twitter proxy to get tweets
        const queryParams = new URLSearchParams({
          max_results: "15",
        });

        if (lastTweet) {
          queryParams.append("since_id", lastTweet.tweet_id);
        }

        // Correct endpoint: /tweets/<username>
        const response = await fetch(
          `${TWITTER_PROXY_URL}/tweets/${account.x_username}?${queryParams}`,
          {
            signal: AbortSignal.timeout(10000), // 10 second timeout
          }
        );

        if (!response.ok) {
          throw new Error(`Twitter proxy returned ${response.status}`);
        }

        const responseData = (await response.json()) as any;
        const tweets = responseData.data || []; // Proxy returns 'data' not 'tweets'

        console.log(
          `[${account.x_username}] ✅ Fetched ${tweets.length} new tweets`
        );
        totalFetched += tweets.length;

        // Store and classify tweets
        const classifier = createLLMClassifier();

        for (const tweet of tweets) {
          try {
            // Store tweet
            const storedTweet = await prisma.ct_posts.create({
              data: {
                ct_account_id: account.id,
                tweet_id: tweet.id,
                tweet_text: tweet.text,
                tweet_created_at: new Date(tweet.created_at),
              },
            });
            totalProcessed++;

            // Classify tweet immediately
            if (classifier) {
              try {
                const classification = await classifier.classifyTweet(
                  tweet.text
                );

                // Update tweet with classification
                await prisma.ct_posts.update({
                  where: { id: storedTweet.id },
                  data: {
                    is_signal_candidate: classification.isSignalCandidate,
                    extracted_tokens: classification.extractedTokens,
                    confidence_score: classification.confidence,
                    signal_type:
                      classification.sentiment === "bullish"
                        ? "LONG"
                        : classification.sentiment === "bearish"
                        ? "SHORT"
                        : null,
                  },
                });

                if (classification.isSignalCandidate) {
                  console.log(
                    `[${
                      account.x_username
                    }] ✅ Signal detected: ${classification.extractedTokens.join(
                      ", "
                    )} - ${classification.sentiment}`
                  );
                }
              } catch (classifyError: any) {
                console.error(
                  `[${account.x_username}] ⚠️  Classification failed for tweet ${tweet.id}:`,
                  classifyError.message
                );
                // Continue anyway - tweet is stored, just not classified
              }
            }
          } catch (error: any) {
            // Tweet might already exist (duplicate), skip
            if (error.code !== "P2002") {
              console.error(
                `[${account.x_username}] Error storing tweet ${tweet.id}:`,
                error.message
              );
            }
          }
        }

        console.log(
          `[${account.x_username}] ✅ Stored ${tweets.length} tweets`
        );
      } catch (error: any) {
        console.error(`[${account.x_username}] ❌ Error:`, error.message);
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📊 INGESTION SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Accounts Processed: ${accounts.length}`);
    console.log(`  Tweets Fetched: ${totalFetched}`);
    console.log(`  Tweets Stored: ${totalProcessed}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error: any) {
    console.error("[TweetIngestion] ❌ Fatal error:", error.message);
  }
}

/**
 * Main worker loop
 */
async function runWorker() {
  console.log("🚀 Tweet Ingestion Worker starting...");
  console.log(`⏱️  Interval: ${INTERVAL}ms (${INTERVAL / 1000}s)`);
  console.log(
    `🔗 X API Proxy: ${
      process.env.X_API_PROXY_URL ||
      process.env.TWITTER_PROXY_URL ||
      "https://maxxit.onrender.com"
    }`
  );

  // Check LLM classifier availability
  const classifier = createLLMClassifier();
  if (classifier) {
    console.log("🤖 LLM Classifier: ENABLED");
  } else {
    console.log("⚠️  LLM Classifier: DISABLED (using fallback regex)");
    console.log(
      "   Set PERPLEXITY_API_KEY, EIGENAI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY to enable"
    );
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Run immediately on startup
  await ingestTweets();

  // Then run on interval
  workerInterval = setInterval(async () => {
    await ingestTweets();
  }, INTERVAL);
}

// Register cleanup to stop worker interval
registerCleanup(async () => {
  console.log("🛑 Stopping Tweet Ingestion Worker interval...");
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
});

// Setup graceful shutdown
setupGracefulShutdown("Tweet Ingestion Worker", server);

// Start worker
if (require.main === module) {
  runWorker().catch((error) => {
    console.error("[TweetIngestion] ❌ Worker failed to start:", error);
    process.exit(1);
  });
}

export { ingestTweets };
