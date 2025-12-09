#!/usr/bin/env python3
"""
Fetch Closed Positions from Ostium DEX
Retrieves closed trade history with PnL information for a specific wallet address.
"""

import asyncio
import argparse
from datetime import datetime
from typing import Optional

DEFAULT_NETWORK = "testnet"
DEFAULT_ORDER_COUNT = 20
TESTNET_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc"
MAINNET_RPC_URL = "https://arb1.arbitrum.io/rpc"

# Ostium Subgraph Decimal Formats
USDC_DECIMALS = 6 
LEVERAGE_DIVISOR = 100
PROFIT_PERCENT_DIVISOR = 1_000_000
PRICE_DECIMALS = 18

ARBISCAN_TESTNET_TX_URL = "https://sepolia.arbiscan.io/tx/"
ARBISCAN_MAINNET_TX_URL = "https://arbiscan.io/tx/"


def create_sdk(network: str):
    """Create Ostium SDK instance for subgraph queries"""
    try:
        from ostium_python_sdk import OstiumSDK
    except ImportError:
        print("ERROR: ostium-python-sdk not installed.")
        print("Install with: pip install ostium-python-sdk")
        exit(1)
    
    rpc_url = TESTNET_RPC_URL if network == "testnet" else MAINNET_RPC_URL
    
    dummy_private_key = "0x" + "0" * 64
    
    return OstiumSDK(
        network=network,
        private_key=dummy_private_key,
        rpc_url=rpc_url
    )


async def fetch_closed_positions(wallet_address: str, network: str, order_count: int):
    """
    Fetch closed positions for a wallet address.
    
    Args:
        wallet_address: The trader's wallet address
        network: 'testnet' or 'mainnet'
        order_count: Number of recent closed orders to fetch
    
    Returns:
        List of closed position dictionaries
    """
    sdk = create_sdk(network)
    
    print(f"\n🔍 Fetching closed positions for: {wallet_address}")
    print(f"   Network: {network.upper()}")
    print(f"   Fetching last {order_count} closed orders...\n")
    
    try:
        closed_positions = await sdk.subgraph.get_recent_history(
            trader=wallet_address,
            last_n_orders=order_count
        )
        return closed_positions
    except Exception as e:
        print(f"❌ Error fetching closed positions: {e}")
        return []


def format_timestamp(timestamp_str: Optional[str]) -> str:
    """Convert timestamp string to readable date format."""
    if not timestamp_str:
        return "N/A"
    try:
        timestamp = int(timestamp_str)
        return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return str(timestamp_str)


def format_percentage(value: Optional[str]) -> str:
    """Format percentage value for display (Ostium stores as scaled integer)."""
    if value is None:
        return "N/A"
    try:
        raw_value = float(value)
        percent = raw_value / PROFIT_PERCENT_DIVISOR
        sign = "+" if percent >= 0 else ""
        return f"{sign}{percent:.2f}%"
    except (ValueError, TypeError):
        return str(value)


def format_amount(value: Optional[str], display_decimals: int = 2) -> str:
    """Format USDC token amount (6 decimals on-chain)."""
    if value is None:
        return "N/A"
    try:
        amount = float(value) / (10 ** USDC_DECIMALS)
        return f"{amount:.{display_decimals}f}"
    except (ValueError, TypeError):
        return str(value)


def format_leverage(value: Optional[str]) -> str:
    """Format leverage value (stored as leverage * 100)."""
    if value is None:
        return "N/A"
    try:
        leverage = int(float(value)) // LEVERAGE_DIVISOR
        return str(leverage)
    except (ValueError, TypeError):
        return str(value)


def format_price(value: Optional[str]) -> str:
    """Format price value"""
    if value is None:
        return "N/A"
    try:
        price = float(value) / (10 ** PRICE_DECIMALS)
        if price >= 1000:
            return f"{price:,.2f}"
        elif price >= 1:
            return f"{price:.4f}"
        else:
            return f"{price:.6f}"
    except (ValueError, TypeError):
        return str(value)


def display_position(position: dict, index: int, network: str = "testnet") -> None:
    """Display a single closed position with formatted output."""
    pair_info = position.get("pair", {})
    pair_from = pair_info.get("from", "???")
    pair_to = pair_info.get("to", "???")
    trading_pair = f"{pair_from}/{pair_to}"
    
    direction = "🟢 LONG" if position.get("isBuy") else "🔴 SHORT"
    order_action = position.get("orderAction", "N/A")
    
    # PnL Information
    profit_percent = format_percentage(position.get("profitPercent"))
    total_profit_percent = format_percentage(position.get("totalProfitPercent"))
    amount_sent = format_amount(position.get("amountSentToTrader"))
    rollover_fee = format_amount(position.get("rolloverFee"))
    funding_fee = format_amount(position.get("fundingFee"))
    
    # Trade Details
    collateral = format_amount(position.get("collateral"))
    leverage = format_leverage(position.get("leverage"))
    price = format_price(position.get("price"))
    
    # Execution Info
    executed_at = format_timestamp(position.get("executedAt"))
    tx_hash = position.get("executedTx", "")
    
    # Generate clickable Arbiscan link
    arbiscan_base = ARBISCAN_TESTNET_TX_URL if network == "testnet" else ARBISCAN_MAINNET_TX_URL
    tx_link = f"{arbiscan_base}{tx_hash}" if tx_hash else "N/A"
    
    # Cancellation Status
    is_cancelled = position.get("isCancelled", False)
    cancel_reason = position.get("cancelReason", "")
    
    print(f"{'='*80}")
    print(f"📊 Position #{index + 1}: {trading_pair} {direction}")
    print(f"{'='*80}")
    print(f"   Order Action:     {order_action}")
    print(f"   Collateral:       {collateral} USDC")
    print(f"   Leverage:         {leverage}x")
    print(f"   Price:            ${price}")
    print(f"")
    print(f"   💰 PnL Summary:")
    print(f"   ├─ Profit %:          {profit_percent}")
    print(f"   ├─ Total Profit %:    {total_profit_percent} (incl. fees)")
    print(f"   ├─ Amount Received:   {amount_sent} USDC")
    print(f"   ├─ Rollover Fee:      {rollover_fee} USDC")
    print(f"   └─ Funding Fee:       {funding_fee} USDC")
    print(f"")
    print(f"   ⏱️  Executed At:       {executed_at}")
    print(f"   🔗 TX: {tx_link}")
    
    if is_cancelled:
        print(f"   ⚠️  Status:           CANCELLED - {cancel_reason}")
    
    print()


def calculate_summary(positions: list) -> dict:
    """Calculate summary statistics for all closed positions."""
    total_pnl_percent = 0.0
    winning_trades = 0
    losing_trades = 0
    total_received = 0.0
    total_fees = 0.0
    valid_close_trades = 0
    
    for pos in positions:
        try:
            order_action = pos.get("orderAction", "").lower()
            if order_action == "open":
                continue
            
            raw_profit = float(pos.get("totalProfitPercent") or 0)
            profit = raw_profit / PROFIT_PERCENT_DIVISOR
            total_pnl_percent += profit
            valid_close_trades += 1
            
            if profit >= 0:
                winning_trades += 1
            else:
                losing_trades += 1
            
            amount_sent = float(pos.get("amountSentToTrader") or 0) / (10 ** USDC_DECIMALS)
            rollover = float(pos.get("rolloverFee") or 0) / (10 ** USDC_DECIMALS)
            funding = float(pos.get("fundingFee") or 0) / (10 ** USDC_DECIMALS)
            
            total_received += amount_sent
            total_fees += rollover + funding
            
        except (ValueError, TypeError):
            continue
    
    win_rate = (winning_trades / valid_close_trades * 100) if valid_close_trades > 0 else 0
    avg_pnl = total_pnl_percent / valid_close_trades if valid_close_trades > 0 else 0
    
    return {
        "total_trades": len(positions),
        "closed_trades": valid_close_trades,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "win_rate": win_rate,
        "total_pnl_percent": total_pnl_percent,
        "avg_pnl_percent": avg_pnl,
        "total_received": total_received,
        "total_fees": total_fees
    }


def display_summary(summary: dict) -> None:
    """Display summary statistics for closed positions."""
    print(f"\n{'='*80}")
    print(f"📈 SUMMARY (Closed Trades Only)")
    print(f"{'='*80}")
    print(f"   Total Orders:         {summary['total_trades']}")
    print(f"   Closed Trades:        {summary['closed_trades']}")
    print(f"   Winning Trades:       {summary['winning_trades']}")
    print(f"   Losing Trades:        {summary['losing_trades']}")
    print(f"   Win Rate:             {summary['win_rate']:.1f}%")
    print(f"")
    print(f"   Cumulative PnL %:     {'+' if summary['total_pnl_percent'] >= 0 else ''}{summary['total_pnl_percent']:.2f}%")
    print(f"   Average PnL/Trade:    {'+' if summary['avg_pnl_percent'] >= 0 else ''}{summary['avg_pnl_percent']:.2f}%")
    print(f"   Total Received:       {summary['total_received']:.2f} USDC")
    print(f"   Total Fees Paid:      {summary['total_fees']:.2f} USDC")
    print(f"{'='*80}\n")


async def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Fetch closed positions from Ostium DEX with PnL information"
    )
    parser.add_argument(
        "wallet_address",
        type=str,
        help="Wallet address to fetch closed positions for"
    )
    parser.add_argument(
        "-n", "--network",
        type=str,
        choices=["testnet", "mainnet"],
        default=DEFAULT_NETWORK,
        help=f"Network to use (default: {DEFAULT_NETWORK})"
    )
    parser.add_argument(
        "-c", "--count",
        type=int,
        default=DEFAULT_ORDER_COUNT,
        help=f"Number of recent orders to fetch (default: {DEFAULT_ORDER_COUNT})"
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Only show summary, not individual positions"
    )
    parser.add_argument(
        "--closes-only",
        action="store_true",
        help="Only show closed trades (Close, TakeProfit, StopLoss), skip Open orders"
    )
    
    args = parser.parse_args()
    
    wallet = args.wallet_address.strip()
    if not wallet.startswith("0x") or len(wallet) != 42:
        print(f"❌ Invalid wallet address format: {wallet}")
        print("   Expected format: 0x followed by 40 hexadecimal characters")
        exit(1)
    
    positions = await fetch_closed_positions(
        wallet_address=wallet.lower(),
        network=args.network,
        order_count=args.count
    )
    
    if not positions:
        print("📭 No closed positions found for this wallet.")
        return
    
    if args.closes_only:
        close_actions = {"close", "takeprofit", "stoploss", "liquidation"}
        positions = [
            p for p in positions 
            if p.get("orderAction", "").lower() in close_actions
        ]
        print(f"✅ Found {len(positions)} closed trade(s) (filtered)\n")
    else:
        print(f"✅ Found {len(positions)} order(s)\n")
    
    if not positions:
        print("📭 No matching positions found after filtering.")
        return
    
    if not args.summary_only:
        for idx, position in enumerate(positions):
            display_position(position, idx, network=args.network)
    
    summary = calculate_summary(positions)
    display_summary(summary)


if __name__ == "__main__":
    asyncio.run(main())

