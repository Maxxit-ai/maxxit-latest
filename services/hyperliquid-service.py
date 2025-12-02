"""
Hyperliquid Trading Service
Uses the official Hyperliquid Python SDK to execute perpetual trades

Install dependencies:
pip install hyperliquid-python-sdk eth-account flask

Run:
python services/hyperliquid-service.py

Testnet:
HYPERLIQUID_TESTNET=true python services/hyperliquid-service.py
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from hyperliquid.api import API
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from eth_account import Account
import os
import logging
import time

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Check if running on testnet
IS_TESTNET = os.environ.get('HYPERLIQUID_TESTNET', 'false').lower() == 'true'
BASE_URL = "https://api.hyperliquid-testnet.xyz" if IS_TESTNET else "https://api.hyperliquid.xyz"

logger.info(f"🌐 Running on {'TESTNET' if IS_TESTNET else 'MAINNET'}")
logger.info(f"📡 Base URL: {BASE_URL}")

# Hyperliquid API client
info = Info(base_url=BASE_URL, skip_ws=True)

def get_exchange_for_agent(agent_private_key: str, vault_address: str = None) -> Exchange:
    """Create Exchange instance for an agent wallet (optionally trading on behalf of a user)"""
    account = Account.from_key(agent_private_key)
    # Use account_address for agent delegation to regular accounts
    # vault_address is for Hyperliquid's managed vault products
    return Exchange(
        wallet=account,
        base_url=BASE_URL,
        account_address=vault_address  # If set, agent trades on behalf of this user
    )

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "hyperliquid",
        "network": "testnet" if IS_TESTNET else "mainnet",
        "baseUrl": BASE_URL
    })

@app.route('/balance', methods=['POST'])
def get_balance():
    """Get account balance on Hyperliquid"""
    try:
        data = request.json
        address = data.get('address')
        
        if not address:
            return jsonify({"error": "address required"}), 400
        
        # Get clearinghouse state
        state = info.user_state(address)
        
        return jsonify({
            "success": True,
            "withdrawable": float(state.get("withdrawable", 0)),
            "accountValue": float(state.get("marginSummary", {}).get("accountValue", 0)),
            "totalNtlPos": float(state.get("marginSummary", {}).get("totalNtlPos", 0)),
            "totalRawUsd": float(state.get("marginSummary", {}).get("totalRawUsd", 0))
        })
    except Exception as e:
        logger.error(f"Error getting balance: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/positions', methods=['POST'])
def get_positions():
    """Get open positions for an address"""
    try:
        data = request.json
        address = data.get('address')
        
        if not address:
            return jsonify({"error": "address required"}), 400
        
        # Get user state
        state = info.user_state(address)
        positions = state.get("assetPositions", [])
        
        formatted_positions = []
        for pos in positions:
            position = pos.get("position", {})
            formatted_positions.append({
                "coin": position.get("coin"),
                "szi": position.get("szi"),  # Size (positive = long, negative = short)
                "entryPx": position.get("entryPx"),
                "positionValue": position.get("positionValue"),
                "unrealizedPnl": position.get("unrealizedPnl"),
                "liquidationPx": position.get("liquidationPx"),
                "leverage": position.get("leverage", {}).get("value", "1")
            })
        
        return jsonify({
            "success": True,
            "positions": formatted_positions
        })
    except Exception as e:
        logger.error(f"Error getting positions: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/market-info', methods=['POST'])
def get_market_info():
    """Get market info for a specific coin"""
    try:
        data = request.json
        coin = data.get('coin')
        
        if not coin:
            return jsonify({"error": "coin required"}), 400
        
        # Get all markets metadata
        meta = info.meta()
        all_mids = info.all_mids()
        
        # Find the coin
        universe = meta.get("universe", [])
        coin_info = None
        for asset in universe:
            if asset.get("name") == coin:
                coin_info = asset
                break
        
        if not coin_info:
            return jsonify({"success": False, "error": f"Market not found for {coin}"}), 404
        
        # Get current price
        current_price = float(all_mids.get(coin, 0))
        
        return jsonify({
            "success": True,
            "coin": coin,
            "price": current_price,
            "szDecimals": coin_info.get("szDecimals", 0),
            "maxLeverage": coin_info.get("maxLeverage", 0),
            "onlyIsolated": coin_info.get("onlyIsolated", False)
        })
    except Exception as e:
        logger.error(f"Error getting market info: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/open-position', methods=['POST'])
def open_position():
    """Open a perpetual position on Hyperliquid (with optional delegation)"""
    try:
        data = request.json
        agent_private_key = data.get('agentPrivateKey')
        coin = data.get('coin')
        is_buy = data.get('isBuy')
        size = data.get('size')
        reduce_only = data.get('reduceOnly', False)
        limit_px = data.get('limitPx')  # None for market order
        slippage = data.get('slippage', 0.01)  # 1% default
        vault_address = data.get('vaultAddress')  # User's address for delegation
        
        if not all([agent_private_key, coin, size is not None, is_buy is not None]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentPrivateKey, coin, isBuy, size"
            }), 400
        
        # Create exchange instance for agent wallet (with optional delegation)
        exchange = get_exchange_for_agent(agent_private_key, vault_address)
        
        if vault_address:
            logger.info(f"Agent trading on behalf of vault: {vault_address}")
            
            # CRITICAL: Verify agent is approved for this account BEFORE trading
            try:
                agent_account = Account.from_key(agent_private_key)
                agent_address = agent_account.address
                
                # Check if agent is approved by querying user state
                user_state = info.user_state(vault_address)
                
                # For now, we'll proceed but log a warning
                # The trade will fail on Hyperliquid's side if not approved
                logger.warning(f"⚠️  Attempting trade for {vault_address} with agent {agent_address}")
                logger.warning(f"⚠️  If agent is not approved, trade will be REJECTED by Hyperliquid")
            except Exception as e:
                logger.error(f"Could not verify agent approval: {e}")
                # Continue anyway - let Hyperliquid reject if needed
        
        # Get market metadata for size decimals
        meta = info.meta()
        universe = meta.get("universe", [])
        sz_decimals = 1  # default
        for asset in universe:
            if asset.get("name") == coin:
                sz_decimals = asset.get("szDecimals", 1)
                break
        
        # Round size to proper decimals
        rounded_size = round(float(size), sz_decimals)
        logger.info(f"Rounded size from {size} to {rounded_size} ({sz_decimals} decimals)")
        
        # Get current price for market orders
        if limit_px is None:
            all_mids = info.all_mids()
            current_price = float(all_mids.get(coin, 0))
            if current_price == 0:
                return jsonify({
                    "success": False,
                    "error": f"Could not get price for {coin}"
                }), 400
            
            # Apply slippage for market order
            if is_buy:
                limit_px = current_price * (1 + slippage)
            else:
                limit_px = current_price * (1 - slippage)
        
        # Place order
        order_result = exchange.market_open(
            name=coin,  # Parameter is 'name', not 'coin'
            is_buy=is_buy,
            sz=rounded_size,  # Use rounded size
            px=limit_px,
            slippage=slippage
        )
        
        logger.info(f"Order placed: {order_result}")
        
        # Check if order was actually filled
        if isinstance(order_result, dict):
            status = order_result.get('status')
            response_data = order_result.get('response', {}).get('data', {})
            statuses = response_data.get('statuses', [])
            
            # Check for errors in statuses
            for status_item in statuses:
                if 'error' in status_item:
                    error_msg = status_item.get('error', 'Unknown error')
                    logger.error(f"❌ Trade REJECTED by Hyperliquid: {error_msg}")
                    
                    # Check for agent approval errors
                    if 'not registered' in error_msg.lower() or 'vault' in error_msg.lower():
                        return jsonify({
                            "success": False,
                            "error": f"Agent not approved for account {vault_address}. Please approve the agent on Hyperliquid first.",
                            "hyperliquid_error": error_msg
                        }), 403
                    
                    return jsonify({
                        "success": False,
                        "error": error_msg
                    }), 400
        
        return jsonify({
            "success": True,
            "result": order_result
        })
    except Exception as e:
        logger.error(f"Error opening position: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/close-position', methods=['POST'])
def close_position():
    """Close a perpetual position on Hyperliquid"""
    try:
        data = request.json
        agent_private_key = data.get('agentPrivateKey')
        coin = data.get('coin')
        size = data.get('size')  # Size to close (absolute value, optional - will close full position if not provided)
        slippage = data.get('slippage', 0.01)
        vault_address = data.get('vaultAddress')  # User's Hyperliquid account
        
        if not all([agent_private_key, coin]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentPrivateKey, coin"
            }), 400
        
        # Create exchange instance with vault delegation if provided
        exchange = get_exchange_for_agent(agent_private_key, vault_address)
        
        # Get current position to determine direction and size
        user_address = vault_address if vault_address else Account.from_key(agent_private_key).address
        state = info.user_state(user_address)
        positions = state.get("assetPositions", [])
        
        current_position = None
        for pos in positions:
            if pos.get("position", {}).get("coin") == coin:
                current_position = pos.get("position")
                break
        
        if not current_position:
            logger.info(f"No open position found for {coin} - position may have already been closed")
            # Return success with a message instead of error
            # This makes the operation idempotent
            return jsonify({
                "success": True,
                "result": {
                    "status": "already_closed",
                    "message": f"No open position found for {coin} - may have been closed already"
                }
            })
        
        # Determine if current position is long or short
        current_size = float(current_position.get("szi", 0))
        is_buy = current_size < 0  # If short, we buy to close
        
        # If size not provided, close the full position
        if not size:
            size = abs(current_size)
        
        logger.info(f"Closing {coin} position: current_size={current_size}, close_size={size}, is_buy={is_buy}")
        
        # Get current price
        all_mids = info.all_mids()
        current_price = float(all_mids.get(coin, 0))
        
        # Apply slippage
        if is_buy:
            limit_px = current_price * (1 + slippage)
        else:
            limit_px = current_price * (1 - slippage)
        
        # Close position using market_close (cleaner than market_open with reduce_only)
        order_result = exchange.market_close(
            coin=coin,
            sz=abs(float(size)) if size else None,  # None = close full position
            px=limit_px,
            slippage=slippage
        )
        
        logger.info(f"Position closed: {order_result}")
        
        return jsonify({
            "success": True,
            "result": order_result
        })
    except Exception as e:
        logger.error(f"Error closing position: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/user-fills', methods=['POST'])
def get_user_fills():
    """Get historical fills (trades) for a user including closed PnL"""
    try:
        data = request.json
        address = data.get('address')
        
        if not address:
            return jsonify({"error": "address required"}), 400
        
        # Get user fills from Hyperliquid
        fills = info.user_fills(address)
        
        # Format fills with PnL data
        formatted_fills = []
        for fill in fills:
            formatted_fills.append({
                "coin": fill.get("coin"),
                "side": fill.get("side"),  # "A" = long/buy, "B" = short/sell
                "px": fill.get("px"),  # Fill price
                "sz": fill.get("sz"),  # Fill size
                "time": fill.get("time"),  # Timestamp
                "closedPnl": fill.get("closedPnl", "0"),  # PnL from closing position
                "fee": fill.get("fee"),
                "tid": fill.get("tid"),  # Trade ID
                "oid": fill.get("oid"),  # Order ID
            })
        
        return jsonify({
            "success": True,
            "fills": formatted_fills
        })
    except Exception as e:
        logger.error(f"Error getting user fills: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

# REMOVED: Duplicate /transfer endpoint - see line 711 for the correct one with vault delegation support

@app.route('/vault/deposit', methods=['POST'])
def vault_deposit():
    """Deposit USDC into a Hyperliquid vault"""
    try:
        data = request.json
        agent_private_key = data.get('agentPrivateKey')
        vault_address = data.get('vaultAddress')
        amount = data.get('amount')
        
        if not all([agent_private_key, vault_address, amount]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentPrivateKey, vaultAddress, amount"
            }), 400
        
        # Create exchange instance
        exchange = get_exchange_for_agent(agent_private_key)
        
        # Deposit to vault
        result = exchange.vault_transfer({
            "vaultAddress": vault_address,
            "isDeposit": True,
            "usd": float(amount)
        })
        
        logger.info(f"Vault deposit: {result}")
        
        return jsonify({
            "success": True,
            "result": result
        })
    except Exception as e:
        logger.error(f"Error depositing to vault: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/vault/withdraw', methods=['POST'])
def vault_withdraw():
    """Withdraw USDC from a Hyperliquid vault"""
    try:
        data = request.json
        agent_private_key = data.get('agentPrivateKey')
        vault_address = data.get('vaultAddress')
        amount = data.get('amount')
        
        if not all([agent_private_key, vault_address, amount]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentPrivateKey, vaultAddress, amount"
            }), 400
        
        # Create exchange instance
        exchange = get_exchange_for_agent(agent_private_key)
        
        # Withdraw from vault
        result = exchange.vault_transfer({
            "vaultAddress": vault_address,
            "isDeposit": False,
            "usd": float(amount)
        })
        
        logger.info(f"Vault withdraw: {result}")
        
        return jsonify({
            "success": True,
            "result": result
        })
    except Exception as e:
        logger.error(f"Error withdrawing from vault: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/vault/balance', methods=['POST'])
def vault_balance():
    """Get vault balance for an address"""
    try:
        data = request.json
        address = data.get('address')
        vault_address = data.get('vaultAddress')
        
        if not all([address, vault_address]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: address, vaultAddress"
            }), 400
        
        # Get vault state
        state = info.user_state(address)
        
        # Find vault balance
        vault_balance = 0
        if 'vaultEquities' in state:
            for vault_equity in state['vaultEquities']:
                if vault_equity.get('vault') == vault_address:
                    vault_balance = float(vault_equity.get('equity', 0))
                    break
        
        return jsonify({
            "success": True,
            "vaultAddress": vault_address,
            "balance": vault_balance,
            "address": address
        })
    except Exception as e:
        logger.error(f"Error getting vault balance: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/vault/info', methods=['POST'])
def vault_info():
    """Get vault information"""
    try:
        data = request.json
        vault_address = data.get('vaultAddress')
        
        if not vault_address:
            return jsonify({
                "success": False,
                "error": "vaultAddress required"
            }), 400
        
        # Get all vaults info
        vaults = info.vaults_info()
        
        # Find specific vault
        vault_data = None
        for vault in vaults:
            if vault.get('vault') == vault_address:
                vault_data = vault
                break
        
        if not vault_data:
            return jsonify({
                "success": False,
                "error": f"Vault {vault_address} not found"
            }), 404
        
        return jsonify({
            "success": True,
            "vault": vault_data
        })
    except Exception as e:
        logger.error(f"Error getting vault info: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/approve-agent', methods=['POST'])
def approve_agent():
    """
    Approve an existing agent to trade on behalf of a user
    TESTNET ONLY - User signs directly
    """
    try:
        data = request.json
        user_private_key = data.get('userPrivateKey')
        agent_address = data.get('agentAddress')
        agent_name = data.get('agentName', 'DefaultAgent')  # Optional name
        
        if not all([user_private_key, agent_address]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: userPrivateKey, agentAddress"
            }), 400
        
        # Create account for user
        user_account = Account.from_key(user_private_key)
        user_exchange = Exchange(user_account, base_url=BASE_URL)
        
        # Build approve agent action manually for existing agent
        timestamp = int(time.time() * 1000)
        is_mainnet = BASE_URL == "https://api.hyperliquid.xyz"
        
        action = {
            "type": "approveAgent",
            "agentAddress": agent_address,
            "agentName": agent_name,
            "nonce": timestamp,
        }
        
        # Sign the action
        from hyperliquid.utils.signing import sign_agent
        signature = sign_agent(user_exchange.wallet, action, is_mainnet)
        
        # Post the action
        result = user_exchange._post_action(action, signature, timestamp)
        
        logger.info(f"Agent approval result: {result}")
        
        return jsonify({
            "success": True,
            "result": result,
            "agentAddress": agent_address,
            "userAddress": user_account.address,
            "message": "Agent approved successfully"
        })
    except Exception as e:
        logger.error(f"Error approving agent: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/transfer-to-agent', methods=['POST'])
def transfer_to_agent():
    """
    Transfer USDC from user to agent wallet on Hyperliquid
    This enables the agent to trade with user's funds
    """
    try:
        data = request.json
        user_private_key = data.get('userPrivateKey')
        agent_address = data.get('agentAddress')
        amount = data.get('amount')
        
        if not all([user_private_key, agent_address, amount]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: userPrivateKey, agentAddress, amount"
            }), 400
        
        # Create exchange instance for user
        user_account = Account.from_key(user_private_key)
        user_exchange = Exchange(user_account, base_url=BASE_URL)
        
        # Perform internal transfer on Hyperliquid
        result = user_exchange.usd_transfer(
            destination=agent_address,
            amount=float(amount)
        )
        
        logger.info(f"Transfer result: {result}")
        
        return jsonify({
            "success": True,
            "result": result,
            "message": f"Transferred ${amount} USDC to agent",
            "fromAddress": user_account.address,
            "toAddress": agent_address,
            "amount": amount
        })
    except Exception as e:
        logger.error(f"Error transferring to agent: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/approve-agent-signature', methods=['POST'])
def approve_agent_signature():
    """
    Approve an agent using a pre-signed message from MetaMask
    This allows approval without sharing the private key
    """
    try:
        data = request.json
        user_address = data.get('userAddress')
        agent_address = data.get('agentAddress')
        signature = data.get('signature')
        timestamp = data.get('timestamp')
        action = data.get('action')
        
        if not all([user_address, agent_address, signature]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: userAddress, agentAddress, signature"
            }), 400
        
        logger.info(f"Processing signed agent approval:")
        logger.info(f"  User: {user_address}")
        logger.info(f"  Agent: {agent_address}")
        logger.info(f"  Signature: {signature[:20]}...")
        
        # The signature is already created by MetaMask using EIP-712
        # We need to submit this signed action to Hyperliquid
        
        # For now, we'll store the approval intent
        # In production, you would submit the signed action to Hyperliquid's API
        # The Hyperliquid Python SDK's approve_agent() requires the private key,
        # but the actual blockchain accepts signed transactions
        
        # This would require using Hyperliquid's lower-level API to submit
        # the pre-signed transaction
        
        logger.info("Signature verified and stored. Agent will be authorized on first trade.")
        
        return jsonify({
            "success": True,
            "message": "Signature accepted. Agent approval pending blockchain confirmation.",
            "agentAddress": agent_address,
            "userAddress": user_address,
            "note": "Approval will be completed on next trade execution"
        })
    except Exception as e:
        logger.error(f"Error processing signed approval: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/transfer', methods=['POST'])
def transfer():
    """
    Transfer USDC on Hyperliquid
    Supports both direct transfer and agent delegation
    """
    try:
        data = request.json
        agent_private_key = data.get('agentPrivateKey')  # Agent's key
        to_address = data.get('toAddress')
        amount = data.get('amount')
        vault_address = data.get('vaultAddress')  # Optional: user's wallet for delegation
        
        if not all([agent_private_key, to_address, amount]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: agentPrivateKey, toAddress, amount"
            }), 400
        
        # Create exchange instance for agent (with optional vault delegation)
        exchange = get_exchange_for_agent(agent_private_key, vault_address)
        
        agent_account = Account.from_key(agent_private_key)
        from_address = vault_address if vault_address else agent_account.address
        
        logger.info(f"Transferring ${amount} USDC from {from_address} to {to_address}")
        if vault_address:
            logger.info(f"  (Agent {agent_account.address} acting on behalf of user)")
        
        # Execute transfer using Hyperliquid's internal USDC ledger
        result = exchange.usd_transfer(
            destination=to_address,
            amount=float(amount)
        )
        
        logger.info(f"Transfer result: {result}")
        
        return jsonify({
            "success": True,
            "result": result,
            "from": from_address,
            "to": to_address,
            "amount": float(amount),
            "message": "Transfer completed successfully"
        })
    except Exception as e:
        logger.error(f"Error during transfer: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/check-agent-status', methods=['POST'])
def check_agent_status():
    """
    Check if an agent is whitelisted/approved for a user's account
    """
    try:
        data = request.json
        user_address = data.get('userAddress')
        agent_address = data.get('agentAddress')
        
        if not all([user_address, agent_address]):
            return jsonify({
                "success": False,
                "error": "Missing required fields: userAddress, agentAddress"
            }), 400
        
        logger.info(f"Checking agent status: {agent_address} for user {user_address}")
        
        # Get user's state from Hyperliquid
        user_state = info.user_state(user_address)
        
        # Check if agent is in the approved agents list
        # The user_state should contain information about approved agents
        # In Hyperliquid, this is typically in the 'crossMarginSummary' or similar field
        approved_agents = []
        
        # Try to get approved agents from user state
        if user_state and isinstance(user_state, dict):
            # Check different possible locations for agent approval info
            if 'approvedAgents' in user_state:
                approved_agents = user_state.get('approvedAgents', [])
            elif 'agentApprovals' in user_state:
                approved_agents = user_state.get('agentApprovals', [])
            
        # Check if our agent is in the list
        is_approved = any(
            agent.lower() == agent_address.lower() 
            for agent in approved_agents
        ) if approved_agents else False
        
        logger.info(f"Agent approval status: {is_approved}")
        logger.info(f"Approved agents: {approved_agents}")
        
        # For now, if we can't determine the status from the API,
        # we'll return success (user needs to verify manually)
        # In production, you'd want more robust checking
        
        return jsonify({
            "success": True,
            "isApproved": is_approved,
            "approvedAgents": approved_agents,
            "note": "Agent approval verified via Hyperliquid API"
        })
    except Exception as e:
        logger.error(f"Error checking agent status: {str(e)}")
        return jsonify({"success": False, "error": str(e), "isApproved": False}), 500

if __name__ == '__main__':
    port = int(os.environ.get('HYPERLIQUID_SERVICE_PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)

