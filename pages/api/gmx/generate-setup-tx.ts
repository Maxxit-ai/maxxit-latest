/**
 * API: Generate GMX Setup Transaction
 * 
 * Returns the enable module transaction data
 * GMX V2 doesn't require separate subaccount authorization!
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { ethers } from 'ethers';

const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x07627aef95CBAD4a17381c4923Be9B9b93526d3D';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress } = req.body;

    if (!safeAddress) {
      return res.status(400).json({ error: 'safeAddress required' });
    }

    // Transaction: Enable Module (GMX V2 doesn't need authorization!)
    const safeInterface = new ethers.utils.Interface([
      'function enableModule(address module)',
    ]);
    const enableModuleData = safeInterface.encodeFunctionData('enableModule', [MODULE_ADDRESS]);

    // Batch transaction for Safe (single transaction now!)
    const batchTransaction = {
      version: '1.0',
      chainId: '42161',
      createdAt: Date.now(),
      meta: {
        name: 'Maxxit GMX Setup',
        description: 'Enable trading module for GMX (no authorization needed!)',
        txBuilderVersion: '1.16.1',
      },
      transactions: [
        {
          to: safeAddress,
          value: '0',
          data: enableModuleData,
          contractMethod: {
            inputs: [{ name: 'module', type: 'address' }],
            name: 'enableModule',
            payable: false,
          },
          contractInputsValues: {
            module: MODULE_ADDRESS,
          },
        },
      ],
    };

    // Also provide simple transaction array for SDK
    const sdkTransactions = [
      {
        to: safeAddress,
        data: enableModuleData,
        value: '0',
        operation: 0, // CALL
      },
    ];

    res.status(200).json({
      success: true,
      safeAddress,
      moduleAddress: MODULE_ADDRESS,
      
      // For Safe Transaction Builder (import JSON)
      transactionBuilderJSON: batchTransaction,
      
      // For Safe SDK
      sdkTransactions,
      
      // Manual instructions
      instructions: {
        step1: 'Go to Safe Transaction Builder',
        step2: 'Enter Safe address and paste hex data',
        step3: 'Execute transaction',
        note: 'GMX V2 does NOT require separate authorization!',
        transactions: [
          {
            description: 'Enable Maxxit Trading Module',
            to: safeAddress,
            abi: 'enableModule(address)',
            params: { module: MODULE_ADDRESS },
          },
        ],
      },
      
      // Deep link to Safe Transaction Builder (if available)
      safeAppLink: `https://app.safe.global/apps/open?safe=arb1:${safeAddress}&appUrl=https://apps.gnosis-safe.io/tx-builder`,
    });
  } catch (error: any) {
    console.error('Generate setup tx error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

