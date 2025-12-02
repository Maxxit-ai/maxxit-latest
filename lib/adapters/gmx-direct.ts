/**
 * GMX V2 Direct Integration
 * Based on working gmx-safe-sdk Python implementation
 * 
 * Calls GMX ExchangeRouter directly via executeFromModule
 * Reference: https://github.com/abxglia/gmx-safe-sdk
 */

import { ethers } from 'ethers';
import { createGMXReader } from './gmx-reader';
import { SafeModuleService } from '../safe-module-service';

// GMX V2 Contracts (Arbitrum One)
const GMX_EXCHANGE_ROUTER = '0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8';
const GMX_ORDER_VAULT = '0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5';
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// GMX Markets (token symbol => market address)
const GMX_MARKETS: Record<string, string> = {
  'BTC': '0x47c031236e19d024b42f8AE6780E44A573170703',
  'ETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
  'WETH': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
  'SOL': '0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9',
  'ARB': '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407',
  'LINK': '0x7f1fa204bb700853D36994DA19F830b6Ad18455C',
};

export interface GMXDirectTradeParams {
  safeAddress: string;
  tokenSymbol: string;
  collateralUSDC: number; // Amount in USDC
  leverage: number; // 1-50x
  isLong: boolean;
  slippagePercent?: number; // Default 0.5%
}

export interface GMXDirectCloseParams {
  safeAddress: string;
  tokenSymbol: string;
  sizeDeltaUsd: number; // Position size to close in USD
  isLong: boolean;
  slippagePercent?: number; // Default 0.5%
}

/**
 * GMX Direct Adapter - Calls GMX contracts directly like gmx-safe-sdk does
 */
export class GMXDirectAdapter {
  private moduleService: SafeModuleService;
  private provider: ethers.providers.Provider;

  constructor(moduleService: SafeModuleService, provider: ethers.providers.Provider) {
    this.moduleService = moduleService;
    this.provider = provider;
  }

  /**
   * Step 0: Transfer ETH from Safe to executor for gas costs
   */
  private async transferGasFromSafe(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log('[GMXDirect] Transferring ETH from Safe to executor for gas...');

      const gasAmount = ethers.utils.parseEther('0.003'); // 0.003 ETH should cover gas + execution fees
      const executorAddress = this.moduleService.getExecutorAddress();

      // Simple ETH transfer (empty data)
      const result = await this.moduleService.executeFromModule({
        safeAddress,
        to: executorAddress,
        value: gasAmount.toString(),
        data: '0x',
      });

      if (result.success) {
        console.log('[GMXDirect] ✅ Transferred 0.005 ETH for gas');
      }

      return result;
    } catch (error: any) {
      console.error('[GMXDirect] Gas transfer failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Step 1: Collect 0.2 USDC fee (before GMX trade)
   */
  private async collectTradeFee(safeAddress: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log('[GMXDirect] Collecting 0.2 USDC trade fee...');

      const feeAmount = ethers.utils.parseUnits('0.2', 6);
      const platformFeeReceiver = process.env.PLATFORM_FEE_RECEIVER || this.moduleService.getExecutorAddress();

      // Build USDC transfer calldata
      const usdcAbi = ['function transfer(address to, uint256 amount) returns (bool)'];
      const usdcInterface = new ethers.utils.Interface(usdcAbi);
      const transferData = usdcInterface.encodeFunctionData('transfer', [platformFeeReceiver, feeAmount]);

      // Execute via module
      const result = await this.moduleService.executeFromModule({
        safeAddress,
        to: USDC_ADDRESS,
        value: '0',
        data: transferData,
      });

      if (result.success) {
        console.log('[GMXDirect] ✅ Fee collected: 0.2 USDC');
      }

      return result;
    } catch (error: any) {
      console.error('[GMXDirect] Fee collection failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Step 2: Create GMX market order (increase position)
   * Based on gmx-python-sdk create_increase_order
   */
  async openPosition(params: GMXDirectTradeParams): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log('[GMXDirect] Opening GMX position:', {
        token: params.tokenSymbol,
        collateral: params.collateralUSDC,
        leverage: params.leverage,
        isLong: params.isLong,
      });

      const market = GMX_MARKETS[params.tokenSymbol.toUpperCase()];
      if (!market) {
        throw new Error(`Market not found for ${params.tokenSymbol}`);
      }

      // Get current price from Chainlink (same as GMX uses)
      const gmxReader = createGMXReader(this.provider);
      const priceData = await gmxReader.getMarketPrice(params.tokenSymbol);
      if (!priceData) {
        throw new Error(`Failed to get price for ${params.tokenSymbol}`);
      }

      console.log(`[GMXDirect] Current ${params.tokenSymbol} price: $${priceData.price.toFixed(2)}`);

      // Calculate parameters
      const collateralAmount = ethers.utils.parseUnits(params.collateralUSDC.toString(), 6);
      const positionSizeUsd = params.collateralUSDC * params.leverage;
      const sizeDeltaUsd = ethers.utils.parseUnits(positionSizeUsd.toString(), 30);

      // Acceptable price with slippage
      const slippage = params.slippagePercent || 0.5;
      const slippageFactor = params.isLong ? (1 + slippage / 100) : (1 - slippage / 100);
      const acceptablePrice = ethers.utils.parseUnits((priceData.price * slippageFactor).toFixed(8), 30);

      console.log('[GMXDirect] Trade parameters:', {
        collateral: params.collateralUSDC + ' USDC',
        positionSize: positionSizeUsd + ' USD',
        acceptablePrice: (priceData.price * slippageFactor).toFixed(2),
      });

      // Step 0: Transfer ETH from Safe to executor for gas (DISABLED - GMX deferred)
      // TODO: Re-enable when working on GMX
      // console.log('[GMXDirect] Transferring 0.003 ETH from Safe to executor for gas...');
      // const gasResult = await this.transferGasFromSafe(params.safeAddress);
      // if (!gasResult.success) {
      //   return {
      //     success: false,
      //     error: `Gas transfer failed: ${gasResult.error}`,
      //   };
      // }
      // console.log('[GMXDirect] ✅ Gas transferred to executor');

      // Step 1: Collect fee
      const feeResult = await this.collectTradeFee(params.safeAddress);
      if (!feeResult.success) {
        return {
          success: false,
          error: `Fee collection failed: ${feeResult.error}`,
        };
      }

      // Step 2: Approve USDC to GMX OrderVault
      console.log('[GMXDirect] Approving USDC to GMX OrderVault...');
      const approveData = new ethers.utils.Interface([
        'function approve(address spender, uint256 amount) returns (bool)',
      ]).encodeFunctionData('approve', [GMX_ORDER_VAULT, collateralAmount]);

      const approveResult = await this.moduleService.executeFromModule({
        safeAddress: params.safeAddress,
        to: USDC_ADDRESS,
        value: '0',
        data: approveData,
      });

      if (!approveResult.success) {
        return {
          success: false,
          error: `USDC approval failed: ${approveResult.error}`,
        };
      }

      // Step 3: Wrap ETH to WETH for execution fee (GMX needs WETH, not ETH through module)
      console.log('[GMXDirect] Wrapping 0.001 ETH to WETH for execution fee...');
      
      const executionFee = ethers.utils.parseEther('0.001');
      const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
      
      const wrapData = new ethers.utils.Interface([
        'function deposit() external payable',
      ]).encodeFunctionData('deposit');
      
      const wrapResult = await this.moduleService.executeFromModule({
        safeAddress: params.safeAddress,
        to: WETH_ADDRESS,
        value: executionFee.toString(),
        data: wrapData,
      });
      
      if (!wrapResult.success) {
        return {
          success: false,
          error: `ETH wrap failed: ${wrapResult.error}`,
        };
      }
      
      console.log('[GMXDirect] ✅ ETH wrapped to WETH');
      
      // Step 4: Approve WETH to GMX ExchangeRouter
      console.log('[GMXDirect] Approving WETH to GMX Router...');
      
      const approveWethResult = await this.moduleService.executeFromModule({
        safeAddress: params.safeAddress,
        to: WETH_ADDRESS,
        value: '0',
        data: new ethers.utils.Interface([
          'function approve(address spender, uint256 amount) external returns (bool)',
        ]).encodeFunctionData('approve', [GMX_EXCHANGE_ROUTER, executionFee]),
      });
      
      if (!approveWethResult.success) {
        return {
          success: false,
          error: `WETH approval failed: ${approveWethResult.error}`,
        };
      }
      
      // Step 5: Create GMX order via ExchangeRouter multicall
      console.log('[GMXDirect] Creating GMX market order via multicall...');
      
      // Multicall data array
      const multicallData: string[] = [];
      
      // 1. sendWnt(address receiver, uint256 amount) - send WETH execution fee
      const sendWntData = new ethers.utils.Interface([
        'function sendWnt(address receiver, uint256 amount)',
      ]).encodeFunctionData('sendWnt', [GMX_ORDER_VAULT, executionFee]);
      multicallData.push(sendWntData);
      
      // 2. sendTokens(address token, address receiver, uint256 amount) - send USDC collateral
      const sendTokensData = new ethers.utils.Interface([
        'function sendTokens(address token, address receiver, uint256 amount)',
      ]).encodeFunctionData('sendTokens', [USDC_ADDRESS, GMX_ORDER_VAULT, collateralAmount]);
      multicallData.push(sendTokensData);
      
      // 3. createOrder(CreateOrderParams params) - create the actual order
      const createOrderParams = {
        addresses: {
          receiver: params.safeAddress,
          callbackContract: ethers.constants.AddressZero,
          uiFeeReceiver: ethers.constants.AddressZero,
          market: market,
          initialCollateralToken: USDC_ADDRESS,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd: sizeDeltaUsd,
          initialCollateralDeltaAmount: collateralAmount,
          triggerPrice: 0,
          acceptablePrice: acceptablePrice,
          executionFee: executionFee,
          callbackGasLimit: 0,
          minOutputAmount: 0,
        },
        orderType: 2, // MarketIncrease
        decreasePositionSwapType: 0,
        isLong: params.isLong,
        shouldUnwrapNativeToken: false,
        referralCode: ethers.constants.HashZero,
      };
      
      // Encode as arrays, not objects
      const addressesArray = [
        createOrderParams.addresses.receiver,
        createOrderParams.addresses.receiver, // cancellationReceiver (same as receiver)
        createOrderParams.addresses.callbackContract,
        createOrderParams.addresses.uiFeeReceiver,
        createOrderParams.addresses.market,
        createOrderParams.addresses.initialCollateralToken,
        createOrderParams.addresses.swapPath,
      ];
      
      const numbersArray = [
        createOrderParams.numbers.sizeDeltaUsd,
        createOrderParams.numbers.initialCollateralDeltaAmount,
        createOrderParams.numbers.triggerPrice,
        createOrderParams.numbers.acceptablePrice,
        createOrderParams.numbers.executionFee,
        createOrderParams.numbers.callbackGasLimit,
        createOrderParams.numbers.minOutputAmount,
        0, // validFromTime (0 = execute immediately)
      ];
      
      const createOrderData = new ethers.utils.Interface([
        'function createOrder((address,address,address,address,address,address,address[]) addresses, (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256) numbers, uint8 orderType, uint8 decreasePositionSwapType, bool isLong, bool shouldUnwrapNativeToken, bool autoCancel, bytes32 referralCode, bytes32[] dataList)',
      ]).encodeFunctionData('createOrder', [
        addressesArray,
        numbersArray,
        createOrderParams.orderType,
        createOrderParams.decreasePositionSwapType,
        createOrderParams.isLong,
        createOrderParams.shouldUnwrapNativeToken,
        false, // autoCancel (false = order stays until executed or manually cancelled)
        createOrderParams.referralCode,
        [], // dataList (empty array for basic orders)
      ]);
      multicallData.push(createOrderData);
      
      // Encode multicall
      const multicallInterface = new ethers.utils.Interface([
        'function multicall(bytes[] calldata data) external payable returns (bytes[] memory)',
      ]);
      const multicallEncoded = multicallInterface.encodeFunctionData('multicall', [multicallData]);
      
      console.log('[GMXDirect] Executing GMX multicall (sendWnt + sendTokens + createOrder)...');
      
      // Execute multicall (no ETH value needed, we're sending WETH)
      const orderResult = await this.moduleService.executeFromModule({
        safeAddress: params.safeAddress,
        to: GMX_EXCHANGE_ROUTER,
        value: '0',
        data: multicallEncoded,
      });

      if (orderResult.success) {
        console.log('[GMXDirect] ✅ GMX position opened:', orderResult.txHash);
      }

      return orderResult;
    } catch (error: any) {
      console.error('[GMXDirect] Open position error:', error);
      return {
        success: false,
        error: error.message || 'Failed to open GMX position',
      };
    }
  }

  /**
   * Close GMX position (decrease position)
   * Based on gmx-python-sdk create_decrease_order
   */
  async closePosition(params: GMXDirectCloseParams): Promise<{ success: boolean; txHash?: string; realizedPnL?: number; error?: string }> {
    try {
      console.log('[GMXDirect] Closing GMX position:', {
        token: params.tokenSymbol,
        size: params.sizeDeltaUsd,
        isLong: params.isLong,
      });

      const market = GMX_MARKETS[params.tokenSymbol.toUpperCase()];
      if (!market) {
        throw new Error(`Market not found for ${params.tokenSymbol}`);
      }

      // Get current price
      const gmxReader = createGMXReader(this.provider);
      const priceData = await gmxReader.getMarketPrice(params.tokenSymbol);
      if (!priceData) {
        throw new Error(`Failed to get price for ${params.tokenSymbol}`);
      }

      // Acceptable price (opposite direction for closing)
      const slippage = params.slippagePercent || 0.5;
      const slippageFactor = params.isLong ? (1 - slippage / 100) : (1 + slippage / 100);
      const acceptablePrice = ethers.utils.parseUnits((priceData.price * slippageFactor).toFixed(8), 30);

      // Create decrease order
      const orderParams = {
        addresses: {
          receiver: params.safeAddress,
          callbackContract: ethers.constants.AddressZero,
          uiFeeReceiver: ethers.constants.AddressZero,
          market: market,
          initialCollateralToken: USDC_ADDRESS,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd: ethers.utils.parseUnits(params.sizeDeltaUsd.toString(), 30),
          initialCollateralDeltaAmount: 0, // Remove all collateral
          triggerPrice: 0, // Market order
          acceptablePrice: acceptablePrice,
          executionFee: ethers.utils.parseEther('0.001'),
          callbackGasLimit: 0,
          minOutputAmount: 0,
        },
        orderType: 4, // MarketDecrease
        decreasePositionSwapType: 0,
        isLong: params.isLong,
        shouldUnwrapNativeToken: false,
        referralCode: ethers.constants.HashZero,
      };

      const exchangeRouterAbi = [
        'function createOrder(tuple(tuple(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialCollateralToken,address[] swapPath) addresses,tuple(uint256 sizeDeltaUsd,uint256 initialCollateralDeltaAmount,uint256 triggerPrice,uint256 acceptablePrice,uint256 executionFee,uint256 callbackGasLimit,uint256 minOutputAmount) numbers,uint8 orderType,uint8 decreasePositionSwapType,bool isLong,bool shouldUnwrapNativeToken,bytes32 referralCode) params) payable returns (bytes32)',
      ];

      const exchangeInterface = new ethers.utils.Interface(exchangeRouterAbi);
      const createOrderData = exchangeInterface.encodeFunctionData('createOrder', [orderParams]);

      // Execute close order
      const result = await this.moduleService.executeFromModule({
        safeAddress: params.safeAddress,
        to: GMX_EXCHANGE_ROUTER,
        value: ethers.utils.parseEther('0.001').toString(),
        data: createOrderData,
      });

      if (result.success) {
        console.log('[GMXDirect] ✅ GMX position closed:', result.txHash);
        
        // TODO: Collect 20% profit share if profitable
        // This requires reading the actual PnL from GMX position data
      }

      return result;
    } catch (error: any) {
      console.error('[GMXDirect] Close position error:', error);
      return {
        success: false,
        error: error.message || 'Failed to close GMX position',
      };
    }
  }
}

/**
 * Factory function
 */
export function createGMXDirectAdapter(
  moduleService: SafeModuleService,
  provider: ethers.providers.Provider
): GMXDirectAdapter {
  return new GMXDirectAdapter(moduleService, provider);
}

