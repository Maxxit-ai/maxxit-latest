#!/usr/bin/env python3
"""
Debug script to check Ostium position data structure
"""

import os
import sys
import asyncio
import json
from web3 import Web3

# Add parent directory to path to import SDK
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from ostium_python_sdk import OstiumSDK
except ImportError:
    print("ERROR: ostium-python-sdk not installed")
    sys.exit(1)

async def debug_positions(address: str):
    """Debug fetch positions for an address"""
    
    print(f"\n{'='*60}")
    print(f"DEBUGGING OSTIUM POSITIONS")
    print(f"{'='*60}")
    print(f"Address: {address}")
    print(f"{'='*60}\n")
    
    # Setup
    OSTIUM_TESTNET = os.getenv('OSTIUM_TESTNET', 'true').lower() == 'true'
    OSTIUM_RPC_URL = os.getenv('OSTIUM_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc')
    
    network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
    print(f"Network: {network}")
    print(f"RPC URL: {OSTIUM_RPC_URL}\n")
    
    # Convert to checksummed address
    try:
        address = Web3.to_checksum_address(address)
        print(f"Checksummed address: {address}\n")
    except Exception as e:
        print(f"ERROR: Invalid address format: {e}")
        return
    
    # Create SDK instance
    dummy_key = '0x' + '1' * 64
    sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
    
    # Get open trades
    print("Fetching open trades from Ostium SDK...\n")
    result = await sdk.get_open_trades(trader_address=address)
    
    print(f"Raw result type: {type(result)}")
    print(f"Raw result: {result}\n")
    
    # Parse result
    open_trades = []
    if isinstance(result, tuple) and len(result) > 0:
        open_trades = result[0] if isinstance(result[0], list) else []
        print(f"Found {len(open_trades)} open trades\n")
    else:
        print("No trades found or unexpected format\n")
        return
    
    # Inspect each trade
    for idx, trade in enumerate(open_trades):
        print(f"\n{'='*60}")
        print(f"TRADE #{idx + 1}")
        print(f"{'='*60}")
        print(f"Type: {type(trade)}")
        print(f"\nAll keys in trade object:")
        if isinstance(trade, dict):
            for key in sorted(trade.keys()):
                print(f"  - {key}: {type(trade[key])}")
        
        print(f"\nFull trade data (formatted):")
        print(json.dumps(trade, indent=2, default=str))
        
        # Try to extract specific fields
        print(f"\n{'='*60}")
        print("FIELD EXTRACTION ATTEMPTS:")
        print(f"{'='*60}")
        
        # Market info
        pair_info = trade.get('pair', {})
        print(f"pair: {pair_info}")
        print(f"  - from: {pair_info.get('from', 'N/A')}")
        print(f"  - to: {pair_info.get('to', 'N/A')}")
        
        # Position details
        print(f"\nPosition Details:")
        print(f"  - isBuy: {trade.get('isBuy')}")
        print(f"  - collateral (raw): {trade.get('collateral')}")
        print(f"  - collateral (USDC): {float(int(trade.get('collateral', 0)) / 1e6) if trade.get('collateral') else 'N/A'}")
        print(f"  - openPrice (raw): {trade.get('openPrice')}")
        print(f"  - openPrice (USD): {float(int(trade.get('openPrice', 0)) / 1e18) if trade.get('openPrice') else 'N/A'}")
        print(f"  - leverage (raw): {trade.get('leverage')}")
        print(f"  - leverage (x): {float(int(trade.get('leverage', 0)) / 100) if trade.get('leverage') else 'N/A'}")
        
        # PnL extraction attempts
        print(f"\nPnL Field Search:")
        pnl_fields = ['pnl', 'unrealizedPnl', 'unrealizedPnlUSD', 'realizedPnl', 
                      'profitLoss', 'profit', 'loss', 'currentPnl']
        
        for field in pnl_fields:
            if field in trade:
                value = trade[field]
                print(f"  ✅ {field}: {value} (type: {type(value)})")
                
                # Try conversion
                if isinstance(value, (int, str)):
                    try:
                        val_int = int(value)
                        print(f"     → As int: {val_int}")
                        print(f"     → /1e6 (USDC): {val_int / 1e6}")
                        print(f"     → /1e18 (wei): {val_int / 1e18}")
                    except:
                        pass
            else:
                print(f"  ❌ {field}: NOT FOUND")
        
        # Additional fields that might contain PnL
        print(f"\nOther numeric fields:")
        for key, value in trade.items():
            if isinstance(value, (int, str)) and key not in ['tradeID', 'index', 'pair']:
                try:
                    val_int = int(value) if isinstance(value, str) else value
                    if abs(val_int) > 0:
                        print(f"  - {key}: {val_int}")
                except:
                    pass
        
        print(f"\n{'='*60}\n")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python scripts/debug-ostium-positions.py <address>")
        print("Example: python scripts/debug-ostium-positions.py 0xa10846a81528d429b50b0dcbf8968938a572fac5")
        sys.exit(1)
    
    address = sys.argv[1]
    asyncio.run(debug_positions(address))

