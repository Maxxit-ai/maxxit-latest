#!/usr/bin/env python3
"""
Script to update ostium_trade_index in the positions table by fetching
actual trade indexes from Ostium using the deployment's user wallet.

Usage:
    python scripts/update-ostium-trade-indexes.py <deployment_id>
    
Example:
    python scripts/update-ostium-trade-indexes.py 123e4567-e89b-12d3-a456-426614174000
"""

import sys
import os
import asyncio

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Import required libraries
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: psycopg2 not installed")
    print("Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    from ostium_python_sdk import OstiumSDK
except ImportError:
    print("ERROR: ostium-python-sdk not installed")
    print("Run: pip install ostium-python-sdk")
    sys.exit(1)

try:
    from web3 import Web3
except ImportError:
    print("ERROR: web3 not installed")
    print("Run: pip install web3")
    sys.exit(1)


def get_database_connection():
    """Create database connection from DATABASE_URL"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)
    
    return psycopg2.connect(database_url)


def get_deployment_info(conn, deployment_id: str) -> dict:
    """Fetch the deployment info including user_wallet from agent_deployments table"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT 
                ad.id,
                ad.user_wallet,
                ad.safe_wallet,
                ad.agent_id,
                a.name as agent_name
            FROM agent_deployments ad
            JOIN agents a ON ad.agent_id = a.id
            WHERE ad.id = %s
        """, (deployment_id,))
        deployment = cur.fetchone()
        
        if not deployment:
            print(f"ERROR: Deployment with ID '{deployment_id}' not found")
            sys.exit(1)
        
        print(f"✅ Found deployment for agent: {deployment['agent_name']}")
        print(f"   User wallet: {deployment['user_wallet']}")
        print(f"   Safe wallet: {deployment['safe_wallet']}")
        
        return deployment


def get_open_positions_from_db(conn, deployment_id: str) -> list:
    """Fetch open positions for a deployment from the positions table with signal info"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT 
                p.id,
                p.signal_id,
                p.token_symbol,
                p.side,
                p.entry_price,
                p.qty,
                p.ostium_trade_index,
                p.deployment_id,
                p.opened_at,
                s.agent_id,
                s.created_at as signal_created_at
            FROM positions p
            JOIN signals s ON p.signal_id = s.id
            WHERE p.deployment_id = %s
              AND p.venue = 'OSTIUM'
              AND p.status = 'OPEN'
              AND p.closed_at IS NULL
            ORDER BY p.opened_at ASC
        """, (deployment_id,))
        
        positions = cur.fetchall()
        return positions


def parse_ostium_trade(trade) -> dict:
    """Parse an Ostium trade object into a standardized format"""
    pair_info = trade.get('pair', {})
    symbol = pair_info.get('from', 'UNKNOWN')
    
    trade_index = trade.get('index', None)
    is_buy = trade.get('isBuy', True)
    side = "LONG" if is_buy else "SHORT"
    
    # Parse entry price (in wei format)
    open_price_wei = int(trade.get('openPrice', 0))
    entry_price = float(open_price_wei / 1e18) if open_price_wei > 0 else 0.0
    
    # Parse collateral (USDC is 6 decimals)
    collateral_wei = int(trade.get('collateral', 0))
    collateral = float(collateral_wei / 1e6) if collateral_wei > 0 else 0.0
    
    return {
        'trade_index': trade_index,
        'symbol': symbol,
        'side': side,
        'entry_price': entry_price,
        'collateral': collateral,
    }


async def fetch_ostium_positions(wallet_address: str) -> list:
    """Fetch open positions from Ostium for a wallet"""
    OSTIUM_TESTNET = os.getenv('OSTIUM_TESTNET', 'true').lower() == 'true'
    OSTIUM_RPC_URL = os.getenv('OSTIUM_RPC_URL', 'https://sepolia-rollup.arbitrum.io/rpc')
    
    network = 'testnet' if OSTIUM_TESTNET else 'mainnet'
    
    # Create SDK instance (use dummy key for read-only operations)
    dummy_key = '0x' + '1' * 64
    sdk = OstiumSDK(
        network=network,
        private_key=dummy_key,
        rpc_url=OSTIUM_RPC_URL
    )
    
    # Checksum the address
    checksummed_address = Web3.to_checksum_address(wallet_address)
    
    # Fetch open trades
    result = await sdk.get_open_trades(trader_address=checksummed_address)
    
    if isinstance(result, tuple) and len(result) > 0:
        trades = result[0] if isinstance(result[0], list) else []
    else:
        trades = []
    
    return [parse_ostium_trade(t) for t in trades]


def match_positions(db_positions: list, ostium_positions: list) -> list:
    """
    Match database positions with Ostium positions based on:
    - token_symbol
    - side (LONG/SHORT)
    - Order of opening (positions opened earlier get lower trade indexes)
    
    The matching logic:
    1. Group DB positions by (symbol, side)
    2. Group Ostium positions by (symbol, side)
    3. Sort both by opened_at/trade_index respectively
    4. Match them in order (1st DB pos -> 1st Ostium pos, etc.)
    
    Returns list of match dictionaries
    """
    matches = []
    
    # Group DB positions by (symbol, side)
    db_groups = {}
    for db_pos in db_positions:
        key = (db_pos['token_symbol'].upper(), db_pos['side'].upper())
        if key not in db_groups:
            db_groups[key] = []
        db_groups[key].append(db_pos)
    
    # Sort each DB group by opened_at (already sorted from query, but ensure it)
    for key in db_groups:
        db_groups[key].sort(key=lambda x: x['opened_at'])
    
    # Group Ostium positions by (symbol, side)
    ostium_groups = {}
    for ostium_pos in ostium_positions:
        key = (ostium_pos['symbol'].upper(), ostium_pos['side'].upper())
        if key not in ostium_groups:
            ostium_groups[key] = []
        ostium_groups[key].append(ostium_pos)
    
    # Sort each Ostium group by trade_index (lower index = opened earlier)
    for key in ostium_groups:
        ostium_groups[key].sort(key=lambda x: x['trade_index'])
    
    # Match positions in order for each (symbol, side) group
    for key, db_group in db_groups.items():
        ostium_group = ostium_groups.get(key, [])
        
        if not ostium_group:
            print(f"  ⚠️  No Ostium positions found for {key[0]} {key[1]}")
            continue
        
        if len(db_group) != len(ostium_group):
            print(f"  ⚠️  Count mismatch for {key[0]} {key[1]}: DB={len(db_group)}, Ostium={len(ostium_group)}")
        
        # Match in order
        for i, db_pos in enumerate(db_group):
            if i < len(ostium_group):
                ostium_pos = ostium_group[i]
                matches.append({
                    'db_position_id': db_pos['id'],
                    'signal_id': db_pos['signal_id'],
                    'agent_id': db_pos['agent_id'],
                    'db_symbol': key[0],
                    'db_side': key[1],
                    'db_entry_price': float(db_pos['entry_price']) if db_pos['entry_price'] else 0,
                    'ostium_trade_index': ostium_pos['trade_index'],
                    'ostium_entry_price': ostium_pos['entry_price'],
                    'current_index': db_pos['ostium_trade_index'],
                })
            else:
                print(f"  ⚠️  No matching Ostium position for DB position {db_pos['id']} ({key[0]} {key[1]})")
    
    return matches


def update_trade_indexes(conn, matches: list, dry_run: bool = False):
    """Update ostium_trade_index in the positions table"""
    updated_count = 0
    skipped_count = 0
    
    with conn.cursor() as cur:
        for match in matches:
            symbol = match['db_symbol']
            side = match['db_side']
            current_idx = match['current_index']
            new_idx = match['ostium_trade_index']
            
            # Skip if already has the correct index
            if current_idx == new_idx:
                print(f"  ⏭️  {symbol} {side} - already has index {new_idx}")
                skipped_count += 1
                continue
            
            if dry_run:
                print(f"  🔍 Would update {symbol} {side}: index {current_idx} → {new_idx}")
            else:
                cur.execute(
                    "UPDATE positions SET ostium_trade_index = %s WHERE id = %s",
                    (new_idx, match['db_position_id'])
                )
                print(f"  ✅ Updated {symbol} {side}: index {current_idx} → {new_idx}")
            
            updated_count += 1
    
    if not dry_run:
        conn.commit()
    
    return updated_count, skipped_count


async def main_async(deployment_id: str, dry_run: bool = False):
    """Main async function"""
    print(f"\n{'='*70}")
    print(f"  OSTIUM TRADE INDEX UPDATER")
    print(f"{'='*70}")
    print(f"Deployment ID: {deployment_id}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE UPDATE'}")
    print(f"{'='*70}\n")
    
    # Connect to database
    conn = get_database_connection()
    
    try:
        # Step 1: Get deployment info including user_wallet
        print("📋 Step 1: Fetching deployment info...")
        deployment = get_deployment_info(conn, deployment_id)
        user_wallet = deployment['user_wallet']
        
        # Step 2: Get open positions from database
        print("\n📋 Step 2: Fetching open positions from database...")
        db_positions = get_open_positions_from_db(conn, deployment_id)
        print(f"   Found {len(db_positions)} open OSTIUM positions in database")
        
        if len(db_positions) == 0:
            print("\n⚠️  No open OSTIUM positions found for this deployment")
            return
        
        # Step 3: Fetch positions from Ostium
        print("\n📋 Step 3: Fetching positions from Ostium...")
        ostium_positions = await fetch_ostium_positions(user_wallet)
        print(f"   Found {len(ostium_positions)} open positions on Ostium")
        
        if len(ostium_positions) == 0:
            print("\n⚠️  No open positions found on Ostium for this wallet")
            return
        
        # Step 4: Match positions
        print("\n📋 Step 4: Matching positions...")
        matches = match_positions(db_positions, ostium_positions)
        print(f"   Matched {len(matches)} positions")
        
        if len(matches) == 0:
            print("\n⚠️  Could not match any positions")
            print("    This might happen if token symbols or sides don't match")
            return
        
        # Step 5: Update trade indexes
        print(f"\n📋 Step 5: {'Previewing' if dry_run else 'Updating'} trade indexes...")
        updated, skipped = update_trade_indexes(conn, matches, dry_run)
        
        # Summary
        print(f"\n{'='*70}")
        print(f"  SUMMARY")
        print(f"{'='*70}")
        print(f"  DB Positions:     {len(db_positions)}")
        print(f"  Ostium Positions: {len(ostium_positions)}")
        print(f"  Matched:          {len(matches)}")
        print(f"  Updated:          {updated}")
        print(f"  Skipped:          {skipped}")
        print(f"  Unmatched:        {len(db_positions) - len(matches)}")
        print(f"{'='*70}\n")
        
        if dry_run and updated > 0:
            print("💡 Run without --dry-run to apply changes\n")
        
    finally:
        conn.close()


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python scripts/update-ostium-trade-indexes.py <deployment_id> [--dry-run]")
        print("\nOptions:")
        print("  --dry-run    Preview changes without updating the database")
        print("\nExample:")
        print("  python scripts/update-ostium-trade-indexes.py 123e4567-e89b-12d3-a456-426614174000")
        print("  python scripts/update-ostium-trade-indexes.py 123e4567-e89b-12d3-a456-426614174000 --dry-run")
        sys.exit(1)
    
    deployment_id = sys.argv[1]
    dry_run = '--dry-run' in sys.argv
    
    asyncio.run(main_async(deployment_id, dry_run))


if __name__ == '__main__':
    main()

