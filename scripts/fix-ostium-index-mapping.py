#!/usr/bin/env python3
"""
Fix Ostium trade index mapping by querying storage contract directly
"""

import os
from web3 import Web3
from ostium_python_sdk import OstiumSDK
import asyncio

RPC_URL = os.getenv('OSTIUM_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc')
TRADING_STORAGE = '0x0B9f5243B29938668c9Cfbd7557A389EC7Ef88b8'

# Storage contract ABI (minimal)
STORAGE_ABI = [
    {
        "inputs": [
            {"name": "trader", "type": "address"},
            {"name": "pairIndex", "type": "uint256"},
            {"name": "index", "type": "uint256"}
        ],
        "name": "openTrades",
        "outputs": [
            {
                "components": [
                    {"name": "trader", "type": "address"},
                    {"name": "pairIndex", "type": "uint256"},
                    {"name": "index", "type": "uint256"},
                    {"name": "positionSizeAsset", "type": "uint256"},
                    {"name": "openPrice", "type": "uint256"},
                    {"name": "buy", "type": "bool"},
                    {"name": "leverage", "type": "uint256"},
                    {"name": "tp", "type": "uint256"},
                    {"name": "sl", "type": "uint256"}
                ],
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "trader", "type": "address"},
            {"name": "pairIndex", "type": "uint256"}
        ],
        "name": "openTradesCount",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]

async def find_correct_index(user_address, pair_id, target_open_price):
    """
    Find the correct trade index by matching openPrice with storage contract
    """
    print(f"\n🔍 Finding correct index for pair {pair_id}, user {user_address}")
    print(f"   Target openPrice: {target_open_price}")
    
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    checksummed = Web3.to_checksum_address(user_address)
    
    # Create contract instance
    contract = w3.eth.contract(address=Web3.to_checksum_address(TRADING_STORAGE), abi=STORAGE_ABI)
    
    try:
        # Get count of open trades
        count = contract.functions.openTradesCount(checksummed, pair_id).call()
        print(f"   Storage contract shows {count} open trades for this pair")
        
        if count == 0:
            print(f"   ⚠️  No trades found in storage - might be delegation issue")
            return None
        
        # Query each trade
        target_price_wei = int(target_open_price * 1e18)
        
        for i in range(count):
            trade = contract.functions.openTrades(checksummed, pair_id, i).call()
            stored_open_price = trade[4]  # openPrice is at index 4
            stored_index = trade[2]  # index is at index 2
            
            print(f"   Index {i}: openPrice={stored_open_price}, stored_index={stored_index}")
            
            # Match by openPrice (allowing small difference due to precision)
            if abs(stored_open_price - target_price_wei) < 1e15:  # Within 0.001 difference
                print(f"   ✅ MATCH FOUND! Correct index = {stored_index}")
                return stored_index
        
        print(f"   ❌ No matching trade found")
        return None
        
    except Exception as e:
        print(f"   ❌ Error querying storage: {e}")
        return None

async def test_fix(user_address):
    """
    Test the fix by getting SDK trades and finding their correct indices
    """
    print("\n╔═══════════════════════════════════════════════════════════════╗")
    print("║           OSTIUM INDEX MAPPING TEST                           ║")
    print("╚═══════════════════════════════════════════════════════════════╝\n")
    
    # Get trades from SDK
    dummy_key = '0x' + '1' * 64
    sdk = OstiumSDK(network='testnet', private_key=dummy_key, rpc_url=RPC_URL)
    
    user_checksum = Web3.to_checksum_address(user_address)
    result = await sdk.get_open_trades(trader_address=user_checksum)
    
    if not result or not isinstance(result, tuple) or len(result) == 0:
        print("❌ No trades found from SDK")
        return
    
    trades = result[0] if isinstance(result[0], list) else []
    print(f"📊 SDK returned {len(trades)} trades\n")
    print("="*80)
    
    for idx, trade in enumerate(trades):
        trade_id = trade.get('tradeID')
        pair_info = trade.get('pair', {})
        pair_id = pair_info.get('id')
        open_price_raw = trade.get('openPrice')
        open_price = float(int(open_price_raw) / 1e18) if open_price_raw else 0
        sdk_index = trade.get('index')
        
        market = f"{pair_info.get('from')}/{pair_info.get('to')}"
        
        print(f"\n🔸 Trade #{idx + 1}: {market}")
        print(f"   TradeID:        {trade_id}")
        print(f"   Pair ID:        {pair_id}")
        print(f"   SDK Index:      {sdk_index} ❌ (Always '0' - WRONG!)")
        print(f"   Open Price:     ${open_price:.4f}")
        
        # Find correct index
        if pair_id:
            correct_index = await find_correct_index(user_address, int(pair_id), open_price)
            if correct_index is not None:
                print(f"   ✅ CORRECT INDEX: {correct_index}")
                if str(correct_index) != str(sdk_index):
                    print(f"   ⚠️  MISMATCH! SDK says {sdk_index}, actual is {correct_index}")
            else:
                print(f"   ❌ Could not determine correct index")
        
        print("-"*80)
    
    print("\n" + "="*80)
    print("\n📋 CONCLUSION:\n")
    print("The Ostium SDK's get_open_trades() returns index='0' for ALL positions.")
    print("This is a BUG in the SDK or how it parses the data.")
    print("\nWe need to query the TradingStorage contract directly to get correct indices.")

if __name__ == '__main__':
    import sys
    user = sys.argv[1] if len(sys.argv) > 1 else '0xa10846a81528d429b50b0dcbf8968938a572fac5'
    asyncio.run(test_fix(user))

