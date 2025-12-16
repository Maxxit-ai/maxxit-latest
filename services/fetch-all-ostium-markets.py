#!/usr/bin/env python3
"""
Fetch ALL Ostium markets and output as JSON
This will be called by the TypeScript sync script
"""
import os
import sys
import json
import asyncio

os.environ['PYTHONHTTPSVERIFY'] = '0'

from ostium_python_sdk import OstiumSDK

async def fetch_all_ostium_markets():
    """Fetch all markets from Ostium SDK"""
    dummy_key = '0x' + '1' * 64
    # Use same logic as ostium-service.py
    ostium_mainnet = os.getenv('OSTIUM_MAINNET', 'false').lower() == 'true'
    network = 'mainnet' if ostium_mainnet else 'testnet'
    
    # Select appropriate RPC URL based on network
    if ostium_mainnet:
        default_rpc = 'https://arb1.arbitrum.io/rpc'
    else:
        default_rpc = 'https://sepolia-rollup.arbitrum.io/rpc'
    
    sdk = OstiumSDK(
        network=network,
        private_key=dummy_key,
        rpc_url=os.getenv('OSTIUM_RPC_URL', default_rpc)
    )
    
    try:
        # Get all pairs
        pairs_details = await sdk.get_formatted_pairs_details()
        
        markets = []
        for idx, pair in enumerate(pairs_details):
            if isinstance(pair, dict):
                # Convert Decimal/float values to strings for JSON serialization
                def safe_str(val):
                    if val is None:
                        return None
                    return str(val)
                
                markets.append({
                    'index': pair.get('id', idx),
                    'symbol': pair.get('from', ''),
                    'base': pair.get('to', 'USD'),
                    'name': f"{pair.get('from', '')}/{pair.get('to', 'USD')}",
                    'group': pair.get('group', 'unknown'),
                    'minLevPos': safe_str(pair.get('minLevPos')),
                    'maxLeverage': safe_str(pair.get('maxLeverage')),
                    'isMarketOpen': pair.get('isMarketOpen', True),
                    'currentPrice': safe_str(pair.get('price')),
                })
        
        return {'success': True, 'markets': markets, 'count': len(markets)}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

# Run async function
result = asyncio.run(fetch_all_ostium_markets())
print(json.dumps(result, indent=2))

