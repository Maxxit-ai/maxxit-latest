import { prisma } from '../lib/prisma';
import { getProjectCosts } from '../lib/openai-admin';
import LLMCreditService from '../lib/llm-credit-service';

interface SyncResult {
  processed: number;
  costsDeducted: number;
  limitsReached: number;
  errors: Array<{
    userWallet: string;
    error: string;
  }>;
}

/**
 * Sync OpenAI usage costs from the OpenAI API to the LLM credit system
 */
export async function syncOpenAIUsage(): Promise<SyncResult> {
  const result: SyncResult = {
    processed: 0,
    costsDeducted: 0,
    limitsReached: 0,
    errors: [],
  };

  console.log('[OpenAI Usage Sync] Starting sync job...');

  try {
    const instances = await prisma.openclaw_instances.findMany({
      where: {
        openai_project_id: {
          not: null,
        },
      },
      select: {
        id: true,
        user_wallet: true,
        openai_project_id: true,
        llm_last_cost_sync_at: true,
        openai_api_key_created_at: true,
      },
    });

    console.log(`[OpenAI Usage Sync] Found ${instances.length} instances with OpenAI projects`);

    const now = Math.floor(Date.now() / 1000);
    const endTime = now - 7200;

    for (const instance of instances) {
      const { user_wallet, openai_project_id, llm_last_cost_sync_at, openai_api_key_created_at } = instance;

      try {
        let startTime: number;
        if (llm_last_cost_sync_at) {
          startTime = Math.floor(new Date(llm_last_cost_sync_at).getTime() / 1000);
        } else if (openai_api_key_created_at) {
          startTime = Math.floor(new Date(openai_api_key_created_at).getTime() / 1000);
        } else {
          startTime = now - 86400 * 30;
        }

        if (startTime >= endTime) {
          console.log(
            `[OpenAI Usage Sync] Skipping ${user_wallet}: start time is after end time (API key was just created, will sync on next run)`
          );
          continue;
        }

        if (endTime - startTime < 3600) {
          console.log(
            `[OpenAI Usage Sync] Skipping ${user_wallet}: time window too small (< 1 hour), will sync on next run`
          );
          continue;
        }

        console.log(
          `[OpenAI Usage Sync] Syncing ${user_wallet} from ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}`
        );
        console.log(
          `[OpenAI Usage Sync] ${user_wallet}: Project ID: ${openai_project_id}, Start: ${startTime}, End: ${endTime}`
        );

        const costsData = await getProjectCosts(
          openai_project_id!,
          startTime,
          endTime
        );

        if (result.processed < 3) {
          console.log(
            `[OpenAI Usage Sync] ${user_wallet}: Raw API response:`,
            JSON.stringify(costsData, null, 2)
          );
        }

        let newCostsCents = 0;

        if (costsData.data && costsData.data.length > 0) {
          for (const dataPoint of costsData.data) {
            const results = dataPoint.results || [];
            for (const costResult of results) {
              if (costResult.project_id === openai_project_id) {
                const costUSD = costResult.amount?.value || 0;
                newCostsCents += Math.round(costUSD * 100);
              }
            }
          }
        }

        console.log(
          `[OpenAI Usage Sync] ${user_wallet}: New costs = $${(newCostsCents / 100).toFixed(2)}`
        );

        if (newCostsCents > 0) {
          const balanceBefore = await LLMCreditService.getBalance(user_wallet);

          try {
            const referenceId = `sync-${openai_project_id}-${startTime}-${endTime}`;
            await LLMCreditService.deductCredits(
              user_wallet,
              newCostsCents,
              `OpenAI API usage from ${new Date(startTime * 1000).toLocaleDateString()} to ${new Date(endTime * 1000).toLocaleDateString()}`,
              referenceId
            );

            console.log(
              `[OpenAI Usage Sync] ${user_wallet}: Deducted $${(newCostsCents / 100).toFixed(2)} from balance (was $${(balanceBefore.balanceCents / 100).toFixed(2)})`
            );

            result.costsDeducted += newCostsCents;

            const balanceAfter = await LLMCreditService.getBalance(user_wallet);

            if (balanceAfter.balanceCents === 0 && !balanceBefore.limitReached) {
              await LLMCreditService.setLimitReached(user_wallet);
              result.limitsReached++;
              console.log(
                `[OpenAI Usage Sync] ${user_wallet}: Limit reached, flagging instance`
              );
            }
          } catch (deductError: any) {
            if (deductError.message.includes('Insufficient LLM credit balance')) {
              console.log(
                `[OpenAI Usage Sync] ${user_wallet}: Insufficient balance, setting limit reached`
              );
              await LLMCreditService.setLimitReached(user_wallet);
              result.limitsReached++;
            } else {
              throw deductError;
            }
          }

          await prisma.openclaw_instances.update({
            where: { id: instance.id },
            data: {
              llm_last_cost_sync_at: new Date(),
            },
          });
        } else {
          console.log(`[OpenAI Usage Sync] ${user_wallet}: No new costs to sync`);
          await prisma.openclaw_instances.update({
            where: { id: instance.id },
            data: {
              llm_last_cost_sync_at: new Date(),
            },
          });
        }

        result.processed++;
      } catch (error: any) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `[OpenAI Usage Sync] Error processing ${user_wallet}: ${errorMsg}`
        );
        result.errors.push({
          userWallet: user_wallet,
          error: errorMsg,
        });
      }
    }

    console.log(
      `[OpenAI Usage Sync] Completed. Processed: ${result.processed}, Costs deducted: $${(result.costsDeducted / 100).toFixed(2)}, Limits reached: ${result.limitsReached}, Errors: ${result.errors.length}`
    );

    return result;
  } catch (error: any) {
    console.error('[OpenAI Usage Sync] Fatal error:', error);
    throw error;
  }
}

if (require.main === module) {
  console.log('Starting OpenAI Usage Sync Worker...\n');

  syncOpenAIUsage().then(result => {
    console.log('\n=== OpenAI Usage Sync Summary ===');
    console.log(`Processed: ${result.processed} instances`);
    console.log(`Costs deducted: $${(result.costsDeducted / 100).toFixed(2)}`);
    console.log(`Limits reached: ${result.limitsReached}`);
    console.log(`Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(({ userWallet, error }) => {
        console.log(`  - ${userWallet}: ${error}`);
      });
    }

    console.log('\n✅ Sync completed successfully');
  }).catch(error => {
    console.error('❌ Sync failed:', error);
  });

  const SYNC_INTERVAL_MS = parseInt(process.env.OPENAI_USAGE_SYNC_INTERVAL_MS || '60000', 10);
  setInterval(() => {
    syncOpenAIUsage().then(result => {
      console.log('\n=== OpenAI Usage Sync Summary ===');
      console.log(`Processed: ${result.processed} instances`);
      console.log(`Costs deducted: $${(result.costsDeducted / 100).toFixed(2)}`);
      console.log(`Limits reached: ${result.limitsReached}`);
      console.log(`Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(({ userWallet, error }) => {
          console.log(`  - ${userWallet}: ${error}`);
        });
      }

      console.log('\n✅ Sync completed successfully');
    }).catch(error => {
      console.error('❌ Sync error:', error);
    });
  }, SYNC_INTERVAL_MS);
}

export default syncOpenAIUsage;