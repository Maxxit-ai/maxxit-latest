#!/usr/bin/env python3
"""
Avantis Trading Service
Flask service for Avantis perpetual DEX integration using official Python SDK
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from web3 import Web3
import os
import logging
from datetime import datetime
import traceback
import asyncio
import json
import urllib.request
import urllib.error

# Resource monitoring
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    print("WARNING: psutil not installed. Resource monitoring disabled. Run: pip install psutil")
    PSUTIL_AVAILABLE = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("WARNING: python-dotenv not installed. To use .env file, run: pip install python-dotenv")

# Avantis SDK imports
try:
    from avantis_trader_sdk import TraderClient
    from avantis_trader_sdk.types import TradeInput, TradeInputOrderType, MarginUpdateType
except ImportError:
    print("ERROR: avantis-trader-sdk not installed. Run: pip install avantis-trader-sdk")
    exit(1)

# Setup
app = Flask(__name__)
CORS(app)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration
AVANTIS_RPC_URL = os.getenv('AVANTIS_RPC_URL', 'https://mainnet.base.org')
AVANTIS_RPC_BACKUP = os.getenv('AVANTIS_RPC_BACKUP', AVANTIS_RPC_URL)

PORT = int(os.getenv('AVANTIS_SERVICE_PORT', os.getenv('PORT', '5003')))

logger.info(f"🚀 Avantis Service Starting...")
logger.info("   Network: MAINNET")
logger.info(f"   RPC URL: {AVANTIS_RPC_URL}")


def get_resource_usage():
    """
    Get current CPU and memory usage statistics.
    Returns a dict with usage info or None if psutil is not available.
    """
    if not PSUTIL_AVAILABLE:
        return None

    try:
        process = psutil.Process()
        process_memory = process.memory_info()
        process_cpu_percent = process.cpu_percent(interval=0.1)

        return {
            'process': {
                'memory_rss_mb': round(process_memory.rss / (1024 * 1024), 2),
                'memory_vms_mb': round(process_memory.vms / (1024 * 1024), 2),
                'cpu_percent': round(process_cpu_percent, 2),
                'num_threads': process.num_threads(),
                'open_files': len(process.open_files()),
                'connections': len(process.net_connections()),
            },
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting resource usage: {e}")
        return None


# SDK Cache
sdk_cache = {}

# Available Markets Cache
available_markets_cache = {
    'markets': None,
    'last_updated': None,
    'ttl': 300  # 5 minutes cache
}


def get_network_config(request_obj=None, is_testnet_override=None):
    """
    Helper to determine network configuration.

    Avantis does not run on a public testnet, so this always returns mainnet
    RPC configuration. The second return value is kept for backward
    compatibility and is always False.

    Args:
        request_obj: Flask request object (ignored, kept for compatibility)
        is_testnet_override: Ignored, kept for compatibility

    Returns:
        tuple: (rpc_url: str, is_testnet: bool)
    """
    rpc_url = os.getenv('AVANTIS_RPC_URL', 'https://mainnet.base.org')
    return rpc_url, False


def get_trade_index_from_sdk_trade(trade_data, default=0):
    """
    Normalize trade index extraction across SDK/API object shapes.
    Prefers SDK field `trade_index` and falls back to common aliases.
    """
    if trade_data is None:
        return default

    # Pydantic model / object access
    value = getattr(trade_data, 'trade_index', None)
    if value is None:
        value = getattr(trade_data, 'index', None)
    if value is None:
        value = getattr(trade_data, 'tradeId', None)

    # Dict-like access
    if value is None and isinstance(trade_data, dict):
        value = trade_data.get('trade_index')
    if value is None and isinstance(trade_data, dict):
        value = trade_data.get('index')
    if value is None and isinstance(trade_data, dict):
        value = trade_data.get('tradeId')

    return default if value is None else value


def build_avantis_open_trade_id(pair_index, trade_index):
    """Build a stable open-trade identifier for Avantis: <pairIndex>:<tradeIndex>."""
    if pair_index is None or trade_index is None:
        return None

    try:
        return f"{int(pair_index)}:{int(trade_index)}"
    except Exception:
        pair_str = str(pair_index).strip()
        trade_str = str(trade_index).strip()
        if not pair_str or not trade_str:
            return None
        return f"{pair_str}:{trade_str}"


def parse_avantis_open_trade_id(trade_id):
    """
    Parse trade identifier from either:
    - composite string: "<pairIndex>:<tradeIndex>"
    - scalar index string/int: "<tradeIndex>"
    Returns: (pair_index_or_none, trade_index_or_none)
    """
    if trade_id is None:
        return None, None

    raw = str(trade_id).strip()
    if not raw:
        return None, None

    if ":" in raw:
        pair_raw, trade_raw = raw.split(":", 1)
        try:
            pair_index = int(pair_raw.strip())
        except Exception:
            pair_index = None
        try:
            trade_index = int(trade_raw.strip())
        except Exception:
            trade_index = None
        return pair_index, trade_index

    try:
        return None, int(raw)
    except Exception:
        return None, None


def get_trader_client(provider_url: str = None):
    """Get or create a TraderClient instance with caching."""
    if provider_url is None:
        provider_url = AVANTIS_RPC_URL

    cache_key = provider_url
    if cache_key not in sdk_cache:
        sdk_cache[cache_key] = TraderClient(provider_url)
        logger.info(f"Created TraderClient instance (rpc={provider_url})")

    return sdk_cache[cache_key]


def get_trader_client_with_signer(private_key: str, provider_url: str = None):
    """Create a TraderClient instance with a local signer for trade execution."""
    if provider_url is None:
        provider_url = AVANTIS_RPC_URL

    client = TraderClient(provider_url)
    client.set_local_signer(private_key)
    logger.info(f"Created TraderClient with signer (rpc={provider_url})")
    return client


def get_agent_private_key(agent_address: str):
    """
    Look up agent's private key from database (user_agent_addresses or wallet_pool).
    Returns the decrypted private key string.
    """
    import psycopg2
    from psycopg2.extras import RealDictCursor
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from encryption_helper import decrypt_private_key

    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise Exception("DATABASE_URL not configured")

    conn = psycopg2.connect(database_url)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Try user_agent_addresses first (new system) — look for avantis-specific keys first
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

    if user_address_row:
        # Try avantis-specific key first
        if user_address_row.get('ostium_agent_key_encrypted'):
            try:
                private_key = decrypt_private_key(
                    user_address_row['ostium_agent_key_encrypted'],
                    user_address_row['ostium_agent_key_iv'],
                    user_address_row['ostium_agent_key_tag']
                )
                logger.info(f"✅ Found and decrypted Avantis agent key for {agent_address}")
                cur.close()
                conn.close()
                return private_key
            except Exception as e:
                logger.warning(f"Failed to decrypt Avantis key, trying Ostium key: {e}")

        # Fallback to ostium key (shared agent address)
        if user_address_row.get('ostium_agent_key_encrypted'):
            try:
                private_key = decrypt_private_key(
                    user_address_row['ostium_agent_key_encrypted'],
                    user_address_row['ostium_agent_key_iv'],
                    user_address_row['ostium_agent_key_tag']
                )
                logger.info(f"✅ Found and decrypted agent key (Ostium fallback) for {agent_address}")
                cur.close()
                conn.close()
                return private_key
            except Exception as e:
                logger.error(f"Failed to decrypt Ostium key: {e}")

    # Fallback to wallet_pool (legacy)
    cur.execute(
        "SELECT private_key FROM wallet_pool WHERE LOWER(address) = LOWER(%s)",
        (agent_address,)
    )
    wallet = cur.fetchone()

    cur.close()
    conn.close()

    if not wallet:
        raise Exception(f"Agent address {agent_address} not found in user_agent_addresses or wallet_pool")

    logger.info(f"Found agent key for {agent_address} in wallet_pool (legacy)")
    return wallet['private_key']


def get_available_markets(refresh=False):
    """
    Fetch available markets from Database API.
    Returns dict: {
        'BTC': {'index': 0, 'name': 'BTC/USD', 'available': True},
        'ETH': {'index': 1, 'name': 'ETH/USD', 'available': True},
        ...
    }
    """
    import time

    # Check cache
    if not refresh and available_markets_cache['markets'] is not None:
        if available_markets_cache['last_updated'] is not None:
            age = time.time() - available_markets_cache['last_updated']
            if age < available_markets_cache['ttl']:
                return available_markets_cache['markets']

    logger.info("Fetching available markets from Avantis SDK...")

    try:
        rpc_url, _ = get_network_config()
        client = get_trader_client(rpc_url)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            pairs_info = loop.run_until_complete(client.pairs_cache.get_pairs_info())
        finally:
            loop.close()

        markets = {}
        for index, pair_info in pairs_info.items():
            from_symbol = getattr(pair_info, 'from_', None)
            to_symbol = getattr(pair_info, 'to', None)
            if not from_symbol or not to_symbol:
                continue
            # Skip delisted pairs
            if 'DELISTED' in from_symbol:
                continue
            pair_name = f"{from_symbol}/{to_symbol}"
            markets[from_symbol] = {
                'index': index,
                'name': pair_name,
                'available': True
            }

        available_markets_cache['markets'] = markets
        available_markets_cache['last_updated'] = time.time()
        logger.info(f"✅ Loaded {len(markets)} available markets from Avantis SDK")
        return markets

    except Exception as e:
        logger.error(f"Failed to fetch markets from SDK: {e}")
        # Avantis known pair indices (hardcoded fallback)
        fallback = {
            'BTC': {'index': 0, 'name': 'BTC/USD', 'available': True},
            'ETH': {'index': 1, 'name': 'ETH/USD', 'available': True},
            'SOL': {'index': 5, 'name': 'SOL/USD', 'available': True},
            'DOGE': {'index': 6, 'name': 'DOGE/USD', 'available': True},
            'LINK': {'index': 3, 'name': 'LINK/USD', 'available': True},
            'MATIC': {'index': 4, 'name': 'MATIC/USD', 'available': True},
        }
        available_markets_cache['markets'] = fallback
        available_markets_cache['last_updated'] = time.time()
        logger.info(f"⚠️  Using fallback markets ({len(fallback)} markets)")
        return fallback


def validate_market(token_symbol: str):
    """
    Validate if a market is available on Avantis.
    Returns: (pair_index, is_available, market_name)

    Handles multiple input formats:
    - "BTC" -> looks for "BTC" or "BTC/USD" key
    - "BTC/USD" -> looks for "BTC/USD" or "BTC" key
    """
    token_symbol = token_symbol.upper().strip()
    markets = get_available_markets()

    # Direct match first
    if token_symbol in markets:
        market_info = markets[token_symbol]
        return market_info['index'], True, market_info['name']

    # If input is base symbol (e.g., "BTC"), try with "/USD" suffix
    if '/' not in token_symbol:
        usd_pair = f"{token_symbol}/USD"
        if usd_pair in markets:
            market_info = markets[usd_pair]
            return market_info['index'], True, market_info['name']

    # If input is full pair (e.g., "BTC/USD"), try base symbol
    if '/' in token_symbol:
        base_symbol = token_symbol.split('/')[0]
        if base_symbol in markets:
            market_info = markets[base_symbol]
            return market_info['index'], True, market_info['name']

    return None, False, None

# ============================================================
# Flask Routes
# ============================================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "avantis",
        "network": "mainnet",
        "chain": "base",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "v1.0-INITIAL",
        "features": {
            "delegation": True,
            "market_orders": True,
            "limit_orders": True,
            "stop_loss": True,
            "take_profit": True,
            "partial_close": True,
            "margin_updates": True,
            "resource_monitoring": PSUTIL_AVAILABLE
        }
    })


@app.route('/resource-usage', methods=['GET'])
def resource_usage():
    """Get current resource usage (CPU, memory) for monitoring."""
    if not PSUTIL_AVAILABLE:
        return jsonify({
            "success": False,
            "error": "psutil not installed. Run: pip install psutil"
        }), 503

    usage = get_resource_usage()
    if usage:
        return jsonify({"success": True, **usage})
    else:
        return jsonify({"success": False, "error": "Failed to get resource usage"}), 500


@app.route('/balance', methods=['POST'])
def get_balance():
    """
    Get user's balance on Base chain
    Body: { "address": "0x..." }
    """
    try:
        data = request.json
        address = data.get('address')

        if not address:
            return jsonify({"success": False, "error": "Missing address"}), 400

        try:
            address = Web3.to_checksum_address(address)
        except Exception as e:
            return jsonify({"success": False, "error": f"Invalid address format: {str(e)}"}), 400

        rpc_url, _ = get_network_config(request)

        logger.info(f"[BALANCE] RPC: {rpc_url}, Address: {address}")

        # Use web3 directly for balance checks (no signer needed)
        w3 = Web3(Web3.HTTPProvider(rpc_url))

        # Get ETH balance
        eth_balance_wei = w3.eth.get_balance(address)
        eth_balance = w3.from_wei(eth_balance_wei, 'ether')

        # Get USDC balance (ERC-20) - Avantis is mainnet-only
        usdc_address = os.getenv(
            'AVANTIS_USDC_ADDRESS',
            '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  # Base mainnet USDC
        )

        # Minimal ERC-20 ABI for balanceOf
        erc20_abi = [
            {
                "constant": True,
                "inputs": [{"name": "_owner", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "balance", "type": "uint256"}],
                "type": "function"
            }
        ]

        usdc_contract = w3.eth.contract(
            address=Web3.to_checksum_address(usdc_address),
            abi=erc20_abi
        )
        usdc_balance_raw = usdc_contract.functions.balanceOf(address).call()
        usdc_balance = usdc_balance_raw / 1e6  # USDC has 6 decimals

        logger.info(f"Balance for {address}: {usdc_balance} USDC, {eth_balance} ETH")

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

        try:
            address = Web3.to_checksum_address(address)
        except Exception as e:
            return jsonify({"success": False, "error": f"Invalid address format: {str(e)}"}), 400

        rpc_url, is_testnet = get_network_config(request)
        logger.info(f"[POSITIONS] Fetching for {address} on {'testnet' if is_testnet else 'mainnet'}")

        # Create a TraderClient to query positions
        client = get_trader_client(rpc_url)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            trades_result = loop.run_until_complete(client.trade.get_trades(address))
        finally:
            loop.close()

        # get_trades returns (trades_list, pending_orders_list)
        trades_list = []
        if isinstance(trades_result, tuple) and len(trades_result) >= 1:
            trades_list = trades_result[0] if isinstance(trades_result[0], list) else []

        positions = []
        for trade in trades_list:
            try:
                # TradeExtendedResponse has a .trade attribute with TradeInput fields
                trade_data = trade.trade if hasattr(trade, 'trade') else trade
                trade_info = trade.trade_info if hasattr(trade, 'trade_info') else {}

                pair_index = getattr(trade_data, 'pair_index', 0)
                is_long = getattr(trade_data, 'is_long', True)

                collateral = getattr(trade_data, 'collateral_in_trade', 0)
                leverage = getattr(trade_data, 'leverage', 0)
                tp = getattr(trade_data, 'tp', 0)
                sl = getattr(trade_data, 'sl', 0)
                open_price = getattr(trade_data, 'open_price', 0)
                trade_index = get_trade_index_from_sdk_trade(trade_data, 0)

                # Resolve pair name from available markets cache
                pair_name = f"Pair-{pair_index}"
                try:
                    markets = get_available_markets()
                    for symbol, info in markets.items():
                        if info['index'] == pair_index:
                            pair_name = info['name']
                            break
                except:
                    pass

                market_symbol = pair_name.split('/')[0] if '/' in pair_name else pair_name

                positions.append({
                    "market": market_symbol,
                    "marketFull": pair_name,
                    "side": "long" if is_long else "short",
                    "collateral": float(collateral),
                    "entryPrice": float(open_price),
                    "leverage": float(leverage),
                    "tradeId": build_avantis_open_trade_id(pair_index, trade_index),
                    "pairIndex": int(pair_index) if pair_index is not None else None,
                    "tradeIndex": int(trade_index) if trade_index is not None else None,
                    "stopLossPrice": float(sl),
                    "takeProfitPrice": float(tp),
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


@app.route('/markets', methods=['GET'])
def get_markets():
    """Get available trading pairs"""
    try:
        rpc_url, is_testnet = get_network_config(request)
        client = get_trader_client(rpc_url)

        # Try to get pairs from SDK
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            pairs = loop.run_until_complete(client.pairs_cache.get_pairs_count())
        finally:
            loop.close()

        markets = get_available_markets()

        return jsonify({
            "success": True,
            "markets": markets,
            "totalPairs": pairs if isinstance(pairs, int) else len(markets)
        })

    except Exception as e:
        logger.error(f"Get markets error: {str(e)}")
        return jsonify({
            "success": True,
            "markets": get_available_markets(),
            "error": f"SDK query failed, using cached: {str(e)}"
        })


@app.route('/open-position', methods=['POST'])
def open_position():
    """
    Open a position on Avantis (supports both formats)
    Format 1 (agent-based):
    {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "market": "ETH",
        "side": "long",
        "collateral": 100,
        "leverage": 10
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

        rpc_url, is_testnet = get_network_config(request)

        # Support both agentAddress and privateKey formats
        agent_address = data.get('agentAddress')
        private_key = data.get('privateKey')
        use_delegation = False

        if agent_address:
            try:
                private_key = get_agent_private_key(agent_address)
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

        stop_loss_percent = data.get('stopLossPercent')
        take_profit_percent = data.get('takeProfitPercent')

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

        # Idempotency check
        if deployment_id and signal_id:
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor

                database_url = os.getenv('DATABASE_URL')
                if database_url:
                    conn = psycopg2.connect(database_url)
                    cur = conn.cursor(cursor_factory=RealDictCursor)

                    cur.execute(
                        """
                        SELECT id, ostium_trade_id, entry_tx_hash, ostium_trade_index 
                        FROM positions 
                        WHERE deployment_id = %s 
                        AND signal_id = %s
                        AND venue = 'AVANTIS'
                        LIMIT 1
                        """,
                        (deployment_id, signal_id)
                    )
                    existing_position = cur.fetchone()
                    cur.close()
                    conn.close()

                    if existing_position:
                        existing_trade_id = existing_position.get('ostium_trade_id') or existing_position.get('entry_tx_hash')
                        existing_index = existing_position.get('ostium_trade_index')

                        logger.info(f"✅ IDEMPOTENCY: Position already exists for deployment {deployment_id[:8]}...")

                        return jsonify({
                            "success": True,
                            "orderId": existing_trade_id or 'pending',
                            "tradeId": existing_trade_id or 'pending',
                            "transactionHash": existing_position.get('entry_tx_hash', ''),
                            "txHash": existing_position.get('entry_tx_hash', ''),
                            "status": "pending",
                            "message": "Order already exists (idempotency check)",
                            "actualTradeIndex": existing_index,
                            "entryPrice": 0,
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

        # Validate market
        pair_index, is_available, market_name = validate_market(market)

        if not is_available:
            available_markets_list = ', '.join(get_available_markets().keys())
            error_msg = f"Market {market} is not available on Avantis. Available markets: {available_markets_list}"
            logger.warning(error_msg)
            return jsonify({
                "success": False,
                "error": error_msg,
                "availableMarkets": list(get_available_markets().keys())
            }), 400

        logger.info(f"✅ Market validated: {market_name} (pair_index: {pair_index})")

        # Create trader client with signer
        client = get_trader_client_with_signer(private_key, rpc_url)
        trader_address = client.get_signer().get_ethereum_address()

        # Determine the trader for the trade input
        if use_delegation:
            trade_trader = user_address
        else:
            trade_trader = trader_address

        # Calculate TP/SL prices from percentages using current market price
        tp_price = 0
        sl_price = 0
        tp_configured = False
        sl_configured = False

        if take_profit_percent is not None or stop_loss_percent is not None:
            try:
                # Fetch current price using SDK feed_client (same as SDK uses internally)
                loop_price = asyncio.new_event_loop()
                asyncio.set_event_loop(loop_price)
                try:
                    price_data = loop_price.run_until_complete(
                        client.feed_client.get_price_update_data(pair_index)
                    )
                    current_price = float(price_data.core.price) if price_data and price_data.core else 0
                finally:
                    loop_price.close()

                if current_price > 0:
                    is_long = side.lower() == 'long'

                    if take_profit_percent is not None:
                        tp_pct = float(take_profit_percent)
                        if is_long:
                            tp_price = current_price * (1 + tp_pct)
                        else:
                            tp_price = current_price * (1 - tp_pct)
                        tp_configured = True
                        logger.info(f"📊 TP set: {tp_pct*100}% -> ${tp_price:.2f} (current: ${current_price:.2f})")

                    if stop_loss_percent is not None:
                        sl_pct = float(stop_loss_percent)
                        if is_long:
                            sl_price = current_price * (1 - sl_pct)
                        else:
                            sl_price = current_price * (1 + sl_pct)
                        sl_configured = True
                        logger.info(f"📊 SL set: {sl_pct*100}% -> ${sl_price:.2f} (current: ${current_price:.2f})")
                else:
                    logger.warning("⚠️  Could not fetch current price for TP/SL calculation")
            except Exception as price_err:
                logger.warning(f"⚠️  Failed to calculate TP/SL prices: {price_err}")

        # Build TradeInput
        trade_input = TradeInput(
            trader=trade_trader,
            pair_index=pair_index,
            collateral_in_trade=position_size,
            is_long=(side.lower() == 'long'),
            leverage=int(leverage),
            tp=tp_price,
            sl=sl_price,
        )

        logger.info(f"📤 Building trade: pair={pair_index}, collateral={position_size}, leverage={leverage}x, side={side}")

        # Build and execute trade
        max_retries = 3
        retry_delay = 2
        tx_receipt = None
        last_error = None

        for attempt in range(max_retries):
            try:
                logger.info(f"🔄 Attempting trade (attempt {attempt + 1}/{max_retries})...")

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    if use_delegation:
                        # Use delegate variant
                        transaction = loop.run_until_complete(
                            client.trade.build_trade_open_tx_delegate(
                                trade_input=trade_input,
                                trade_input_order_type=TradeInputOrderType.MARKET,
                                slippage_percentage=1,
                            )
                        )
                    else:
                        transaction = loop.run_until_complete(
                            client.trade.build_trade_open_tx(
                                trade_input=trade_input,
                                trade_input_order_type=TradeInputOrderType.MARKET,
                                slippage_percentage=1,
                            )
                        )

                    tx_receipt = loop.run_until_complete(
                        client.sign_and_get_receipt(transaction)
                    )
                finally:
                    loop.close()

                logger.info(f"✅ Trade succeeded on attempt {attempt + 1}")
                break

            except Exception as trade_err:
                error_str = str(trade_err)
                last_error = trade_err

                is_network_error = any(keyword in error_str.lower() for keyword in [
                    'connection reset', 'connection aborted', 'connection refused',
                    'timeout', 'network', 'peer', 'reset by peer', 'errno 104'
                ])

                if is_network_error and attempt < max_retries - 1:
                    wait_time = retry_delay * (attempt + 1)
                    logger.warning(f"⚠️  Network error (attempt {attempt + 1}/{max_retries}): {error_str[:150]}")
                    import time
                    time.sleep(wait_time)
                    # Recreate client
                    client = get_trader_client_with_signer(private_key, rpc_url)
                    continue
                else:
                    raise

        if tx_receipt is None and last_error:
            raise last_error

        # Extract tx hash
        tx_hash = ''
        if tx_receipt:
            if isinstance(tx_receipt, dict):
                tx_hash = tx_receipt.get('transactionHash', tx_receipt.get('hash', ''))
            elif hasattr(tx_receipt, 'transactionHash'):
                tx_hash = tx_receipt.transactionHash
            if hasattr(tx_hash, 'hex'):
                tx_hash = tx_hash.hex()

        logger.info(f"✅ Trade submitted! TX: {tx_hash}")

        # Try to get trade index
        actual_trade_index = None
        entry_price = 0

        try:
            import time
            time.sleep(10)  # Wait for execution

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                trades_result = loop.run_until_complete(client.trade.get_trades(trade_trader))
            finally:
                loop.close()

            trades_list = []
            if isinstance(trades_result, tuple) and len(trades_result) >= 1:
                trades_list = trades_result[0] if isinstance(trades_result[0], list) else []

            for trade in trades_list:
                trade_data = trade.trade if hasattr(trade, 'trade') else trade
                t_pair = getattr(trade_data, 'pair_index', None)
                t_long = getattr(trade_data, 'is_long', None)

                if t_pair == pair_index and t_long == (side.lower() == 'long'):
                    actual_trade_index = get_trade_index_from_sdk_trade(trade_data, 0)
                    entry_price = float(getattr(trade_data, 'open_price', 0))
                    logger.info(f"✅ Found trade: index={actual_trade_index}, entry_price={entry_price}")
                    break

        except Exception as idx_err:
            logger.warning(f"⚠️  Could not get trade index: {idx_err}")

        return jsonify({
            "success": True,
            "orderId": str(tx_hash) if tx_hash else 'pending',
            "tradeId": build_avantis_open_trade_id(pair_index, actual_trade_index) if actual_trade_index is not None else (str(tx_hash) if tx_hash else 'pending'),
            "transactionHash": str(tx_hash),
            "txHash": str(tx_hash),
            "status": "pending",
            "message": "Trade submitted on Avantis",
            "pairIndex": int(pair_index) if pair_index is not None else None,
            "tradeIndex": int(actual_trade_index) if actual_trade_index is not None else None,
            "actualTradeIndex": actual_trade_index,
            "entryPrice": entry_price,
            "slSet": sl_configured,
            "tpSet": tp_configured,
            "slError": None,
            "result": {
                "market": market,
                "side": side,
                "collateral": position_size,
                "leverage": leverage,
                "actualTradeIndex": actual_trade_index,
                "entryPrice": entry_price,
                "slConfigured": sl_configured,
                "tpConfigured": tp_configured,
                "tpPrice": tp_price if tp_configured else None,
                "slPrice": sl_price if sl_configured else None,
            }
        })

    except Exception as e:
        error_str = str(e)
        logger.error(f"Open position error: {error_str}")
        logger.error(traceback.format_exc())

        # Check for insufficient funds
        is_insufficient_funds = 'insufficient' in error_str.lower() and 'funds' in error_str.lower()
        is_below_min = 'belowminlevpos' in error_str.lower()

        if is_insufficient_funds or is_below_min:
            if user_address and market and position_size:
                try:
                    send_insufficient_funds_telegram_notification(user_address, market, position_size)
                except Exception as notif_err:
                    logger.error(f"Failed to send Telegram notification: {notif_err}")

        if is_insufficient_funds and 'gas' in error_str.lower():
            return jsonify({
                "success": False,
                "error": f"Agent address does not have enough ETH on Base for gas fees. Please send ETH to the agent address to cover transaction costs.",
                "details": error_str,
                "errorType": "INSUFFICIENT_GAS"
            }), 500
        elif is_below_min:
            return jsonify({
                "success": False,
                "error": f"Collateral amount is below minimum required. Please increase the collateral.",
                "details": error_str,
                "errorType": "BELOW_MIN_COLLATERAL"
            }), 400

        return jsonify({"success": False, "error": error_str}), 500


@app.route('/close-position', methods=['POST'])
def close_position():
    """
    Close a position (idempotent)
    Body (Format 1 - Agent):
    {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "market": "BTC",
        "tradeId": "12345"
    }
    Body (Format 2 - Legacy):
    {
        "privateKey": "0x...",
        "market": "BTC-USD",
        "useDelegation": false,
        "userAddress": "0x..."
    }
    """
    try:
        data = request.json
        logger.info(f"[CLOSE] Request data: {data}")

        def _normalize_address(addr):
            if not addr:
                return None
            try:
                return Web3.to_checksum_address(addr)
            except Exception:
                return str(addr).lower()

        def _is_zero_address(addr):
            return str(addr or "").lower() in {
                "0x0000000000000000000000000000000000000000",
                "0x0",
                "",
            }

        rpc_url, is_testnet = get_network_config(request)

        # Support both agentAddress and privateKey formats
        agent_address = data.get('agentAddress')
        private_key = data.get('privateKey')
        use_delegation = False

        if agent_address:
            try:
                private_key = get_agent_private_key(agent_address)
                use_delegation = True
            except Exception as e:
                logger.error(f"Error fetching agent key: {e}")
                return jsonify({
                    "success": False,
                    "error": f"Failed to fetch agent key: {str(e)}"
                }), 500
        else:
            use_delegation = data.get('useDelegation', False)

        market = data.get('market')
        trade_id = data.get('tradeId')
        actual_trade_index = data.get('actualTradeIndex')
        user_address = data.get('userAddress')

        if not all([private_key, market]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentAddress/privateKey, market"
            }), 400

        # Create client with signer
        client = get_trader_client_with_signer(private_key, rpc_url)
        trader_address = client.get_signer().get_ethereum_address()
        signer_address = _normalize_address(trader_address)

        # Determine whose positions to check
        if use_delegation and user_address:
            try:
                address_to_check = Web3.to_checksum_address(user_address)
            except:
                return jsonify({"success": False, "error": f"Invalid userAddress format: {user_address}"}), 400
        else:
            address_to_check = trader_address

        # Get open trades to find the one to close
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            trades_result = loop.run_until_complete(client.trade.get_trades(address_to_check))
        finally:
            loop.close()

        trades_list = []
        if isinstance(trades_result, tuple) and len(trades_result) >= 1:
            trades_list = trades_result[0] if isinstance(trades_result[0], list) else []

        # Resolve market to pair_index for matching
        target_pair_index, is_available, market_name = validate_market(market)
        requested_pair_index, requested_trade_index = parse_avantis_open_trade_id(trade_id)
        if requested_trade_index is None and actual_trade_index is not None:
            try:
                requested_trade_index = int(actual_trade_index)
            except Exception:
                requested_trade_index = None

        # Find matching trade
        trade_to_close = None
        for trade in trades_list:
            trade_data = trade.trade if hasattr(trade, 'trade') else trade

            t_index = get_trade_index_from_sdk_trade(trade_data, None)
            t_pair = getattr(trade_data, 'pair_index', None)

            # Match by explicit trade identifier if provided.
            if requested_trade_index is not None and str(t_index) == str(requested_trade_index) and (
                requested_pair_index is None or str(t_pair) == str(requested_pair_index)
            ):
                trade_to_close = trade_data
                logger.info(f"Matched by trade identifier: pair={requested_pair_index}, trade={requested_trade_index}")
                break

            # Otherwise match by pair_index (derived from market name)
            if target_pair_index is not None and t_pair == target_pair_index:
                trade_to_close = trade_data
                logger.info(f"Matched by pair_index: {t_pair} (market: {market})")
                break

        # Idempotency: if no position, return success
        if trade_to_close is None:
            logger.info(f"No open position for {market} - already closed")
            return jsonify({
                "success": True,
                "message": "No open position to close",
                "closePnl": 0
            })

        # Get trade details for close
        t_pair_index = getattr(trade_to_close, 'pair_index', 0)
        t_trade_index = get_trade_index_from_sdk_trade(trade_to_close, 0)
        t_collateral = getattr(trade_to_close, 'collateral_in_trade', 0)

        logger.info(f"🎯 Closing trade: pair_index={t_pair_index}, trade_index={t_trade_index}, collateral={t_collateral}")

        # Execute close
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            if use_delegation:
                close_tx = loop.run_until_complete(
                    client.trade.build_trade_close_tx_delegate(
                        pair_index=t_pair_index,
                        trade_index=t_trade_index,
                        collateral_to_close=float(t_collateral),  # Full close
                        trader=address_to_check,
                    )
                )
            else:
                close_tx = loop.run_until_complete(
                    client.trade.build_trade_close_tx(
                        pair_index=t_pair_index,
                        trade_index=t_trade_index,
                        collateral_to_close=float(t_collateral),
                        trader=address_to_check,
                    )
                )

            tx_receipt = loop.run_until_complete(
                client.sign_and_get_receipt(close_tx)
            )
        finally:
            loop.close()

        # Extract tx hash
        tx_hash = ''
        if tx_receipt:
            if isinstance(tx_receipt, dict):
                tx_hash = tx_receipt.get('transactionHash', tx_receipt.get('hash', ''))
            elif hasattr(tx_receipt, 'transactionHash'):
                tx_hash = tx_receipt.transactionHash
            if hasattr(tx_hash, 'hex'):
                tx_hash = tx_hash.hex()

        logger.info(f"✅ Position closed on Avantis. TX: {tx_hash}")

        return jsonify({
            "success": True,
            "result": {
                "txHash": str(tx_hash),
                "market": market,
                "closePnl": 0  # PnL will be synced by position monitor
            },
            "closePnl": 0
        })

    except Exception as e:
        error_str = str(e)
        logger.error(f"Close position error: {error_str}")
        logger.error(traceback.format_exc())

        # Check for "no open position" type errors (idempotent)
        if 'noopenposition' in error_str.lower() or 'no open' in error_str.lower():
            return jsonify({
                "success": True,
                "message": "Position already closed (idempotent)",
                "closePnl": 0,
                "alreadyClosed": True
            })

        if "execution reverted" in error_str.lower():
            return jsonify({
                "success": False,
                "error": "Close transaction reverted on-chain",
                "details": {
                    "message": error_str,
                    "hint": "Common causes: wrong delegate for user, position already in close flow, or trade state changed between fetch and submit.",
                },
            }), 409

        return jsonify({"success": False, "error": error_str}), 500


@app.route('/update-sl-tp', methods=['POST'])
def update_sl_tp():
    """
    Update stop-loss and take-profit for an existing position.
    Body:
    {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "market": "BTC",
        "tradeIndex": 0,
        "takeProfitPrice": 100000,
        "stopLossPrice": 80000,
        "takeProfitPercent": 0.30,
        "stopLossPercent": 0.10
    }
    """
    try:
        data = request.json
        logger.info(f"[UPDATE-SL-TP] Request data: {data}")

        rpc_url, is_testnet = get_network_config(request)

        agent_address = data.get('agentAddress')
        private_key = data.get('privateKey')
        use_delegation = False

        if agent_address:
            try:
                private_key = get_agent_private_key(agent_address)
                use_delegation = True
            except Exception as e:
                logger.error(f"Error fetching agent key: {e}")
                return jsonify({"success": False, "error": f"Failed to fetch agent key: {str(e)}"}), 500
        else:
            use_delegation = data.get('useDelegation', False)

        market = data.get('market')
        trade_index = data.get('tradeIndex')
        user_address = data.get('userAddress')

        tp_price = data.get('takeProfitPrice')
        sl_price = data.get('stopLossPrice')
        tp_percent = data.get('takeProfitPercent')
        sl_percent = data.get('stopLossPercent')

        if not all([private_key, market]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentAddress/privateKey, market"
            }), 400

        if tp_price is None and tp_percent is None:
            return jsonify({
                "success": False,
                "error": "Must provide either takeProfitPrice or takeProfitPercent"
            }), 400

        # Validate market
        pair_index, is_available, market_name = validate_market(market)
        if not is_available:
            return jsonify({
                "success": False,
                "error": f"Market {market} is not available on Avantis"
            }), 400

        # Create client with signer
        client = get_trader_client_with_signer(private_key, rpc_url)
        trader_address = client.get_signer().get_ethereum_address()

        if use_delegation and user_address:
            try:
                address_to_check = Web3.to_checksum_address(user_address)
            except:
                return jsonify({"success": False, "error": f"Invalid userAddress format: {user_address}"}), 400
        else:
            address_to_check = trader_address

        # Find the trade to update
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            trades_result = loop.run_until_complete(client.trade.get_trades(address_to_check))
        finally:
            loop.close()

        trades_list = []
        if isinstance(trades_result, tuple) and len(trades_result) >= 1:
            trades_list = trades_result[0] if isinstance(trades_result[0], list) else []

        trade_to_update = None
        for trade in trades_list:
            trade_data = trade.trade if hasattr(trade, 'trade') else trade
            t_index = get_trade_index_from_sdk_trade(trade_data, None)
            t_pair = getattr(trade_data, 'pair_index', None)

            if trade_index is not None and str(t_index) == str(trade_index):
                trade_to_update = trade_data
                break
            if pair_index is not None and t_pair == pair_index:
                trade_to_update = trade_data
                break

        if trade_to_update is None:
            return jsonify({
                "success": False,
                "error": f"No open position found for {market}"
            }), 404

        t_trade_index = get_trade_index_from_sdk_trade(trade_to_update, 0)
        t_pair_index = getattr(trade_to_update, 'pair_index', 0)
        entry_price = float(getattr(trade_to_update, 'open_price', 0))
        is_long = getattr(trade_to_update, 'is_long', True)

        # Calculate absolute prices from percentages if needed
        if tp_price is None and tp_percent is not None:
            tp_pct = float(tp_percent)
            if is_long:
                tp_price = entry_price * (1 + tp_pct)
            else:
                tp_price = entry_price * (1 - tp_pct)
        else:
            tp_price = float(tp_price) if tp_price is not None else 0

        if sl_price is None and sl_percent is not None:
            sl_pct = float(sl_percent)
            if is_long:
                sl_price = entry_price * (1 - sl_pct)
            else:
                sl_price = entry_price * (1 + sl_pct)
        else:
            sl_price = float(sl_price) if sl_price is not None else 0

        logger.info(f"📊 Updating TP/SL: pair={t_pair_index}, trade={t_trade_index}, TP=${tp_price:.2f}, SL=${sl_price:.2f}, entry=${entry_price:.2f}")

        # Execute update
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            if use_delegation:
                update_tx = loop.run_until_complete(
                    client.trade.build_trade_tp_sl_update_tx_delegate(
                        pair_index=t_pair_index,
                        trade_index=t_trade_index,
                        take_profit_price=tp_price,
                        stop_loss_price=sl_price,
                        trader=address_to_check,
                    )
                )
            else:
                update_tx = loop.run_until_complete(
                    client.trade.build_trade_tp_sl_update_tx(
                        pair_index=t_pair_index,
                        trade_index=t_trade_index,
                        take_profit_price=tp_price,
                        stop_loss_price=sl_price,
                    )
                )

            signed_tx = loop.run_until_complete(
                client.sign_and_get_receipt(update_tx)
            )
        finally:
            loop.close()

        tx_hash = ''
        if signed_tx:
            if isinstance(signed_tx, dict):
                tx_hash = signed_tx.get('transactionHash', signed_tx.get('hash', ''))
            elif hasattr(signed_tx, 'transactionHash'):
                tx_hash = signed_tx.transactionHash
            if hasattr(tx_hash, 'hex'):
                tx_hash = tx_hash.hex()

        logger.info(f"✅ TP/SL updated. TX: {tx_hash}")

        return jsonify({
            "success": True,
            "message": "TP/SL updated successfully",
            "txHash": tx_hash,
            "result": {
                "market": market,
                "tradeIndex": t_trade_index,
                "entryPrice": entry_price,
                "takeProfitPrice": tp_price,
                "stopLossPrice": sl_price,
                "side": "long" if is_long else "short",
            }
        })

    except Exception as e:
        error_str = str(e)
        logger.error(f"Update SL/TP error: {error_str}")
        logger.error(traceback.format_exc())

        if 'insufficient' in error_str.lower() and 'funds' in error_str.lower() and 'gas' in error_str.lower():
            return jsonify({
                "success": False,
                "error": "Agent address does not have enough ETH on Base for gas fees.",
                "details": error_str,
                "errorType": "INSUFFICIENT_GAS"
            }), 500

        # Avantis-specific contract errors
        contract_errors = {
            'SL_TOO_BIG': "Stop loss is too far from entry price. With higher leverage, the max SL distance is smaller (e.g. with 10x leverage, max SL is ~9%). Try a smaller stopLossPercent.",
            'SL_TOO_SMALL': "Stop loss is too close to entry price. Try a larger stopLossPercent.",
            'TP_TOO_SMALL': "Take profit is too close to entry price. Try a larger takeProfitPercent.",
            'TP_TOO_BIG': "Take profit is too far from entry price. Try a smaller takeProfitPercent.",
            'WRONG_TP': "Invalid take profit price. For longs, TP must be above entry; for shorts, TP must be below entry.",
            'WRONG_SL': "Invalid stop loss price. For longs, SL must be below entry; for shorts, SL must be above entry.",
        }
        for err_key, err_msg in contract_errors.items():
            if err_key in error_str:
                return jsonify({
                    "success": False,
                    "error": err_msg,
                    "details": error_str,
                    "errorType": err_key
                }), 400

        return jsonify({"success": False, "error": error_str}), 500


@app.route('/transfer', methods=['POST'])
def transfer_usdc():
    """
    Transfer USDC (for profit share collection)
    Body: {
        "agentPrivateKey": "0x...",
        "toAddress": "0x...",
        "amount": 10.5,
        "vaultAddress": "0x..."
    }
    """
    try:
        data = request.json
        agent_private_key = data.get('agentPrivateKey')
        to_address = data.get('toAddress')
        amount = float(data.get('amount', 0))
        vault_address = data.get('vaultAddress')

        if not all([agent_private_key, to_address, amount > 0]):
            return jsonify({"success": False, "error": "Missing required fields"}), 400

        rpc_url, _ = get_network_config(request)

        # Determine USDC contract address (mainnet only)
        usdc_address = os.getenv(
            'AVANTIS_USDC_ADDRESS',
            '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
        )

        # Use web3 directly for ERC-20 transfer
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        from eth_account import Account
        account = Account.from_key(agent_private_key)
        from_address = vault_address if vault_address else account.address

        # ERC-20 transfer ABI
        erc20_abi = [
            {
                "inputs": [
                    {"name": "_to", "type": "address"},
                    {"name": "_value", "type": "uint256"}
                ],
                "name": "transfer",
                "outputs": [{"name": "", "type": "bool"}],
                "type": "function"
            }
        ]

        usdc_contract = w3.eth.contract(
            address=Web3.to_checksum_address(usdc_address),
            abi=erc20_abi
        )

        # Build transaction
        amount_raw = int(amount * 1e6)  # USDC has 6 decimals
        tx = usdc_contract.functions.transfer(
            Web3.to_checksum_address(to_address),
            amount_raw
        ).build_transaction({
            'from': account.address,
            'nonce': w3.eth.get_transaction_count(account.address),
            'gas': 100000,
            'gasPrice': w3.eth.gas_price,
        })

        # Sign and send
        signed_tx = w3.eth.account.sign_transaction(tx, agent_private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        tx_hash_hex = tx_hash.hex() if hasattr(tx_hash, 'hex') else str(tx_hash)

        logger.info(f"✅ USDC transfer: {amount} USDC to {to_address}, TX: {tx_hash_hex}")

        return jsonify({
            "success": True,
            "txHash": tx_hash_hex,
            "amount": amount,
            "from": account.address,
            "to": to_address
        })

    except Exception as e:
        logger.error(f"Transfer error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/trade-history', methods=['POST'])
def trade_history():
    """
    Get trade history for a user using Avantis public history API.
    Body:
    {
        "agentAddress": "0x...",
        "userAddress": "0x...",
        "limit": 50
    }
    """
    try:
        data = request.json or {}
        logger.info(f"[TRADE-HISTORY] Request data: {data}")

        agent_address = data.get('agentAddress')
        user_address = data.get('userAddress')
        limit = int(data.get('limit', 50))
        if limit <= 0:
            limit = 50

        # Determine which address to query
        address_to_query = user_address or agent_address
        if not address_to_query:
            return jsonify({
                "success": False,
                "error": "Must provide userAddress or agentAddress"
            }), 400

        try:
            address_to_query = Web3.to_checksum_address(address_to_query)
        except:
            return jsonify({"success": False, "error": f"Invalid address format: {address_to_query}"}), 400

        # Build market lookup by pair index
        markets_cache = {}
        try:
            markets = get_available_markets()
            for _, market_info in markets.items():
                idx = market_info.get('index')
                name = market_info.get('name')
                if idx is not None and name:
                    markets_cache[idx] = name
        except Exception as cache_err:
            logger.warning(f"Could not load market names cache: {cache_err}")

        # Fetch JSON from Avantis public APIs
        def fetch_json(url: str):
            req = urllib.request.Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": "maxxit-avantis-service/1.0"
                }
            )
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.loads(response.read().decode('utf-8'))

        def safe_float(value, default=0.0):
            try:
                if value is None:
                    return default
                return float(value)
            except Exception:
                return default

        logger.info(f"📜 Fetching trade history via Avantis API for {address_to_query}")

        history_rows = []
        page = 1
        max_pages = 20
        total_pages = None

        while len(history_rows) < limit and page <= max_pages:
            history_url = f"https://api.avantisfi.com/v2/history/portfolio/history/{address_to_query}/{page}"
            payload = fetch_json(history_url)

            if not isinstance(payload, dict) or not payload.get('success', False):
                raise Exception(f"Invalid history API response on page {page}")

            portfolio = payload.get('portfolio', [])
            if not isinstance(portfolio, list) or len(portfolio) == 0:
                break

            history_rows.extend(portfolio)

            if total_pages is None:
                page_count = payload.get('pageCount')
                if isinstance(page_count, int) and page_count > 0:
                    total_pages = page_count

            if total_pages is not None and page >= total_pages:
                break

            page += 1

        # Fetch grouped analytics endpoints (best-effort; do not fail history if one endpoint is down)
        analytics = {
            "v2ProfitLossByPair": [],
            "v1TotalSizeByPair": [],
            "v1WinRateByPair": [],
            "v1ProfitLossTimeline": [],
            "summary": {
                "totalPnl": 0.0,
                "totalSize": 0.0,
                "totalCollateral": 0.0,
                "overallWinRate": 0.0
            },
            "errors": []
        }

        analytics_endpoints = {
            "v2ProfitLossByPair": f"https://api.avantisfi.com/v2/history/portfolio/profit-loss/{address_to_query}/grouped",
            "v1TotalSizeByPair": f"https://api.avantisfi.com/v1/history/portfolio/total-size/{address_to_query}/grouped",
            "v1WinRateByPair": f"https://api.avantisfi.com/v1/history/portfolio/win-rate/{address_to_query}/grouped",
            "v1ProfitLossTimeline": f"https://api.avantisfi.com/v1/history/portfolio/profit-loss/history/{address_to_query}/0/d",
        }

        for key, endpoint_url in analytics_endpoints.items():
            try:
                payload = fetch_json(endpoint_url)
                if isinstance(payload, dict) and payload.get('success', False):
                    if key == "v1WinRateByPair":
                        analytics[key] = payload.get('dataByPairIndex', []) or []
                    else:
                        analytics[key] = payload.get('data', []) or []
                else:
                    analytics["errors"].append(f"Invalid payload from {key}")
            except Exception as analytics_err:
                analytics["errors"].append(f"{key}: {str(analytics_err)}")

        # Build summary from grouped analytics
        for row in analytics["v2ProfitLossByPair"]:
            analytics["summary"]["totalPnl"] += safe_float(row.get("total"))

        for row in analytics["v1TotalSizeByPair"]:
            analytics["summary"]["totalSize"] += safe_float(row.get("total"))
            analytics["summary"]["totalCollateral"] += safe_float(row.get("totalCollateral"))

        if analytics["v1WinRateByPair"]:
            win_rates = [safe_float(x.get("winRate")) for x in analytics["v1WinRateByPair"]]
            win_rates = [w for w in win_rates if w >= 0]
            if win_rates:
                # API can return 0..1 ratio; normalize to percentage.
                avg_win_rate = sum(win_rates) / len(win_rates)
                analytics["summary"]["overallWinRate"] = avg_win_rate * 100 if avg_win_rate <= 1 else avg_win_rate

        # Parse v2/history rows into normalized trade history format
        trades = []
        for row in history_rows[:limit]:
            args = row.get('event', {}).get('args', {})
            trade_data = args.get('t', {})

            pair_index = int(trade_data.get('pairIndex', 0) or 0)
            trade_index = int(trade_data.get('index', 0) or 0)
            is_buy = bool(trade_data.get('buy', True))
            collateral = safe_float(trade_data.get('initialPosToken', 0))
            leverage = safe_float(trade_data.get('leverage', 0))
            entry_price = safe_float(trade_data.get('openPrice', 0))
            close_price = safe_float(args.get('price', entry_price))
            position_size_usdc = safe_float(trade_data.get('positionSizeUSDC', args.get('positionSizeUSDC', 0)))
            usdc_sent_to_trader = safe_float(args.get('usdcSentToTrader', 0))
            gross_pnl = safe_float(row.get('_grossPnl', 0))

            history_id = row.get('_id')
            trade_id = build_avantis_open_trade_id(pair_index, trade_index)
            order_id = history_id or (trade_id or f"{pair_index}-{trade_index}-{trade_data.get('timestamp', 0)}")

            timestamp = int(trade_data.get('timestamp', 0) or 0)

            # Fallback to ISO timestamp if numeric timestamp is missing
            if not timestamp:
                iso_ts = row.get('timeStamp')
                if iso_ts:
                    try:
                        timestamp = int(datetime.fromisoformat(iso_ts.replace('Z', '+00:00')).timestamp())
                    except Exception:
                        timestamp = 0

            market_name = markets_cache.get(pair_index, f"Pair-{pair_index}")
            closed_at = row.get('timeStamp')

            trades.append({
                "id": history_id or order_id,
                "tradeId": trade_id or str(trade_index),
                "pairIndex": pair_index,
                "tradeIndex": trade_index,
                "market": market_name,
                "side": "long" if is_buy else "short",
                "collateralUsdc": round(collateral, 6),
                "leverage": round(leverage, 1),
                "entryPrice": entry_price,
                "closePrice": close_price,
                "sizeUsdc": round(position_size_usdc, 6),
                "pnlUsdc": round(usdc_sent_to_trader - collateral, 6),
                "grossPnlUsdc": round(gross_pnl, 6),
                "timestamp": timestamp,
                "closedAt": closed_at,
            })

        # Sort by timestamp descending (newest first)
        trades.sort(key=lambda t: t['timestamp'], reverse=True)
        trades = trades[:limit]

        return jsonify({
            "success": True,
            "trades": trades,
            "total": len(trades),
            "pageCount": total_pages,
            "address": address_to_query,
            "blocksScanned": 0,
            "source": "avantis_api_v2_history",
            "analytics": analytics,
        })

    except urllib.error.HTTPError as e:
        logger.error(f"Trade history API HTTP error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": f"History API HTTP error: {e.code}"}), 502
    except urllib.error.URLError as e:
        logger.error(f"Trade history API network error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": "History API network error"}), 502
    except Exception as e:
        error_str = str(e)
        logger.error(f"Trade history error: {error_str}")
        logger.error(traceback.format_exc())
        return jsonify({"success": False, "error": error_str}), 500


# ============================================================
# Main
# ============================================================

if __name__ == '__main__':
    logger.info(f"🚀 Avantis Service starting on port {PORT}")
    logger.info("   Network: MAINNET (Base)")
    logger.info(f"   RPC: {AVANTIS_RPC_URL}")
    app.run(host='0.0.0.0', port=PORT)
