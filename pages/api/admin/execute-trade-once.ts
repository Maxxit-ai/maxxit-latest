import type { NextApiRequest, NextApiResponse} from 'next';
import { prisma } from '../../../lib/prisma';
import { TradeExecutor } from '../../../lib/trade-executor';

/**
 * Admin endpoint to execute a trade for a given signal
 * 
 * Flow:
 * 1. Find ACTIVE deployments for the signal's agent
 * 2. Compute position size from sizeModel
 * 3. Enforce venue constraints (min_size, slippage)
 * 4. Call venue adapter stub
 * 5. Insert position (OPEN status)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { signalId } = req.query;

    if (!signalId || typeof signalId !== 'string') {
      return res.status(400).json({ error: 'signalId query param required' });
    }

    console.log(`[ADMIN] Executing trade for signal ${signalId}`);

    // Get signal
    const signal = await prisma.signals.findUnique({
      where: { id: signalId },
    });

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    // Check total active deployments (for logging)
    const allDeployments = await prisma.agent_deployments.findMany({
      where: {
        agent_id: signal.agent_id,
        status: 'ACTIVE',
        sub_active: true,
      },
    });

    // Find ACTIVE deployments for this agent
    // For SPOT/GMX signals: require module_enabled = true
    // For HYPERLIQUID signals: require hyperliquid_agent_address set (uses agent wallet, not Safe module)
    // For OSTIUM signals: require ostium_agent_address set (uses agent wallet, not Safe module)
    let deployments = await prisma.agent_deployments.findMany({
      where: {
        agent_id: signal.agent_id,
        status: 'ACTIVE',
        sub_active: true,
      },
    });

    // Filter deployments based on venue requirements
    if (signal.venue === 'HYPERLIQUID' || signal.venue === 'OSTIUM') {
      // For HYPERLIQUID and OSTIUM, check user_agent_addresses table
      const userWallets = deployments.map(d => d.user_wallet);
      console.log(`[TRADE] Checking ${userWallets.length} user wallets for ${signal.venue} agent addresses:`, userWallets);
      
      // Get user agent addresses for these wallets
      const userAgentAddresses = await prisma.user_agent_addresses.findMany({
        where: {
          user_wallet: { in: userWallets },
          ...(signal.venue === 'HYPERLIQUID' 
            ? { hyperliquid_agent_address: { not: null } }
            : { ostium_agent_address: { not: null } }
          ),
        },
        select: { user_wallet: true },
      });

      console.log(`[TRADE] Found ${userAgentAddresses.length} users with ${signal.venue} agent addresses configured`);
      const validUserWallets = new Set(userAgentAddresses.map(u => u.user_wallet));
      
      // Filter deployments to only those with valid agent addresses
      deployments = deployments.filter(d => validUserWallets.has(d.user_wallet));
      console.log(`[TRADE] Filtered to ${deployments.length} deployments with valid agent addresses`);
      deployments.forEach(d => {
        console.log(`[TRADE]   - Deployment ${d.id.substring(0, 8)}... User: ${d.user_wallet}`);
      });
    } else {
      // For SPOT/GMX, require module_enabled = true
      deployments = deployments.filter(d => d.module_enabled === true);
      console.log(`[TRADE] Filtered to ${deployments.length} deployments with module enabled`);
    }

    console.log(`[TRADE] Found ${allDeployments.length} total active deployments, ${deployments.length} ready for execution (venue: ${signal.venue})`);

    // Check for existing positions for this signal (to see if some deployments already have positions)
    const existingPositions = await prisma.positions.findMany({
      where: {
        signal_id: signal.id,
      },
      select: {
        deployment_id: true,
        status: true,
      },
    });

    if (existingPositions.length > 0) {
      console.log(`[TRADE] ⚠️  Found ${existingPositions.length} existing positions for this signal:`);
      existingPositions.forEach(p => {
        console.log(`[TRADE]   - Deployment ${p.deployment_id.substring(0, 8)}... Status: ${p.status}`);
      });
    }

    if (deployments.length === 0) {
      let message: string;
      if (allDeployments.length === 0) {
        message = 'No active deployments found for this agent';
      } else if (signal.venue === 'HYPERLIQUID') {
        message = `${allDeployments.length} active deployments found for Hyperliquid signal, but none have a Hyperliquid agent address configured.`;
      } else if (signal.venue === 'OSTIUM') {
        message = `${allDeployments.length} active deployments found for Ostium signal, but none have an Ostium agent address configured.`;
      } else {
        message = `${allDeployments.length} active deployments found, but module is not enabled on any. Users must enable the trading module on their Safe first.`;
      }
      
      return res.status(200).json({
        success: false,
        error: message,
        positionsCreated: 0,
      });
    }

    // Check venue status for min size/slippage
    const venueStatus = await prisma.venues_status.findUnique({
      where: {
        venue_token_symbol: {
          venue: signal.venue,
          token_symbol: signal.token_symbol,
        },
      },
    });

    const sizeModel: any = signal.size_model;
    const qty = sizeModel.baseSize || 100;

    // Check min size constraint
    if (venueStatus?.min_size && parseFloat(qty.toString()) < parseFloat(venueStatus.min_size.toString())) {
      return res.status(400).json({
        error: 'Position size below venue minimum',
      });
    }

    const positionsCreated = [];
    const errors = [];
    const executor = new TradeExecutor();

    console.log(`[TRADE] 🔄 Processing ${deployments.length} deployments...`);
    
    for (let i = 0; i < deployments.length; i++) {
      const deployment = deployments[i];
      console.log(`[TRADE] 📍 Processing deployment ${i + 1}/${deployments.length}: ${deployment.id.substring(0, 8)}... (User: ${deployment.user_wallet})`);
      
      try {
        // Check for duplicate position (same deployment + signal) - ATOMIC CHECK
        const existing = await prisma.positions.findUnique({
          where: {
            deployment_id_signal_id: {
              deployment_id: deployment.id,
              signal_id: signal.id,
            },
          },
        });

        if (existing) {
          console.log(`[TRADE] ⏭️  Position already exists for deployment ${deployment.id.substring(0, 8)}... (User: ${deployment.user_wallet})`);
          continue;
        }

        // Execute REAL on-chain trade via TradeExecutor for SPECIFIC deployment
        console.log(`[TRADE] 🚀 Executing trade for deployment ${deployment.id.substring(0, 8)}... (User: ${deployment.user_wallet})`);
        const result = await executor.executeSignalForDeployment(signal.id, deployment.id);

        if (result.success && result.positionId) {
          console.log(`[TRADE] ✅ Trade executed on-chain! Position: ${result.positionId}, TX: ${result.txHash}`);
          
          // Get the created position
          const position = await prisma.positions.findUnique({
            where: { id: result.positionId }
          });
          
          if (position) {
            positionsCreated.push(position);
          }
        } else {
          const errorMsg = result.error || result.reason || 'Unknown error';
          console.error(`[TRADE] ❌ Trade execution failed for deployment ${deployment.id}:`, errorMsg);
          console.error(`[TRADE] Full result:`, JSON.stringify(result, null, 2));
          errors.push({
            deploymentId: deployment.id,
            error: errorMsg,
            reason: result.reason,
            summary: result.executionSummary,
          });
        }
      } catch (loopError: any) {
        console.error(`[TRADE] ❌ Exception processing deployment ${deployment.id}:`, loopError);
        errors.push({
          deploymentId: deployment.id,
          error: loopError.message || 'Unexpected error in deployment loop',
          reason: 'Exception caught',
        });
      }
    }
    
    console.log(`[TRADE] ✅ Finished processing all deployments. Success: ${positionsCreated.length}, Errors: ${errors.length}`);

    // Return detailed response with errors
    const success = positionsCreated.length > 0;
    const totalDeployments = deployments.length;
    const successfulDeployments = positionsCreated.length;
    const failedDeployments = errors.length;
    
    return res.status(success ? 200 : 400).json({
      success,
      message: success 
        ? `Trade execution completed. ${successfulDeployments}/${totalDeployments} deployments succeeded.`
        : `Trade execution failed. ${failedDeployments}/${totalDeployments} deployments failed.`,
      positionsCreated: positionsCreated.length,
      totalDeployments,
      successfulDeployments,
      failedDeployments,
      positions: positionsCreated,
      errors: errors.length > 0 ? errors : undefined,
      deploymentSummary: {
        total: totalDeployments,
        successful: successfulDeployments,
        failed: failedDeployments,
        skipped: totalDeployments - successfulDeployments - failedDeployments,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN] Trade execution error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
