#!/usr/bin/env python3
"""
Test Ostium RPC endpoints to see which ones are working
"""

import sys
from web3 import Web3
import time

# RPC endpoints to test
RPC_ENDPOINTS = {
    'Primary (Arbitrum Official)': 'https://sepolia-rollup.arbitrum.io/rpc',
    'Backup (PublicNode)': 'https://arbitrum-sepolia-rpc.publicnode.com',
    'Alchemy (if configured)': None,  # Add if you have Alchemy key
    'Infura (if configured)': None,    # Add if you have Infura key
}

def test_rpc_endpoint(name: str, url: str, timeout: int = 5) -> dict:
    """Test an RPC endpoint"""
    print(f"\n{'='*80}")
    print(f"Testing: {name}")
    print(f"URL: {url}")
    print('='*80)
    
    result = {
        'name': name,
        'url': url,
        'healthy': False,
        'latency_ms': None,
        'block_number': None,
        'error': None
    }
    
    try:
        start_time = time.time()
        
        # Create Web3 instance
        w3 = Web3(Web3.HTTPProvider(url, request_kwargs={'timeout': timeout}))
        
        # Test 1: Get latest block number
        print("  Test 1: Get latest block number...")
        block_number = w3.eth.block_number
        latency = (time.time() - start_time) * 1000
        
        result['block_number'] = block_number
        result['latency_ms'] = round(latency, 2)
        
        print(f"    ✅ Success! Block: {block_number}, Latency: {latency:.2f}ms")
        
        # Test 2: Get chain ID
        print("  Test 2: Get chain ID...")
        start_time = time.time()
        chain_id = w3.eth.chain_id
        latency = (time.time() - start_time) * 1000
        print(f"    ✅ Chain ID: {chain_id}, Latency: {latency:.2f}ms")
        
        # Test 3: Get gas price
        print("  Test 3: Get gas price...")
        start_time = time.time()
        gas_price = w3.eth.gas_price
        latency = (time.time() - start_time) * 1000
        print(f"    ✅ Gas price: {gas_price / 1e9:.2f} Gwei, Latency: {latency:.2f}ms")
        
        # Test 4: Call a contract (Ostium Trading Storage)
        print("  Test 4: Call contract (Ostium Trading Storage)...")
        try:
            storage_address = '0x0B9f5243B29938668c9Cfbd7557A389EC7Ef88b8'
            start_time = time.time()
            code = w3.eth.get_code(storage_address)
            latency = (time.time() - start_time) * 1000
            if code and code != b'\x00':
                print(f"    ✅ Contract code retrieved, Latency: {latency:.2f}ms")
            else:
                print(f"    ⚠️  No contract code (might be EOA or wrong address)")
        except Exception as contract_err:
            print(f"    ⚠️  Contract call failed: {contract_err}")
        
        result['healthy'] = True
        print(f"\n  ✅ {name} is HEALTHY")
        
    except Exception as e:
        error_str = str(e)
        result['error'] = error_str
        result['healthy'] = False
        
        print(f"\n  ❌ {name} is UNHEALTHY")
        print(f"     Error: {error_str[:200]}")
        
        # Check error type
        if 'Connection reset' in error_str or 'Connection aborted' in error_str:
            print(f"     Type: Connection reset (RPC dropped connection)")
        elif 'timeout' in error_str.lower():
            print(f"     Type: Timeout (RPC not responding)")
        elif 'Connection refused' in error_str:
            print(f"     Type: Connection refused (RPC not accepting connections)")
        else:
            print(f"     Type: Other error")
    
    return result

def main():
    print("\n" + "="*80)
    print("OSTIUM RPC ENDPOINT HEALTH CHECK")
    print("="*80)
    print(f"Testing at: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    results = []
    
    for name, url in RPC_ENDPOINTS.items():
        if url is None:
            continue
        result = test_rpc_endpoint(name, url)
        results.append(result)
        time.sleep(1)  # Small delay between tests
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    healthy_count = sum(1 for r in results if r['healthy'])
    total_count = len(results)
    
    print(f"\nHealthy endpoints: {healthy_count}/{total_count}\n")
    
    for result in results:
        status = "✅ HEALTHY" if result['healthy'] else "❌ UNHEALTHY"
        latency = f"({result['latency_ms']}ms)" if result['latency_ms'] else ""
        print(f"{status} {result['name']} {latency}")
        if result['error']:
            print(f"   Error: {result['error'][:100]}")
    
    # Recommendations
    print("\n" + "="*80)
    print("RECOMMENDATIONS")
    print("="*80)
    
    healthy_endpoints = [r for r in results if r['healthy']]
    
    if healthy_endpoints:
        # Sort by latency
        healthy_endpoints.sort(key=lambda x: x['latency_ms'] or float('inf'))
        best = healthy_endpoints[0]
        print(f"\n✅ Best endpoint: {best['name']}")
        print(f"   URL: {best['url']}")
        print(f"   Latency: {best['latency_ms']}ms")
        print(f"\n💡 Set this in your environment:")
        print(f"   export OSTIUM_RPC_URL='{best['url']}'")
    else:
        print("\n❌ ALL ENDPOINTS ARE DOWN!")
        print("   This is likely a temporary network issue.")
        print("   Wait a few minutes and try again.")
        print("\n💡 Alternative RPC providers:")
        print("   - Alchemy: https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY")
        print("   - Infura: https://arbitrum-sepolia.infura.io/v3/YOUR_KEY")
        print("   - QuickNode: https://your-endpoint.quiknode.pro/YOUR_KEY")
    
    print("\n")

if __name__ == '__main__':
    main()

