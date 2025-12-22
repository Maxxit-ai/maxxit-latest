#!/usr/bin/env python3
"""
Ostium Trading Service
Flask service for Ostium perpetual DEX integration using official Python SDK
Similar to hyperliquid-service.py but for Arbitrum-based Ostium
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from web3 import Web3
import os
import logging
from datetime import datetime
import traceback
import ssl
import warnings
import asyncio
import asyncio

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("WARNING: python-dotenv not installed. To use .env file, run: pip install python-dotenv")

# Disable SSL warnings for testnet (dev only)
warnings.filterwarnings('ignore', message='Unverified HTTPS request')
os.environ['PYTHONHTTPSVERIFY'] = '0'
ssl._create_default_https_context = ssl._create_unverified_context

# Ostium SDK imports
try:
    from ostium_python_sdk import OstiumSDK
except ImportError:
    print("ERROR: ostium-python-sdk not installed. Run: pip install ostium-python-sdk")
    exit(1)

# Monkey-patch the SDK to fix raw_transaction bug
try:
    from web3.types import SignedTransaction
    if not hasattr(SignedTransaction, 'raw_transaction'):
        SignedTransaction.raw_transaction = property(lambda self: self.rawTransaction)
except Exception as e:
    logging.warning(f"Could not apply monkey-patch: {e}")

# Setup
app = Flask(__name__)
CORS(app)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        # logging.FileHandler('logs/ostium-service.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
# Flag is explicit: set OSTIUM_MAINNET=true when using mainnet, false for testnet.
OSTIUM_MAINNET = os.getenv('OSTIUM_MAINNET', 'false').lower() == 'true'
OSTIUM_TESTNET = not OSTIUM_MAINNET  # Backward compatibility

# Network configuration based on the flag
if OSTIUM_MAINNET:
    OSTIUM_RPC_URL = os.getenv('OSTIUM_RPC_URL', 'https://arb1.arbitrum.io/rpc')
    OSTIUM_RPC_BACKUP = os.getenv('OSTIUM_RPC_BACKUP', 'https://arb1.arbitrum.io/rpc')
else:
    OSTIUM_RPC_URL = os.getenv('OSTIUM_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc')
    OSTIUM_RPC_BACKUP = os.getenv('OSTIUM_RPC_BACKUP', 'https://sepolia-rollup.arbitrum.io/rpc')

PORT = int(os.getenv('OSTIUM_SERVICE_PORT', '5002'))

logger.info(f"🚀 Ostium Service Starting...")
logger.info(f"   Network: {'MAINNET' if OSTIUM_MAINNET else 'TESTNET'}")
logger.info(f"   RPC URL: {OSTIUM_RPC_URL}")

# SDK Cache
sdk_cache = {}

# Available Markets Cache
available_markets_cache = {
    'markets': None,
    'last_updated': None,
    'ttl': 300  # 5 minutes cache
}


def check_rpc_health(rpc_url: str, timeout: int = 3) -> bool:
    """Check if RPC endpoint is healthy (quick check)"""
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={'timeout': timeout}))
        # Try a simple call (get latest block number)
        block_number = w3.eth.block_number
        logger.info(f"✅ RPC healthy: {rpc_url} (block: {block_number})")
        return True
    except Exception as e:
        logger.warning(f"❌ RPC unhealthy: {rpc_url} - {str(e)[:100]}")
        return False

def get_sdk(private_key: str, use_delegation: bool = False, force_new: bool = False) -> OstiumSDK:
    """Get or create SDK instance with caching and optional RPC health checks"""
    cache_key = f"{private_key[:10]}_{use_delegation}"
    
    # Only check RPC health if forcing new SDK (after errors)
    rpc_url = OSTIUM_RPC_URL
    if force_new:
        logger.info("🔍 Checking RPC health before recreating SDK...")
        if not check_rpc_health(rpc_url, timeout=3):
            logger.warning(f"⚠️  Primary RPC unhealthy, trying backup: {OSTIUM_RPC_BACKUP}")
            if check_rpc_health(OSTIUM_RPC_BACKUP, timeout=3):
                rpc_url = OSTIUM_RPC_BACKUP
                logger.info(f"✅ Switching to backup RPC: {rpc_url}")
                # Clear cache to force new SDK with backup RPC
                if cache_key in sdk_cache:
                    del sdk_cache[cache_key]
            else:
                logger.error(f"❌ Both RPCs unhealthy, but proceeding anyway (might be temporary)")
                # Still proceed - might be temporary network issue
    
    if cache_key not in sdk_cache or force_new:
        network = 'mainnet' if OSTIUM_MAINNET else 'testnet'
        sdk_cache[cache_key] = OstiumSDK(
            network=network,
            private_key=private_key,
            rpc_url=rpc_url,
            use_delegation=use_delegation  # CRITICAL: Enable delegation mode!
        )
        logger.info(f"Created SDK instance (delegation={use_delegation}, rpc={rpc_url})")
    
    return sdk_cache[cache_key]


def get_available_markets(refresh=False):
    """
    Fetch available markets from Database API
    Returns dict: {
        'BTC': {'index': 0, 'name': 'BTC/USD', 'available': True},
        'ETH': {'index': 1, 'name': 'ETH/USD', 'available': True},
        ...
    }
    """
    import time
    import requests
    
    # Check cache
    if not refresh and available_markets_cache['markets'] is not None:
        if available_markets_cache['last_updated'] is not None:
            age = time.time() - available_markets_cache['last_updated']
            if age < available_markets_cache['ttl']:
                return available_markets_cache['markets']
    
    logger.info("Fetching available markets from database API...")
    
    try:
        # Fetch from database API
        api_url = os.getenv('NEXTJS_API_URL', 'http://localhost:5000')
        response = requests.get(f"{api_url}/api/venue-markets/available?venue=OSTIUM", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('markets'):
                markets = data['markets']
                available_markets_cache['markets'] = markets
                available_markets_cache['last_updated'] = time.time()
                logger.info(f"✅ Loaded {len(markets)} available markets from database")
                return markets
        
        # If API call fails, use fallback
        raise Exception(f"API returned status {response.status_code}")
        
    except Exception as e:
        logger.error(f"Failed to fetch markets from API: {e}")
        # Return known markets as fallback
        fallback = {
            'BTC': {'index': 0, 'name': 'BTC/USD', 'available': True},
            'ETH': {'index': 1, 'name': 'ETH/USD', 'available': True},
            'SOL': {'index': 9, 'name': 'SOL/USD', 'available': True},
            'HYPE': {'index': 41, 'name': 'HYPE/USD', 'available': True},
            'XRP': {'index': 39, 'name': 'XRP/USD', 'available': True},
            'LINK': {'index': 42, 'name': 'LINK/USD', 'available': True},
            'ADA': {'index': 43, 'name': 'ADA/USD', 'available': True},
        }
        available_markets_cache['markets'] = fallback
        available_markets_cache['last_updated'] = time.time()
        logger.info(f"⚠️  Using fallback markets ({len(fallback)} markets)")
        return fallback


def validate_market(token_symbol: str):
    """
    Validate if a market is available on Ostium
    Returns: (asset_index, is_available, market_name)
    """
    token_symbol = token_symbol.upper()
    markets = get_available_markets()
    
    if token_symbol in markets:
        market_info = markets[token_symbol]
        return market_info['index'], True, market_info['name']
    else:
        # Market not found
        return None, False, None


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "ostium",
        "network": "testnet" if OSTIUM_TESTNET else "mainnet",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "v4.0-TESTNET-RESILIENCE",  # Testnet oracle fallback + error handling
        "features": {
            "price_feed": True,
            "price_feed_testnet_fallback": True,
            "delegation": True,
            "trailing_stops": True,
            "position_monitoring": True,
            "close_position_idempotency": True,
            "error_tuple_detection": True
        }
    })


@app.route('/test-deployment', methods=['GET'])
def test_deployment():
    """Test endpoint to verify new code is deployed"""
    return jsonify({
        "message": "🎉 NEW CODE IS DEPLOYED!",
        "timestamp": datetime.utcnow().isoformat(),
        "close_fix_present": True
    })


@app.route('/balance', methods=['POST'])
def get_balance():
    """
    Get user's Ostium balance
    Body: { "address": "0x..." }
    """
    try:
        data = request.json
        address = data.get('address')
        
        if not address:
            return jsonify({"success": False, "error": "Missing address"}), 400
        
        # Convert to checksummed address
        try:
            address = Web3.to_checksum_address(address)
        except Exception as e:
            return jsonify({"success": False, "error": f"Invalid address format: {str(e)}"}), 400
        
        # Use a dummy key for read-only operations  
        # SDK requires a private key even for read operations
        dummy_key = '0x' + '1' * 64
        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
        
        # Get balances
        usdc_balance = sdk.balance.get_usdc_balance(address)
        eth_balance = sdk.balance.get_ether_balance(address)
        
        logger.info(f"Balance check for {address}: {usdc_balance} USDC")
        
        return jsonify({
            "success": True,
            "address": address,
            "usdcBalance": str(usdc_balance),
            "ethBalance": str(eth_balance)
        })
    
    except Exception as e:
        logger.error(f"Balance check error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/positions', methods=['POST'])
def get_positions():
    """
    Get open positions for an address
    Body: { "address": "0x..." }
    """
    try:
        data = request.json
        address = data.get('address')
        
        if not address:
            return jsonify({"success": False, "error": "Missing address"}), 400
        
        # Convert to checksummed address
        try:
            address = Web3.to_checksum_address(address)
        except Exception as e:
            return jsonify({"success": False, "error": f"Invalid address format: {str(e)}"}), 400
        
        # Create SDK instance
        dummy_key = '0x' + '1' * 64
        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
        
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Step 1: Get current open trades
        open_trades_result = loop.run_until_complete(sdk.get_open_trades(trader_address=address))
        
        # Step 2: Get recent history to find TX hashes for matching
        recent_history = loop.run_until_complete(
            sdk.subgraph.get_recent_history(trader=address.lower(), last_n_orders=100)
        )
        loop.close()
        
        current_open_trades = []
        if isinstance(open_trades_result, tuple) and len(open_trades_result) > 0:
            current_open_trades = open_trades_result[0] if isinstance(open_trades_result[0], list) else []
        
        # Build a lookup map from history for TX hashes
        tx_hash_lookup = {}
        tx_hash_by_price = {}
        
        for history_item in recent_history:
            order_action = history_item.get('orderAction', '').lower()
            if order_action == 'open':
                pair_info = history_item.get('pair', {})
                pair_id = pair_info.get('id', '')
                trade_index = history_item.get('index', '0')
                tx_hash = history_item.get('executedTx', '')
                
                if not tx_hash:
                    continue
                
                # Strategy 1: Match by (pair_id, trade_index)
                lookup_key = f"{pair_id}_{trade_index}"
                tx_hash_lookup[lookup_key] = tx_hash
                
                # Strategy 2: Match by tradeID
                trade_id = history_item.get('tradeID', '')
                if trade_id:
                    tx_hash_lookup[f"trade_{trade_id}"] = tx_hash
                
        logger.info(f"Built TX hash lookup with {len(tx_hash_lookup)} index entries, {len(tx_hash_by_price)} price entries")
        
        positions = []
        for trade in current_open_trades:
            try:
                pair_info = trade.get('pair', {})
                pair_from = pair_info.get('from', 'UNKNOWN')
                pair_id = pair_info.get('id', '')
                
                token_symbol = pair_from.upper()
                market_symbol = f"{pair_from}/{pair_info.get('to', 'USD')}"
                
                trade_index = trade.get('index', '0')
                trade_id = trade.get('tradeID', trade.get('index', '0'))
                
                lookup_key = f"{pair_id}_{trade_index}"
                tx_hash = tx_hash_lookup.get(lookup_key, '')
                
                if not tx_hash:
                    tx_hash = tx_hash_lookup.get(f"trade_{trade_id}", '')
                
                if not tx_hash:
                    entry_price_usd = float(int(trade.get('openPrice', 0)) / 1e18)
                    price_key = f"{pair_id}_{round(entry_price_usd, 6)}"
                    tx_hash = tx_hash_by_price.get(price_key, '')
                    if tx_hash:
                        logger.info(f"Found TX hash by price match for {token_symbol}: {tx_hash[:16]}...")
                
                if tx_hash:
                    logger.info(f"Found TX hash for {token_symbol} position: {tx_hash[:16]}...")
                else:
                    logger.warning(f"No TX hash found for {token_symbol} position (index={trade_index}, pair={pair_id})")
                
                collateral_usdc = float(int(trade.get('collateral', 0)) / 1e6)
                entry_price_usd = float(int(trade.get('openPrice', 0)) / 1e18)
                leverage = float(int(trade.get('leverage', 0)) / 100)
                trade_notional_wei = int(trade.get('tradeNotional', 0))
                position_size = float(trade_notional_wei / 1e18) if trade_notional_wei > 0 else 0.0
                
                stop_loss_raw = trade.get('stopLossPrice', 0)
                stop_loss_price = float(int(stop_loss_raw) / 1e18) if stop_loss_raw else 0.0
                
                take_profit_raw = trade.get('takeProfitPrice', 0)
                take_profit_price = float(int(take_profit_raw) / 1e18) if take_profit_raw else 0.0
                
                funding_wei = int(trade.get('funding', 0))
                rollover_wei = int(trade.get('rollover', 0))
                total_fees_usd = float((funding_wei + rollover_wei) / 1e18)
                
                positions.append({
                    "market": token_symbol,
                    "marketFull": market_symbol,
                    "side": "long" if trade.get('isBuy') else "short",
                    "size": collateral_usdc,
                    "entryPrice": entry_price_usd,
                    "leverage": leverage,
                    "unrealizedPnl": 0.0,
                    "tradeId": str(trade_id),
                    "txHash": tx_hash,
                    "tradeNotional": trade_notional_wei,
                    "positionSize": position_size,
                    "funding": funding_wei,
                    "rollover": rollover_wei,
                    "totalFees": total_fees_usd,
                    "pairIndex": pair_id,
                    "tradeIndex": trade_index,
                    "stopLossPrice": stop_loss_price,
                    "takeProfitPrice": take_profit_price,
                })
            except Exception as parse_error:
                logger.error(f"Error parsing trade: {parse_error}")
                continue
        
        logger.info(f"Found {len(positions)} open positions for {address}")
        
        return jsonify({
            "success": True,
            "positions": positions
        })
    
    except Exception as e:
        logger.error(f"Get positions error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/open-position', methods=['POST'])
def open_position():
    """
    Open a position on Ostium (supports both formats)
    Format 1 (agent-based):
    {
        "agentAddress": "0x...",      # Agent's wallet address (agent's private key from env)
        "userAddress": "0x...",        # User's wallet (trading on behalf of)
        "market": "HYPE",              # Token symbol
        "side": "long",                # "long" or "short"
        "collateral": 100,             # Collateral in USDC
        "leverage": 3                  # Leverage multiplier
    }
    Format 2 (legacy):
    {
        "privateKey": "0x...",
        "market": "BTC",
        "size": 0.01,
        "side": "long",
        "leverage": 10,
        "useDelegation": false,
        "userAddress": "0x..."
    }
    """
    try:
        data = request.json
        logger.info(f"[OPEN-POSITION] Received request with keys: {list(data.keys()) if data else 'None'}")
        logger.info(f"[OPEN-POSITION] Request data: {data}")
        
        # Support both agentAddress and privateKey formats
        agent_address = data.get('agentAddress')
        private_key = data.get('privateKey')
        
        # If agentAddress is provided, look up agent's private key from database
        if agent_address:
            try:
                # Import here to avoid circular dependency
                import psycopg2
                from psycopg2.extras import RealDictCursor
                import sys
                sys.path.insert(0, os.path.dirname(__file__))
                from encryption_helper import decrypt_private_key
                
                # Get database URL from environment
                database_url = os.getenv('DATABASE_URL')
                if not database_url:
                    return jsonify({
                        "success": False,
                        "error": "DATABASE_URL not configured"
                    }), 500
                
                conn = psycopg2.connect(database_url)
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                # Try user_agent_addresses first (new system)
                cur.execute(
                    """
                    SELECT 
                        ostium_agent_key_encrypted,
                        ostium_agent_key_iv,
                        ostium_agent_key_tag
                    FROM user_agent_addresses 
                    WHERE LOWER(ostium_agent_address) = LOWER(%s)
                    """,
                    (agent_address,)
                )
                user_address_row = cur.fetchone()
                
                if user_address_row and user_address_row['ostium_agent_key_encrypted']:
                    # Decrypt the private key
                    try:
                        private_key = decrypt_private_key(
                            user_address_row['ostium_agent_key_encrypted'],
                            user_address_row['ostium_agent_key_iv'],
                            user_address_row['ostium_agent_key_tag']
                        )
                        logger.info(f"✅ Found and decrypted agent key for {agent_address} from user_agent_addresses")
                    except Exception as decrypt_error:
                        logger.error(f"Failed to decrypt key: {decrypt_error}")
                        cur.close()
                        conn.close()
                        return jsonify({
                            "success": False,
                            "error": f"Failed to decrypt agent key: {str(decrypt_error)}"
                        }), 500
                else:
                    # Fallback to wallet_pool (legacy)
                    cur.execute(
                        "SELECT private_key FROM wallet_pool WHERE LOWER(address) = LOWER(%s)",
                        (agent_address,)
                    )
                    wallet = cur.fetchone()
                    
                    if not wallet:
                        cur.close()
                        conn.close()
                        return jsonify({
                            "success": False,
                            "error": f"Agent address {agent_address} not found in user_agent_addresses or wallet_pool"
                        }), 404
                    
                    private_key = wallet['private_key']
                    logger.info(f"Found agent key for {agent_address} in wallet_pool (legacy)")
                
                cur.close()
                conn.close()
                use_delegation = True
                
            except Exception as e:
                logger.error(f"Error fetching agent key: {e}")
                logger.error(traceback.format_exc())
                return jsonify({
                    "success": False,
                    "error": f"Failed to fetch agent key: {str(e)}"
                }), 500
        else:
            use_delegation = data.get('useDelegation', False)
        
        # Handle collateral vs size
        collateral = data.get('collateral')
        size = data.get('size')
        position_size = float(collateral) if collateral is not None else float(size) if size is not None else None
        
        market = data.get('market')
        side = data.get('side', 'long')
        leverage = float(data.get('leverage', 10))
        user_address = data.get('userAddress')
        deployment_id = data.get('deploymentId')
        signal_id = data.get('signalId')
        
        stop_loss_percent = data.get('stopLossPercent', 0.10)
        
        if not all([private_key, market, position_size]):
            return jsonify({
                "success": False,
                "error": "Missing required fields"
            }), 400
        
        if use_delegation and not user_address:
            return jsonify({
                "success": False,
                "error": "userAddress required for delegation"
            }), 400
        
        # Checksum addresses
        if user_address:
            try:
                user_address = Web3.to_checksum_address(user_address)
            except:
                return jsonify({"success": False, "error": "Invalid userAddress format"}), 400
        
        logger.info(f"Opening {side} position: {position_size} USDC on {market} (leverage: {leverage}x, delegation: {use_delegation})")
        if use_delegation:
            logger.info(f"Trading on behalf of: {user_address}")
        
        if deployment_id and signal_id:
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                
                database_url = os.getenv('DATABASE_URL')
                if database_url:
                    conn = psycopg2.connect(database_url)
                    cur = conn.cursor(cursor_factory=RealDictCursor)
                    
                    # Check if position already exists for this deployment+signal combination
                    cur.execute(
                        """
                        SELECT id, ostium_trade_id, entry_tx_hash, ostium_trade_index 
                        FROM positions 
                        WHERE deployment_id = %s 
                        AND signal_id = %s
                        AND venue = 'OSTIUM'
                        LIMIT 1
                        """,
                        (deployment_id, signal_id)
                    )
                    existing_position = cur.fetchone()
                    cur.close()
                    conn.close()
                    
                    if existing_position:
                        # Position already exists for this deployment - return existing order details
                        existing_trade_id = existing_position.get('ostium_trade_id') or existing_position.get('entry_tx_hash')
                        existing_index = existing_position.get('ostium_trade_index')
                        
                        logger.info(f"✅ IDEMPOTENCY: Position already exists for deployment {deployment_id[:8]}... + signal {signal_id[:8]}...")
                        logger.info(f"   Returning existing order (tradeId: {existing_trade_id})")
                        
                        # Return existing order details (idempotent response)
                        return jsonify({
                            "success": True,
                            "orderId": existing_trade_id or 'pending',
                            "tradeId": existing_trade_id or 'pending',
                            "transactionHash": existing_position.get('entry_tx_hash', ''),
                            "txHash": existing_position.get('entry_tx_hash', ''),
                            "status": "pending",
                            "message": "Order already exists (idempotency check - same deployment)",
                            "actualTradeIndex": existing_index,
                            "entryPrice": 0,  # Will be updated by position monitor
                            "slSet": False,
                            "slError": None,
                            "result": {
                                "market": market,
                                "side": side,
                                "collateral": position_size,
                                "leverage": leverage,
                                "actualTradeIndex": existing_index,
                                "entryPrice": 0,
                                "slConfigured": False,
                                "tpConfigured": False,
                            }
                        })
            except Exception as idempotency_error:
                logger.warning(f"⚠️  Idempotency check failed: {idempotency_error}")
                # Continue with order creation if check fails
        
        # Retry logic for SDK operations (handles connection errors during SDK initialization)
        max_sdk_retries = 3
        sdk_retry_delay = 2
        sdk = None
        
        for sdk_attempt in range(max_sdk_retries):
            try:
                # Get SDK instance (may fail if RPC connection is reset)
                sdk = get_sdk(private_key, use_delegation, force_new=(sdk_attempt > 0))
                # Test SDK by getting public address (this makes an RPC call)
                test_address = sdk.ostium.get_public_address()
                logger.info(f"✅ SDK initialized successfully (attempt {sdk_attempt + 1})")
                break
            except Exception as sdk_init_err:
                error_str = str(sdk_init_err)
                is_network_error = any(keyword in error_str.lower() for keyword in [
                    'connection reset', 'connection aborted', 'connection refused',
                    'timeout', 'network', 'peer', 'reset by peer', 'errno 104'
                ])
                
                if is_network_error and sdk_attempt < max_sdk_retries - 1:
                    wait_time = sdk_retry_delay * (sdk_attempt + 1)
                    logger.warning(f"⚠️  SDK initialization failed (attempt {sdk_attempt + 1}/{max_sdk_retries}): {error_str[:150]}")
                    logger.info(f"   Retrying SDK creation in {wait_time} seconds...")
                    import time
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"❌ SDK initialization failed: {error_str}")
                    raise
        
        if sdk is None:
            raise Exception("Failed to initialize SDK after retries")
        
        # Try to find market dynamically instead of hardcoding
        # Ostium SDK should handle market availability internally
        # We'll use a flexible approach that works with any token
        
        # Validate market availability using the validation function
        asset_index, is_available, market_name = validate_market(market)
        
        if not is_available:
            available_markets_list = ', '.join(get_available_markets().keys())
            error_msg = f"Market {market} is not available on Ostium. Available markets: {available_markets_list}"
            logger.warning(error_msg)
            return jsonify({
                "success": False,
                "error": error_msg,
                "availableMarkets": list(get_available_markets().keys())
            }), 400
        
        logger.info(f"✅ Market validated: {market_name} (index: {asset_index})")
        
        # Get current market price (needed for SL/TP calculation)
        try:
            # Fetch real-time price from Ostium price feed (async method)
            dummy_key = '0x' + '1' * 64
            network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
            price_sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
            
            try:
                # get_price is async - need to await it properly
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                price_result = loop.run_until_complete(price_sdk.price.get_price(market.upper(), 'USD'))
                loop.close()
                
                if isinstance(price_result, tuple) and len(price_result) >= 1:
                    current_price = float(price_result[0])
                    logger.info(f"✅ Current {market} price from Ostium: ${current_price}")
                else:
                    raise Exception("Invalid price format")
            except Exception as price_error:
                logger.warning(f"Could not fetch Ostium price for {market}: {price_error}")
                # Fallback to defaults
                price_defaults = {
                    'BTC': 90000.0,
                    'ETH': 3000.0,
                    'SOL': 200.0,
                    'HYPE': 40.0,
                    'XRP': 2.5,
                    'ADA': 1.0,
                }
                current_price = price_defaults.get(market.upper(), 100.0)
                logger.info(f"Using fallback price for {market}: ${current_price}")
        except Exception as e:
            logger.warning(f"Price fetch error for {market}: {e}")
            current_price = 100.0
        
        # IMPORTANT: Do NOT include sl/tp in trade_params - causes WrongSL() errors
        # We will set SL AFTER the position opens using update_sl()
        # TP will NOT be set - monitoring service handles trailing stops via trailing stop logic
        logger.info(f"ℹ️  Stop-Loss will be set after position opens: {(stop_loss_percent * 100):.1f}%")
        logger.info(f"💰 TP will NOT be set - monitoring service handles trailing stops")
        
        # Build trade params WITHOUT sl/tp (SL will be set after opening, TP stays disabled)
        trade_params = {
            'asset_type': asset_index,
            'collateral': position_size,
            'direction': side.lower() == 'long',
            'leverage': leverage,
        }
        
        # Add trader_address for delegated trades
        if use_delegation:
            trade_params['trader_address'] = user_address
        
        # Execute trade WITHOUT sl/tp parameters (SL will be set after opening)
        logger.info(f"📤 Calling perform_trade with params: {trade_params}")
        logger.info(f"   Price: {current_price}")
        logger.info(f"   SL: Will be set after position opens")
        logger.info(f"   TP: NOT set - monitoring service handles trailing stops")
        
        # Retry logic for network errors
        max_retries = 3
        retry_delay = 2  # seconds
        last_error = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"🔄 Attempting trade (attempt {attempt + 1}/{max_retries})...")
                result = sdk.ostium.perform_trade(trade_params, at_price=current_price)
                logger.info(f"✅ Trade succeeded on attempt {attempt + 1}")
                break  # Success, exit retry loop
            except Exception as trade_err:
                error_str = str(trade_err)
                last_error = trade_err
                
                # Check if it's a network/connection error
                is_network_error = any(keyword in error_str.lower() for keyword in [
                    'connection reset', 'connection aborted', 'connection refused',
                    'timeout', 'network', 'peer', 'reset by peer', 'errno 104',
                    'connection', 'aborted'
                ])
                
                if is_network_error and attempt < max_retries - 1:
                    wait_time = retry_delay * (attempt + 1)  # Exponential backoff: 2s, 4s, 6s
                    logger.warning(f"⚠️  Network/connection error (attempt {attempt + 1}/{max_retries})")
                    logger.warning(f"   Error: {error_str[:200]}")  # Truncate long errors
                    logger.info(f"   RPC URL: {OSTIUM_RPC_URL}")
                    
                    # Recreate SDK instance with fresh connection (might have stale connection)
                    logger.info("   Recreating SDK instance with fresh connection...")
                    try:
                        # Clear cache and create new SDK
                        cache_key = f"{private_key[:10]}_{use_delegation}"
                        if cache_key in sdk_cache:
                            del sdk_cache[cache_key]
                        sdk = get_sdk(private_key, use_delegation)
                        logger.info("   ✅ New SDK instance created")
                    except Exception as sdk_err:
                        logger.warning(f"   ⚠️  Could not recreate SDK: {sdk_err}")
                    
                    logger.info(f"   Retrying in {wait_time} seconds...")
                    import time
                    time.sleep(wait_time)
                    continue
                else:
                    # Not a network error, or max retries reached
                    if attempt == max_retries - 1 and is_network_error:
                        logger.error(f"❌ Network error after {max_retries} attempts")
                        logger.error(f"   RPC URL: {OSTIUM_RPC_URL}")
                        logger.error(f"   This might be a temporary RPC issue - try again later")
                        logger.error(f"   Or check if RPC endpoint is accessible")
                    else:
                        logger.error(f"❌ perform_trade error: {error_str}")
                        logger.error(f"   Trade params were: {trade_params}")
                        logger.error(f"   Price was: {current_price}")
                    raise
        
        if last_error and not result:
            # This shouldn't happen, but just in case
            raise last_error
        
        # Extract order_id and receipt
        order_id = result.get('order_id') if isinstance(result, dict) else None
        receipt = result.get('receipt') if isinstance(result, dict) else None
        
        logger.info(f"📥 Order created! order_id: {order_id}")
        
        if not order_id:
            raise Exception("No order_id returned from SDK - trade may have failed")
        
        logger.info(f"✅ Order submitted: {order_id} (waiting for keeper to fill)")
        
        # CRITICAL: Get actual trade index using subgraph API (cleaner approach)
        # NOTE: Order is pending (keeper will fill in 1-5 min), so we need to wait
        actual_trade_index = None
        
        try:
            logger.info(f"🔍 Attempting to get trade index via subgraph API...")
            
            # Wait for the transaction to be confirmed and trade to be filled
            import time
            time.sleep(10)  # Wait 10 seconds for keeper to fill the order
            
            # Get trader address
            if use_delegation and user_address:
                trader_address = Web3.to_checksum_address(user_address)
            else:
                trader_address = sdk.ostium.get_public_address()
            
            logger.info(f"📊 Querying subgraph for trades by {trader_address}...")
            
            # Use subgraph API to get open trades (async method)
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            open_trades = loop.run_until_complete(sdk.subgraph.get_open_trades(trader_address))
            loop.close()
            
            logger.info(f"📊 Found {len(open_trades)} open trades")
            
            if len(open_trades) > 0:
                newly_opened_trade = None
                for trade in open_trades:
                    trade_market = trade.get('pair', {}).get('from', '').upper()
                    trade_side = "long" if trade.get('isBuy') else "short"
                    trade_collateral_raw = trade.get('collateral', 0)
                    trade_collateral = float(int(trade_collateral_raw)) / 1e6 if trade_collateral_raw else 0
                    
                    if trade_market == market.upper() and \
                       trade_side == side.lower() and \
                       abs(trade_collateral - position_size) / position_size < 0.05:
                        newly_opened_trade = trade
                        break
                
                if newly_opened_trade:
                    actual_trade_index = newly_opened_trade.get('index')
                    trade_pair_id = newly_opened_trade.get('pair', {}).get('id')
                    trade_entry_price = float(int(newly_opened_trade.get('openPrice', 0)) / 1e18) if newly_opened_trade.get('openPrice') else 0
                    
                    if trade_entry_price > 0:
                        current_price = trade_entry_price
                
                logger.info(f"✅ Found newly opened trade!")
                logger.info(f"   Trade Index: {actual_trade_index}")
                logger.info(f"   Pair ID: {trade_pair_id}")
                logger.info(f"   Entry Price: ${current_price:.4f}")
                
                # Verify it's the correct pair
                if trade_pair_id != str(asset_index):
                    logger.warning(f"⚠️  Pair mismatch! Expected {asset_index}, got {trade_pair_id}")
                    logger.warning(f"   This might be a subgraph delay - position monitor will verify")
                else:
                    logger.warning(f"⚠️  No matching open trade found yet - order may not be filled")
                    logger.warning(f"   Position monitor will update index once position is discovered")
                    actual_trade_index = None
            else:
                logger.warning(f"⚠️  No open trades found yet - order may not be filled")
                logger.warning(f"   Position monitor will set TP/SL once trade is filled")
                actual_trade_index = None
                
        except Exception as index_err:
            logger.warning(f"⚠️  Error getting trade index via subgraph: {index_err}")
            logger.warning(f"   Order may not be filled yet (keeper takes 1-5 minutes)")
            logger.warning(f"   Position monitor will update index once order is filled")
            logger.warning(traceback.format_exc())
            actual_trade_index = None
        
        if actual_trade_index is not None:
            logger.info(f"💾 Storing actual trade index: {actual_trade_index}")
        else:
            logger.info(f"ℹ️  Index not available yet (order pending or delegation issue)")
            logger.info(f"   Position monitor will update index once position is discovered")
        
        sl_set_success = False
        sl_error = None
        logger.info(f"ℹ️  SL will be set by position monitor once keeper fills the order")
        logger.info(f"   Reason: Need to wait for keeper (1-5 min) and use user's filled position for accurate liquidation price")
        
        # Convert Web3 AttributeDict to regular dict for JSON serialization
        tx_hash = ''
        if receipt:
            tx_hash = receipt.get('transactionHash', receipt.get('hash', ''))
            if hasattr(tx_hash, 'hex'):
                tx_hash = tx_hash.hex()
        
        return jsonify({
            "success": True,
            "orderId": order_id,
            "tradeId": str(order_id),  # Alias for compatibility
            "transactionHash": str(tx_hash) if tx_hash else '',
            "txHash": str(tx_hash) if tx_hash else '',  # Alias for compatibility
            "status": "pending",
            "message": "Order created, waiting for keeper to fill position",
            "actualTradeIndex": actual_trade_index,
            "entryPrice": current_price,  # Approximate entry price (actual may differ once keeper fills)
            "slSet": sl_set_success,
            "slError": sl_error,
            "result": {
                "market": market,
                "side": side,
                "collateral": position_size,
                "leverage": leverage,
                "actualTradeIndex": actual_trade_index,
                "entryPrice": current_price,
                "slConfigured": sl_set_success,
                "tpConfigured": False,
            }
        })
    
    except Exception as e:
        logger.error(f"Open position error: {str(e)}")
        try:
            import traceback as tb
            logger.error(tb.format_exc())
        except:
            logger.error("Could not format traceback")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/close-position', methods=['POST'])
def close_position():
    """
    Close a position (idempotent)
    Body (Format 1 - Agent):
    {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "market": "BTC",
        "tradeId": "12345"  # Optional
    }
    Body (Format 2 - Legacy):
    {
        "privateKey": "0x...",
        "market": "BTC-USD",
        "useDelegation": false,
        "userAddress": "0x..."
    }
    """
    print("[CLOSE] ========== close_position() called ==========")
    try:
        data = request.json
        print(f"[CLOSE] Request data: {data}")
        
        # Support both agentAddress and privateKey formats
        agent_address = data.get('agentAddress')
        private_key = data.get('privateKey')
        
        # If agentAddress is provided, look up agent's private key from database
        if agent_address:
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
                import sys
                sys.path.insert(0, os.path.dirname(__file__))
                from encryption_helper import decrypt_private_key
                
                database_url = os.getenv('DATABASE_URL')
                if not database_url:
                    return jsonify({
                        "success": False,
                        "error": "DATABASE_URL not configured"
                    }), 500
                
                conn = psycopg2.connect(database_url)
                cur = conn.cursor(cursor_factory=RealDictCursor)
                
                # Try user_agent_addresses first (new system)
                cur.execute(
                    """
                    SELECT 
                        ostium_agent_key_encrypted,
                        ostium_agent_key_iv,
                        ostium_agent_key_tag
                    FROM user_agent_addresses 
                    WHERE LOWER(ostium_agent_address) = LOWER(%s)
                    """,
                    (agent_address,)
                )
                user_address_row = cur.fetchone()
                
                if user_address_row and user_address_row['ostium_agent_key_encrypted']:
                    # Decrypt the private key
                    try:
                        private_key = decrypt_private_key(
                            user_address_row['ostium_agent_key_encrypted'],
                            user_address_row['ostium_agent_key_iv'],
                            user_address_row['ostium_agent_key_tag']
                        )
                        logger.info(f"✅ Found and decrypted agent key for {agent_address} from user_agent_addresses")
                    except Exception as decrypt_error:
                        logger.error(f"Failed to decrypt key: {decrypt_error}")
                        cur.close()
                        conn.close()
                        return jsonify({
                            "success": False,
                            "error": f"Failed to decrypt agent key: {str(decrypt_error)}"
                        }), 500
                else:
                    # Fallback to wallet_pool (legacy)
                    cur.execute(
                        "SELECT private_key FROM wallet_pool WHERE LOWER(address) = LOWER(%s)",
                        (agent_address,)
                    )
                    wallet = cur.fetchone()
                    
                    if not wallet:
                        cur.close()
                        conn.close()
                        return jsonify({
                            "success": False,
                            "error": f"Agent address {agent_address} not found in user_agent_addresses or wallet_pool"
                        }), 404
                    
                    private_key = wallet['private_key']
                    logger.info(f"Found agent key for {agent_address} in wallet_pool (legacy)")
                
                cur.close()
                conn.close()
                use_delegation = True
                
            except Exception as e:
                logger.error(f"Error fetching agent key: {e}")
                logger.error(traceback.format_exc())
                return jsonify({
                    "success": False,
                    "error": f"Failed to fetch agent key: {str(e)}"
                }), 500
        else:
            use_delegation = data.get('useDelegation', False)
        
        market = data.get('market')
        trade_id = data.get('tradeId')
        user_address = data.get('userAddress')
        
        if not all([private_key, market]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentAddress/privateKey, market"
            }), 400
        
        # Get SDK
        sdk = get_sdk(private_key, use_delegation)
        
        # Check if position exists
        # CRITICAL: Web3.py requires checksummed addresses
        if use_delegation and user_address:
            try:
                address_to_check = Web3.to_checksum_address(user_address)
            except Exception as e:
                logger.error(f"Invalid user_address format: {user_address}, error: {e}")
                return jsonify({
                    "success": False,
                    "error": f"Invalid userAddress format: {user_address}"
                }), 400
        else:
            address_to_check = sdk.ostium.get_public_address()
        
        # get_open_trades is async, need to run it
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(sdk.get_open_trades(trader_address=address_to_check))
        loop.close()
        
        # Parse result - SDK returns tuple (trades_list, trader_address)
        open_trades = []
        if isinstance(result, tuple) and len(result) > 0:
            open_trades = result[0] if isinstance(result[0], list) else []
        
        # Find matching trade (by tradeId if provided, or by market)
        trade_to_close = None
        logger.info(f"Looking for trade - market: {market}, tradeId: {trade_id}")
        logger.info(f"Total open trades found: {len(open_trades)}")
        
        for trade in open_trades:
            # Log each trade for debugging
            trade_id_field = trade.get('tradeID', trade.get('index'))
            logger.info(f"Checking trade: {trade_id_field}, keys: {list(trade.keys())}")
            
            # Match by tradeId if provided (primary method)
            if trade_id and str(trade_id_field) == str(trade_id):
                trade_to_close = trade
                logger.info(f"Matched by tradeId: {trade_id}")
                break
            # Otherwise match by market symbol
            pair_info = trade.get('pair', {})
            market_symbol = pair_info.get('from', '')
            if market_symbol.upper() == market.upper():
                trade_to_close = trade
                logger.info(f"Matched by market: {market}")
                break
        
        # Idempotency: if no position, return success
        if not trade_to_close:
            logger.info(f"No open position for {market} - already closed")
            return jsonify({
                "success": True,
                "message": "No open position to close",
                "closePnl": 0
            })
        
        # CRITICAL FIX: Use stored trade index if available
        # Check if actualTradeIndex was provided in request (from database)
        stored_trade_index = data.get('actualTradeIndex')
        
        # Also try to get from database if tradeId is provided
        if not stored_trade_index and trade_id:
            try:
                conn = psycopg2.connect(database_url)
                cur = conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(
                    """
                    SELECT ostium_trade_index FROM positions 
                    WHERE ostium_trade_id = %s
                    AND venue = 'OSTIUM'
                    AND status = 'OPEN'
                    LIMIT 1
                    """,
                    (str(trade_id),)
                )
                db_position = cur.fetchone()
                cur.close()
                conn.close()
                
                if db_position and db_position.get('ostium_trade_index') is not None:
                    stored_trade_index = db_position['ostium_trade_index']
                    logger.info(f"📦 Found stored trade index in DB: {stored_trade_index}")
            except Exception as db_err:
                logger.warning(f"Could not query DB for stored index: {db_err}")
                logger.warning(traceback.format_exc())
        
        # Use stored index if available, otherwise fallback to 0
        if stored_trade_index is not None:
            trade_index = int(stored_trade_index)
            logger.info(f"✅ Using STORED trade index: {trade_index} (from database/request)")
        else:
            trade_index = 0
            logger.warning(f"⚠️  No stored index found, using index=0 (may close wrong position!)")
            logger.warning(f"   This works ONLY if there's ONE position per market per user")
        
        # Look up pair_index from venue_markets table using token symbol
        try:
            conn = psycopg2.connect(database_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                """
                SELECT market_index FROM venue_markets 
                WHERE venue = 'OSTIUM' 
                AND UPPER(token_symbol) = UPPER(%s)
                AND is_active = true
                LIMIT 1
                """,
                (market,)
            )
            market_data = cur.fetchone()
            cur.close()
            conn.close()
            
            if market_data:
                pair_index = market_data['market_index']
                logger.info(f"Found pair_index for {market} from venue_markets table: {pair_index}")
            else:
                # Fallback: try to get from trade data
                pair_info = trade_to_close.get('pair', {})
                if isinstance(pair_info, dict):
                    pair_id_str = pair_info.get('id')
                    pair_index = int(pair_id_str) if pair_id_str else None
                    logger.warning(f"Market {market} not in venue_markets, using trade data: {pair_index}")
                else:
                    pair_index = None
                    logger.error(f"Could not find pair_index for {market}")
        except Exception as e:
            logger.error(f"Error querying venue_markets: {e}")
            # Fallback to trade data
            pair_info = trade_to_close.get('pair', {})
            if isinstance(pair_info, dict):
                pair_id_str = pair_info.get('id')
                pair_index = int(pair_id_str) if pair_id_str else None
            else:
                pair_index = None
        
        target_trade_id = trade_to_close.get('tradeID')
        target_trade_index = trade_to_close.get('index', 0)
        
        # Use stored trade index if provided in request (from database), otherwise use from trade data
        if stored_trade_index is not None:
            trade_index = int(stored_trade_index)
            logger.info(f"🎯 Using STORED trade index: {trade_index}")
        elif target_trade_index is not None:
            trade_index = int(target_trade_index)
            logger.info(f"🎯 Using trade index from Ostium: {trade_index}")
        else:
            trade_index = 0
            logger.warning(f"⚠️ No trade index available, using 0 as fallback (risky!)")
        
        logger.info(f"🎯 Closing tradeID {target_trade_id} for {market} using index={trade_index}")
        
        # Validate required fields
        if pair_index is None:
            logger.error(f"Missing pairIndex. Pair object: {pair_info}")
            return jsonify({
                "success": False,
                "error": f"Pair index not found. Pair object: {pair_info}"
            }), 400
        
        logger.info(f"Closing position: {market} (trade_index: {trade_index}, pair_index: {pair_index})")
        
        # Get current market price (use entry price as default)
        # TODO: Fetch real-time price from oracle
        open_price_raw = trade_to_close.get('openPrice')
        logger.info(f"openPrice from trade: {open_price_raw}")
        
        # Calculate price safely
        if open_price_raw is not None and open_price_raw != 0:
            try:
                current_price = float(int(open_price_raw) / 1e18)
            except (TypeError, ValueError) as e:
                logger.warning(f"Could not parse openPrice: {e}, using default")
                current_price = 100.0
        else:
            # Fallback: use reasonable default for the market
            price_defaults = {
                'BTC': 90000.0, 'ETH': 3000.0, 'SOL': 200.0,
                'ADA': 0.5, 'XRP': 2.5, 'HYPE': 40.0
            }
            current_price = price_defaults.get(market.upper(), 100.0)
            logger.info(f"Using default price for {market}: ${current_price}")
        
        logger.info(f"Closing trade at approx price: ${current_price}")
        
        # Close trade - for delegation, pass trader_address like we do for opening
        print(f"[CLOSE] Calling close_trade: trade_index={trade_index}, pair_id={pair_index}, price={current_price}")
        logger.info(f"Calling close_trade: trade_index={trade_index}, pair_id={pair_index}, price={current_price}")
        
        try:
            if use_delegation:
                # CRITICAL: Web3.py requires checksummed addresses
                if not user_address:
                    raise ValueError("userAddress is required for delegation")
                try:
                    checksummed_user_address = Web3.to_checksum_address(user_address)
                except Exception as e:
                    logger.error(f"Invalid user_address format: {user_address}, error: {e}")
                    raise ValueError(f"Invalid userAddress format: {user_address}")
                
                print(f"[CLOSE] Using delegation - closing on behalf of {checksummed_user_address}")
                logger.info(f"Using delegation - closing on behalf of {checksummed_user_address}")
                result = sdk.ostium.close_trade(
                    trade_index=trade_index,
                    market_price=current_price,
                    pair_id=pair_index,
                    trader_address=checksummed_user_address  # THIS IS THE KEY! Must be checksummed
                )
            else:
                print("[CLOSE] Direct close (no delegation)")
                logger.info("Direct close (no delegation)")
                result = sdk.ostium.close_trade(
                    trade_index=trade_index,
                    market_price=current_price,
                    pair_id=pair_index
                )
            
            # Log what SDK actually returns
            print(f"[CLOSE] ✅ SDK close_trade returned")
            print(f"[CLOSE]    Returned: {result}")
            print(f"[CLOSE]    Type: {type(result)}")
            logger.info(f"SDK close_trade returned: {result} (type: {type(result)})")
            
            # Check if result is an error tuple (SDK returns error instead of raising exception)
            if isinstance(result, tuple) and len(result) >= 2:
                error_hex = str(result[0]) if result[0] else ""
                if error_hex.startswith('0xf77a8069'):
                    # This is "NoOpenPosition" or "PositionAlreadyClosed" error
                    logger.error(f"❌ Position already closed or doesn't exist (error: {error_hex})")
                    logger.error(f"   This is normal if position was closed externally")
                    return jsonify({
                        "success": True,  # Treat as success (idempotent)
                        "message": "Position already closed (idempotent)",
                        "closePnl": 0,
                        "alreadyClosed": True
                    })
                else:
                    # Other contract error
                    logger.error(f"❌ Contract error: {result}")
                    return jsonify({
                        "success": False,
                        "error": f"Contract error: {error_hex}",
                        "raw_error": str(result)
                    }), 400
            
            # Check if result is None or empty
            if not result:
                print(f"[CLOSE] ❌ SDK returned empty result! Position might not be closeable yet.")
                logger.error(f"❌ SDK returned empty result! Position might not be closeable yet.")
                return jsonify({
                    "success": True,  # Treat as success (might be already closed)
                    "message": "No result from SDK (position might be closed)",
                    "closePnl": 0
                })
                
        except Exception as sdk_error:
            # Use traceback module (imported at top) - ensure it's available
            import traceback as tb_module
            from web3.exceptions import ContractCustomError, Web3RPCError
            
            print(f"[CLOSE] ❌ SDK close_trade FAILED: {sdk_error}")
            print(f"[CLOSE]    Error type: {type(sdk_error)}")
            try:
                print(f"[CLOSE]    Traceback: {tb_module.format_exc()}")
            except Exception as tb_err:
                print(f"[CLOSE]    Could not format traceback: {tb_err}")
            logger.error(f"❌ SDK close_trade FAILED: {sdk_error}")
            logger.error(f"   Error type: {type(sdk_error)}")
            try:
                logger.error(tb_module.format_exc())
            except Exception as tb_err:
                logger.error(f"Could not format traceback: {tb_err}")
            
            # Check for different error types
            error_str = str(sdk_error)
            error_message = ''
            
            # Try to extract error message if it's a Web3RPCError
            if isinstance(sdk_error, Web3RPCError):
                try:
                    if sdk_error.args and len(sdk_error.args) > 0:
                        error_data = sdk_error.args[0]
                        if isinstance(error_data, dict):
                            error_message = error_data.get('message', '')
                        else:
                            error_message = str(error_data)
                except:
                    error_message = error_str
            
            # Check if this is insufficient funds error
            is_insufficient_funds = False
            if isinstance(sdk_error, Web3RPCError):
                if 'insufficient funds' in error_str.lower() or 'insufficient funds' in error_message.lower():
                    is_insufficient_funds = True
            
            # Check if this is a ContractCustomError with 0xf77a8069 (NoOpenPosition/PositionAlreadyClosed)
            is_position_closed_error = False
            
            if isinstance(sdk_error, ContractCustomError):
                # ContractCustomError has args that contain the error data
                error_args = getattr(sdk_error, 'args', [])
                if error_args:
                    # Check if any arg contains the error code
                    for arg in error_args:
                        arg_str = str(arg)
                        if '0xf77a8069' in arg_str:
                            is_position_closed_error = True
                            break
            else:
                # For other exceptions, check the string representation
                if '0xf77a8069' in error_str:
                    is_position_closed_error = True
            
            # Handle insufficient funds error FIRST (before position closed check)
            if is_insufficient_funds:
                logger.error(f"❌ Insufficient ETH for gas on agent address: {agent_address}")
                logger.error(f"   Agent needs more ETH to pay for transaction gas")
                logger.error(f"   Error: {error_message or error_str}")
                return jsonify({
                    "success": False,
                    "error": "Insufficient ETH for gas. Agent address needs more ETH to execute the transaction.",
                    "agentAddress": agent_address,
                    "errorCode": "INSUFFICIENT_GAS",
                    "details": error_message or error_str,
                    "solution": "Fund the agent address with more ETH (at least 0.0001 ETH recommended)"
                }), 400
            
            # Handle position already closed error
            if is_position_closed_error:
                # This is "NoOpenPosition" or "PositionAlreadyClosed" error
                logger.info(f"✅ Position already closed or doesn't exist (error code: 0xf77a8069)")
                logger.info(f"   This is normal if position was closed externally or doesn't exist")
                return jsonify({
                    "success": True,  # Treat as success (idempotent)
                    "message": "Position already closed or doesn't exist (idempotent)",
                    "closePnl": 0,
                    "alreadyClosed": True
                })
            
            # Re-raise other errors to be caught by outer exception handler
            raise
        
        # Note: APR calculator worker will sync accurate PnL from subgraph later
        realized_pnl = float(trade_to_close.get('pnl', 0))
        
        # Extract tx hash - SDK might return dict or receipt object
        tx_hash = ''
        if isinstance(result, dict):
            tx_hash = result.get('transactionHash', result.get('hash', ''))
        elif hasattr(result, 'transactionHash'):
            tx_hash = result.transactionHash
        elif hasattr(result, 'hash'):
            tx_hash = result.hash
        
        logger.info(f"✅ Position closed: PnL = ${realized_pnl:.2f}, TX: {tx_hash}")
        
        return jsonify({
            "success": True,
            "result": {
                "txHash": tx_hash,
                "market": market,
                "closePnl": realized_pnl
            },
            "closePnl": realized_pnl
        })
    
    except Exception as e:
        logger.error(f"Close position error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/transfer', methods=['POST'])
def transfer_usdc():
    """
    Transfer USDC (for profit share collection)
    Body: {
        "agentPrivateKey": "0x...",   # Agent's key
        "toAddress": "0x...",          # Platform wallet
        "amount": 10.5,                # USDC amount
        "vaultAddress": "0x..."        # User's address (if delegation)
    }
    """
    try:
        data = request.json
        agent_key = data.get('agentPrivateKey')
        to_address = data.get('toAddress')
        amount = float(data.get('amount'))
        vault_address = data.get('vaultAddress')  # User's wallet for delegation
        
        if not all([agent_key, to_address, amount]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentPrivateKey, toAddress, amount"
            }), 400
        
        # Get SDK with delegation if vault_address provided
        use_delegation = vault_address is not None
        sdk = get_sdk(agent_key, use_delegation)
        
        logger.info(f"Transferring {amount} USDC to {to_address}")
        if vault_address:
            logger.info(f"   From user: {vault_address} (via delegation)")
        
        # Execute transfer (withdraw to platform wallet)
        result = sdk.ostium.withdraw(
            amount=amount,
            receiving_address=to_address
        )
        
        logger.info(f"✅ Transfer complete: {result.get('transactionHash')}")
        
        return jsonify({
            "success": True,
            "result": {
                "txHash": result.get('transactionHash', ''),
                "amount": amount,
                "to": to_address
            }
        })
    
    except Exception as e:
        logger.error(f"Transfer error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/order-by-id', methods=['POST'])
def get_order_by_id():
    """
    Fetch a single order (open or close) by order ID from the subgraph.
    Body: { "orderId": "12345" }
    """
    try:
        data = request.json
        order_id = data.get('orderId')

        if not order_id:
            return jsonify({"success": False, "error": "orderId is required"}), 400

        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        dummy_key = '0x' + '0' * 64
        sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)

        order = asyncio.run(sdk.subgraph.get_order_by_id(order_id))

        return jsonify({
            "success": True,
            "order": order[0] if isinstance(order, list) and len(order) > 0 else order
        })
    except Exception as e:
        logger.error(f"get_order_by_id error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/approve-agent', methods=['POST'])
def approve_agent():
    """
    User approves agent to trade on their behalf
    Body: {
        "userPrivateKey": "0x...",  # User's key
        "agentAddress": "0x..."      # Agent to approve
    }
    """
    try:
        data = request.json
        user_key = data.get('userPrivateKey')
        agent_address = data.get('agentAddress')
        
        if not all([user_key, agent_address]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: userPrivateKey, agentAddress"
            }), 400
        
        # User SDK (no delegation)
        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        sdk = OstiumSDK(
            network=network,
            private_key=user_key,
            rpc_url=OSTIUM_RPC_URL
        )
        
        logger.info(f"User approving agent: {agent_address}")
        
        # Call setDelegate on the Ostium Trading contract
        trading_contract = sdk.ostium.ostium_trading_contract
        web3 = sdk.ostium.web3
        
        # Get user account
        user_account = web3.eth.account.from_key(user_key)
        
        # CRITICAL: Web3.py requires checksummed addresses
        try:
            checksummed_agent_address = Web3.to_checksum_address(agent_address)
        except Exception as e:
            logger.error(f"Invalid agent_address format: {agent_address}, error: {e}")
            return jsonify({
                "success": False,
                "error": f"Invalid agentAddress format: {agent_address}"
            }), 400
        
        # Build the transaction
        tx = trading_contract.functions.setDelegate(checksummed_agent_address).build_transaction({
            'from': user_account.address,
            'nonce': web3.eth.get_transaction_count(user_account.address),
            'gas': 200000,
            'gasPrice': web3.eth.gas_price,
        })
        
        # Sign the transaction
        signed_tx = web3.eth.account.sign_transaction(tx, user_key)
        
        # Send the transaction
        tx_hash = web3.eth.send_raw_transaction(signed_tx.rawTransaction)
        
        # Wait for receipt
        logger.info(f"Transaction sent: {tx_hash.hex()}")
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt['status'] == 1:
            logger.info(f"✅ Agent approved! Tx hash: {tx_hash.hex()}")
            
            return jsonify({
                "success": True,
                "message": "Agent approved successfully on Ostium smart contracts",
                "agentAddress": agent_address,
                "transactionHash": tx_hash.hex(),
                "blockNumber": receipt['blockNumber'],
                "gasUsed": receipt['gasUsed']
            })
        else:
            logger.error(f"Transaction failed: {tx_hash.hex()}")
            return jsonify({
                "success": False,
                "error": "Transaction reverted",
                "transactionHash": tx_hash.hex()
            }), 500
    
    except Exception as e:
        logger.error(f"Approval error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/faucet', methods=['POST'])
def request_faucet():
    """
    Request testnet USDC from faucet
    Body: { "address": "0x..." }
    """
    try:
        data = request.json
        address = data.get('address')
        
        if not address:
            return jsonify({"success": False, "error": "Missing address"}), 400
        
        if not OSTIUM_TESTNET:
            return jsonify({
                "success": False,
                "error": "Faucet only available on testnet"
            }), 400
        
        # Create SDK for faucet access
        network = NetworkConfig.testnet()
        sdk = OstiumSDK(network=network, rpc_url=OSTIUM_RPC_URL)
        
        # Check if can request
        if not sdk.faucet.can_request_tokens(address):
            next_time = sdk.faucet.get_next_request_time(address)
            return jsonify({
                "success": False,
                "error": f"Cannot request yet. Next request at: {next_time}"
            }), 400
        
        # Get amount
        amount = sdk.faucet.get_token_amount()
        
        # Request tokens
        receipt = sdk.faucet.request_tokens()
        
        logger.info(f"Faucet: {amount} USDC sent to {address}")
        
        return jsonify({
            "success": True,
            "amount": str(amount),
            "txHash": receipt.get('transactionHash', '').hex()
        })
    
    except Exception as e:
        logger.error(f"Faucet error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/market-info', methods=['GET'])
def get_market_info():
    """Get available trading pairs and market info"""
    try:
        network = NetworkConfig.testnet() if OSTIUM_TESTNET else NetworkConfig.mainnet()
        sdk = OstiumSDK(network=network, rpc_url=OSTIUM_RPC_URL)
        
        # Get available pairs
        pairs = sdk.get_formatted_pairs_details()
        
        return jsonify({
            "success": True,
            "pairs": pairs
        })
    
    except Exception as e:
        logger.error(f"Market info error: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500




@app.route('/available-markets', methods=['GET'])
def available_markets():
    """
    Get list of available trading markets
    GET /available-markets?refresh=true (optional: refresh cache)
    Returns: { "success": true, "markets": { "BTC": {...}, "ETH": {...}, ... }, "count": 3 }
    """
    try:
        refresh = request.args.get('refresh', 'false').lower() == 'true'
        markets = get_available_markets(refresh=refresh)
        return jsonify({
            "success": True,
            "markets": markets,
            "count": len(markets)
        })
    except Exception as e:
        logger.error(f"Failed to fetch markets: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/validate-market', methods=['POST'])
def validate_market_endpoint():
    """
    Validate if a specific market is available
    Body: { "market": "BTC" }
    Returns: { "success": true, "market": "BTC", "isAvailable": true, "marketName": "BTC/USD", "assetIndex": 0 }
    """
    try:
        data = request.json
        market = data.get('market', '').upper()
        
        if not market:
            return jsonify({"success": False, "error": "Missing market parameter"}), 400
        
        asset_index, is_available, market_name = validate_market(market)
        
        return jsonify({
            "success": True,
            "market": market,
            "isAvailable": is_available,
            "marketName": market_name,
            "assetIndex": asset_index
        })
    except Exception as e:
        logger.error(f"Market validation error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/history', methods=['POST'])
def get_history():
    """
    Get raw trading history for an address from Ostium subgraph
    Body: { "address": "0x...", "count": 50 }
    Returns raw history data without filtering (includes open, close, cancelled orders, etc.)
    """
    try:
        data = request.json
        address = data.get('address')
        count = int(data.get('count', 50))
        
        if not address:
            return jsonify({"success": False, "error": "Missing address"}), 400
        
        address = address.lower()
        
        dummy_key = '0x' + '1' * 64
        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
        
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        history = loop.run_until_complete(
            sdk.subgraph.get_recent_history(trader=address, last_n_orders=count)
        )
        loop.close()
        
        if not history:
            logger.info(f"No history found for {address}")
            return jsonify({
                "success": True,
                "history": [],
                "count": 0
            })
        
        logger.info(f"Found {len(history)} orders in history for {address}")
        
        return jsonify({
            "success": True,
            "history": history,
            "count": len(history)
        })
    
    except Exception as e:
        logger.error(f"Get history error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/closed-positions', methods=['POST'])
def get_closed_positions():
    """
    Get closed position history for an address from Ostium subgraph
    Body: { "address": "0x...", "count": 50 }
    Returns closed positions with PnL information
    """
    try:
        data = request.json
        address = data.get('address')
        count = int(data.get('count', 50))
        
        if not address:
            return jsonify({"success": False, "error": "Missing address"}), 400
        
        address = address.lower()
        
        dummy_key = '0x' + '1' * 64
        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
        
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        history = loop.run_until_complete(
            sdk.subgraph.get_recent_history(trader=address, last_n_orders=count)
        )
        loop.close()
        
        if not history:
            logger.info(f"No history found for {address}")
            return jsonify({
                "success": True,
                "positions": [],
                "count": 0
            })
        
        # Filter to only closed trades (Close, TakeProfit, StopLoss, Liquidation)
        close_actions = {'close', 'takeprofit', 'stoploss', 'liquidation'}
        
        closed_positions = []
        for item in history:
            order_action = item.get('orderAction', '').lower()
            
            pair_info = item.get('pair', {})
            pair_from = pair_info.get('from', 'UNKNOWN')
            pair_to = pair_info.get('to', 'USD')
            
            collateral_raw = item.get('collateral', 0)
            collateral_usdc = float(int(collateral_raw)) / 1e6 if collateral_raw else 0
            
            amount_sent_raw = item.get('amountSentToTrader', 0)
            amount_sent = float(int(amount_sent_raw)) / 1e6 if amount_sent_raw else 0
            
            price_raw = item.get('price', 0)
            price = float(int(price_raw)) / 1e18 if price_raw else 0
            
            leverage_raw = item.get('leverage', 0)
            leverage = int(float(leverage_raw)) // 100 if leverage_raw else 0
            
            profit_percent_raw = item.get('profitPercent', 0)
            profit_percent = float(int(profit_percent_raw)) / 1e6 if profit_percent_raw else 0
            
            total_profit_percent_raw = item.get('totalProfitPercent', 0)
            total_profit_percent = float(int(total_profit_percent_raw)) / 1e6 if total_profit_percent_raw else 0
            
            pnl_usdc = amount_sent - collateral_usdc if order_action in close_actions else 0
            
            # Fees (scaled by 10^6)
            rollover_fee_raw = item.get('rolloverFee', 0)
            rollover_fee = float(int(rollover_fee_raw)) / 1e6 if rollover_fee_raw else 0
            
            funding_fee_raw = item.get('fundingFee', 0)
            funding_fee = float(int(funding_fee_raw)) / 1e6 if funding_fee_raw else 0
            
            position = {
                "market": pair_from.upper(),
                "marketFull": f"{pair_from}/{pair_to}",
                "side": "long" if item.get('isBuy') else "short",
                "orderAction": item.get('orderAction', 'Unknown'),
                "collateral": collateral_usdc,
                "leverage": leverage,
                "price": price,
                "amountSentToTrader": amount_sent,
                "pnlUsdc": pnl_usdc,
                "profitPercent": profit_percent,
                "totalProfitPercent": total_profit_percent,
                "rolloverFee": rollover_fee,
                "fundingFee": funding_fee,
                "executedAt": item.get('executedAt'),
                "executedTx": item.get('executedTx', ''),
                "tradeId": item.get('id', ''),
                "tradeIndex": item.get('index'),
                "isCancelled": item.get('isCancelled', False),
                "cancelReason": item.get('cancelReason', ''),
            }
            
            closed_positions.append(position)
        
        logger.info(f"Found {len(closed_positions)} positions in history for {address}")
        
        return jsonify({
            "success": True,
            "positions": closed_positions,
            "count": len(closed_positions),
            "totalOrders": len(history)
        })
    
    except Exception as e:
        logger.error(f"Get closed positions error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/set-stop-loss', methods=['POST'])
def set_stop_loss():
    """
    Set stop-loss with liquidation price validation
    Body: {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "market": "BTC",
        "tradeIndex": 2,
        "stopLossPercent": 0.10,
        "currentPrice": 90000,
        "pairIndex": 0,
        "useDelegation": true
    }
    """
    try:
        data = request.json
        agent_address = data.get('agentAddress')
        user_address = data.get('userAddress')
        market = data.get('market')
        trade_index = data.get('tradeIndex')
        stop_loss_percent = float(data.get('stopLossPercent', 0.10))
        current_price = float(data.get('currentPrice'))
        pair_index = data.get('pairIndex')
        use_delegation = data.get('useDelegation', True)
        
        if not all([agent_address, user_address, market, trade_index is not None, current_price, pair_index is not None]):
            return jsonify({
                "success": False,
                "error": "Missing required fields"
            }), 400
        
        logger.info(f"Setting SL for {market} (trade_index={trade_index}, pair_index={pair_index})")
        logger.info(f"   User: {user_address}, Agent: {agent_address}")
        logger.info(f"   SL%: {stop_loss_percent * 100:.1f}%, Current Price: ${current_price:.4f}")
        
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            import sys
            sys.path.insert(0, os.path.dirname(__file__))
            from encryption_helper import decrypt_private_key
            
            database_url = os.getenv('DATABASE_URL')
            if not database_url:
                return jsonify({"success": False, "error": "DATABASE_URL not configured"}), 500
            
            conn = psycopg2.connect(database_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            cur.execute(
                """
                SELECT 
                    ostium_agent_key_encrypted,
                    ostium_agent_key_iv,
                    ostium_agent_key_tag
                FROM user_agent_addresses 
                WHERE LOWER(ostium_agent_address) = LOWER(%s)
                """,
                (agent_address,)
            )
            user_address_row = cur.fetchone()
            
            if not user_address_row or not user_address_row['ostium_agent_key_encrypted']:
                cur.close()
                conn.close()
                return jsonify({"success": False, "error": f"Agent address {agent_address} not found"}), 404
            
            private_key = decrypt_private_key(
                user_address_row['ostium_agent_key_encrypted'],
                user_address_row['ostium_agent_key_iv'],
                user_address_row['ostium_agent_key_tag']
            )
            cur.close()
            conn.close()
            
        except Exception as e:
            logger.error(f"Error fetching agent key: {e}")
            return jsonify({"success": False, "error": f"Failed to fetch agent key: {str(e)}"}), 500
        
        sdk = get_sdk(private_key, use_delegation)
        
        liquidation_price = None
        try:
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            checksummed_user = Web3.to_checksum_address(user_address)
            logger.info(f"   Querying liquidation price for user: {checksummed_user}")
            
            metrics = loop.run_until_complete(
                sdk.get_open_trade_metrics(pair_index, trade_index, trader_address=checksummed_user)
            )
            loop.close()
            
            liquidation_price = metrics.get('liquidation_price')
            if liquidation_price:
                logger.info(f"   Liquidation Price: ${liquidation_price:.4f}")
            else:
                logger.warning(f"   ⚠️  Liquidation price not available from SDK")
        except Exception as liq_error:
            logger.warning(f"   ⚠️  Could not fetch liquidation price: {liq_error}")
            logger.warning(f"   Proceeding with SL calculation without validation")
        
        is_long = data.get('side', 'long').lower() == 'long'
        sl_price = current_price * (1 - stop_loss_percent) if is_long else current_price * (1 + stop_loss_percent)
        
        logger.info(f"   Initial SL: ${sl_price:.4f} ({stop_loss_percent * 100:.1f}%)")
        
        if liquidation_price:
            LIQUIDATION_BUFFER = 0.02
            
            if is_long:
                min_safe_sl = liquidation_price * (1 + LIQUIDATION_BUFFER)
                if sl_price < min_safe_sl:
                    logger.warning(f"   ⚠️  SL ${sl_price:.4f} too close to liq ${liquidation_price:.4f}")
                    sl_price = min_safe_sl
                    adjusted_percent = ((current_price - sl_price) / current_price) * 100
                    logger.info(f"   ✅ Adjusted SL: ${sl_price:.4f} ({adjusted_percent:.1f}% below entry, 2% above liq)")
            else:
                max_safe_sl = liquidation_price * (1 - LIQUIDATION_BUFFER)
                if sl_price > max_safe_sl:
                    logger.warning(f"   ⚠️  SL ${sl_price:.4f} too close to liq ${liquidation_price:.4f}")
                    sl_price = max_safe_sl
                    adjusted_percent = ((sl_price - current_price) / current_price) * 100
                    logger.info(f"   ✅ Adjusted SL: ${sl_price:.4f} ({adjusted_percent:.1f}% above entry, 2% below liq)")
        
        logger.info(f"   Setting SL: ${sl_price:.4f}")
        
        try:
            if use_delegation:
                checksummed_user = Web3.to_checksum_address(user_address)
                sdk.ostium.update_sl(pair_index, trade_index, sl_price, checksummed_user)
            else:
                sdk.ostium.update_sl(pair_index, trade_index, sl_price)
            
            logger.info(f"   ✅ SL set successfully")
            
            return jsonify({
                "success": True,
                "message": f"SL set to ${sl_price:.4f}",
                "slPrice": sl_price,
                "liquidationPrice": liquidation_price,
                "adjusted": liquidation_price and abs(sl_price - (current_price * (1 - stop_loss_percent if is_long else 1 + stop_loss_percent))) > 0.01
            })
            
        except Exception as sl_error:
            logger.error(f"   ❌ Failed to set SL: {sl_error}")
            return jsonify({
                "success": False,
                "error": str(sl_error)
            }), 500
    
    except Exception as e:
        logger.error(f"Set SL error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/set-take-profit', methods=['POST'])
def set_take_profit():
    """
    Set protocol-level take-profit for an existing trade
    Body: {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "market": "BTC",
        "tradeIndex": 2,
        "takeProfitPercent": 0.30,
        "entryPrice": 90000,  # Entry price of the position (required for TP calculation)
        "pairIndex": 0,
        "side": "long",
        "useDelegation": true
    }
    """
    try:
        data = request.json
        agent_address = data.get('agentAddress')
        user_address = data.get('userAddress')
        market = data.get('market')
        trade_index = data.get('tradeIndex')
        take_profit_percent = float(data.get('takeProfitPercent', 0.30))
        entry_price = float(data.get('entryPrice'))  # Use entry price, not current price
        pair_index = data.get('pairIndex')
        use_delegation = data.get('useDelegation', True)
        
        if not all([agent_address, user_address, market, trade_index is not None, entry_price, pair_index is not None]):
            return jsonify({
                "success": False,
                "error": "Missing required fields (entryPrice is required for TP calculation)"
            }), 400
        
        logger.info(f"Setting TP for {market} (trade_index={trade_index}, pair_index={pair_index})")
        logger.info(f"   User: {user_address}, Agent: {agent_address}")
        logger.info(f"   TP%: {take_profit_percent * 100:.1f}%, Entry Price: ${entry_price:.4f}")
        
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            import sys
            sys.path.insert(0, os.path.dirname(__file__))
            from encryption_helper import decrypt_private_key
            
            database_url = os.getenv('DATABASE_URL')
            if not database_url:
                return jsonify({"success": False, "error": "DATABASE_URL not configured"}), 500
            
            conn = psycopg2.connect(database_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            
            cur.execute(
                """
                SELECT 
                    ostium_agent_key_encrypted,
                    ostium_agent_key_iv,
                    ostium_agent_key_tag
                FROM user_agent_addresses 
                WHERE LOWER(ostium_agent_address) = LOWER(%s)
                """,
                (agent_address,)
            )
            user_address_row = cur.fetchone()
            
            if not user_address_row or not user_address_row['ostium_agent_key_encrypted']:
                cur.close()
                conn.close()
                return jsonify({"success": False, "error": f"Agent address {agent_address} not found"}), 404
            
            private_key = decrypt_private_key(
                user_address_row['ostium_agent_key_encrypted'],
                user_address_row['ostium_agent_key_iv'],
                user_address_row['ostium_agent_key_tag']
            )
            cur.close()
            conn.close()
            
        except Exception as e:
            logger.error(f"Error fetching agent key: {e}")
            return jsonify({"success": False, "error": f"Failed to fetch agent key: {str(e)}"}), 500
        
        sdk = get_sdk(private_key, use_delegation)
        
        is_long = data.get('side', 'long').lower() == 'long'
        # TP should be calculated from entry price to lock in profits from entry point
        tp_price = entry_price * (1 + take_profit_percent) if is_long else entry_price * (1 - take_profit_percent)
        
        logger.info(f"   Entry: ${entry_price:.4f} → TP: ${tp_price:.4f} ({take_profit_percent * 100:.1f}% {'above' if is_long else 'below'} entry)")
        
        try:
            if use_delegation:
                checksummed_user = Web3.to_checksum_address(user_address)
                sdk.ostium.update_tp(pair_index, trade_index, tp_price, checksummed_user)
            else:
                sdk.ostium.update_tp(pair_index, trade_index, tp_price)
            
            logger.info(f"   ✅ TP set successfully")
            
            return jsonify({
                "success": True,
                "message": f"TP set to ${tp_price:.4f}",
                "tpPrice": tp_price
            })
            
        except Exception as tp_error:
            logger.error(f"   ❌ Failed to set TP: {tp_error}")
            return jsonify({
                "success": False,
                "error": str(tp_error)
            }), 500
    
    except Exception as e:
        logger.error(f"Set TP error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/price/<token>', methods=['GET'])
def get_price(token):
    """
    Get current market price for a token from Ostium price feed
    Example: GET /price/BTC
    """
    try:
        logger.info(f"Getting price for {token}")
        
        # Create SDK instance for price feed access
        dummy_key = '0x' + '1' * 64
        network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
        sdk = OstiumSDK(network=network, private_key=dummy_key, rpc_url=OSTIUM_RPC_URL)
        
        # Get price from Ostium SDK
        # Returns tuple: (price, isMarketOpen, isDayTradingClosed)
        # NOTE: get_price is async, need to run it in event loop
        try:
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            price_result = loop.run_until_complete(sdk.price.get_price(token.upper(), 'USD'))
            loop.close()
            
            logger.info(f"Raw price result for {token}: {price_result} (type: {type(price_result)})")
        except Exception as sdk_error:
            logger.error(f"SDK get_price failed for {token}: {str(sdk_error)}")
            logger.error(traceback.format_exc())
            return jsonify({
                "success": False,
                "error": f"Price feed unavailable: {str(sdk_error)}",
                "testnet_issue": True
            }), 503  # Service Unavailable
        
        if isinstance(price_result, tuple) and len(price_result) >= 1:
            price = price_result[0]
            is_market_open = price_result[1] if len(price_result) > 1 else True
            is_day_trading_closed = price_result[2] if len(price_result) > 2 else False
            
            logger.info(f"{token}/USD price: ${price} (Open: {is_market_open})")
            
            return jsonify({
                "success": True,
                "token": token.upper(),
                "price": float(price),
                "isMarketOpen": is_market_open,
                "isDayTradingClosed": is_day_trading_closed
            })
        else:
            logger.error(f"Unexpected price data format for {token}: {price_result}")
            return jsonify({
                "success": False,
                "error": "Invalid price data format from oracle",
                "raw_result": str(price_result),
                "testnet_issue": True
            }), 503  # Service Unavailable
            
    except Exception as e:
        logger.error(f"Get price error for {token}: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == '__main__':
    # Create logs directory
    os.makedirs('logs', exist_ok=True)
    print("--------------------------------", os.getenv('OSTIUM_MAINNET'))

    print("Ostium mainnet: ", OSTIUM_MAINNET)
    print("RPC URL: ", OSTIUM_RPC_URL)
    print("Ostium testnet: ", OSTIUM_TESTNET)
    
    logger.info(f"🚀 Starting Ostium Service on port {PORT}")
    logger.info(f"   Network: {'TESTNET (Arbitrum Sepolia)' if OSTIUM_TESTNET else 'MAINNET'}")
    
    app.run(
        host='0.0.0.0',
        port=PORT,
        debug=False
    )

