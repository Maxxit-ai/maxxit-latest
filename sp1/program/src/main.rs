//! Ostium Trader Performance + Featured Position Proof — SP1 Guest Program
//!
//! This program runs inside the SP1 zkVM and proves:
//! 1. Aggregate trader performance (PnL, win rate, trade count) from closed trades
//! 2. A specific featured position (the one being listed as alpha)
//!
//! Inputs (read from host):
//!   - Vec<Trade>         — closed trade data from Ostium subgraph
//!   - FeaturedPosition   — the open position to prove alongside performance
//!
//! Outputs (committed to public, ALL BIG-ENDIAN for Solidity compatibility):
//!   — Aggregate (60 bytes):
//!     - trader: [u8; 20]       (20B)
//!     - trade_count: u32       (4B)
//!     - win_count: u32         (4B)
//!     - total_pnl: i64         (8B) — PnL in USDC micros (6 dec)
//!     - total_collateral: u64  (8B) — collateral in USDC micros (6 dec)
//!     - start_timestamp: u64   (8B)
//!     - end_timestamp: u64     (8B)
//!   — Featured position (50 bytes):
//!     - featured_trade_id: u64   (8B)
//!     - featured_pair_index: u32 (4B)
//!     - featured_is_buy: u8      (1B)
//!     - featured_leverage: u32   (4B) — leverage × 100
//!     - featured_collateral: u64 (8B) — USDC micros (6 dec)
//!     - featured_entry_price: u128 (16B) — 18 decimals
//!     - featured_is_open: u8     (1B)
//!     - featured_timestamp: u64  (8B)

#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::{Deserialize, Serialize};

/// A single closed trade from the Ostium subgraph.
#[derive(Serialize, Deserialize, Debug)]
pub struct Trade {
    pub trader: String,
    pub is_buy: bool,
    pub collateral: String,   // 6 decimals (USDC)
    pub leverage: String,     // 2 decimals (e.g. 5000 = 50x)
    pub open_price: String,   // 18 decimals
    pub close_price: String,  // 18 decimals
    pub timestamp: String,
    pub funding: String,      // 18 decimals
    pub rollover: String,     // 18 decimals
}

/// The featured open position being listed as alpha.
#[derive(Serialize, Deserialize, Debug)]
pub struct FeaturedPosition {
    pub trader: String,
    pub trade_id: u64,
    pub pair_index: u32,
    pub is_buy: bool,
    pub leverage: String,     // 2 decimals (e.g. 500 = 5x)
    pub collateral: String,   // 6 decimals (USDC)
    pub entry_price: String,  // 18 decimals
    pub is_open: bool,
    pub timestamp: String,
}

/// Combined input from host
#[derive(Serialize, Deserialize, Debug)]
pub struct ProofInput {
    pub trades: Vec<Trade>,
    pub featured: FeaturedPosition,
}

fn parse_u128(s: &str) -> u128 {
    s.parse::<u128>().unwrap_or(0)
}

fn parse_u64(s: &str) -> u64 {
    s.parse::<u64>().unwrap_or(0)
}

/// Decode a hex address string (0x...) into [u8; 20]
fn decode_address(addr: &str) -> [u8; 20] {
    let hex = addr.strip_prefix("0x").unwrap_or(addr);
    let mut bytes = [0u8; 20];
    for i in 0..20 {
        let byte_hex = &hex[i * 2..i * 2 + 2];
        bytes[i] = u8::from_str_radix(byte_hex, 16).unwrap_or(0);
    }
    bytes
}

pub fn main() {
    // Read combined input from host
    let input: ProofInput = sp1_zkvm::io::read();

    let trades = input.trades;
    let featured = input.featured;

    // ========================================================================
    // Part 1: Aggregate performance metrics (from closed trades)
    // ========================================================================

    let mut trade_count: u32 = 0;
    let mut win_count: u32 = 0;
    let mut total_pnl_micros: i64 = 0;
    let mut total_collateral_micros: u64 = 0;
    let mut start_timestamp: u64 = u64::MAX;
    let mut end_timestamp: u64 = 0;
    let mut trader_bytes = [0u8; 20];

    for trade in &trades {
        if trade_count == 0 {
            trader_bytes = decode_address(&trade.trader);
        }

        trade_count += 1;

        let collateral_micros = parse_u128(&trade.collateral);
        total_collateral_micros += collateral_micros as u64;

        let open_price = parse_u128(&trade.open_price);
        let close_price = parse_u128(&trade.close_price);
        let leverage = parse_u128(&trade.leverage);

        let mut trade_pnl_micros: i64 = 0;

        if open_price > 0 {
            let price_diff = if trade.is_buy {
                close_price as i128 - open_price as i128
            } else {
                open_price as i128 - close_price as i128
            };

            let numerator = collateral_micros as i128 * leverage as i128 * price_diff;
            let denominator = open_price as i128 * 100;
            trade_pnl_micros = (numerator / denominator) as i64;
        }

        let funding_micros = (parse_u128(&trade.funding) / 1_000_000_000_000) as i64;
        let rollover_micros = (parse_u128(&trade.rollover) / 1_000_000_000_000) as i64;
        trade_pnl_micros -= funding_micros.abs() + rollover_micros.abs();

        total_pnl_micros += trade_pnl_micros;
        if trade_pnl_micros > 0 {
            win_count += 1;
        }

        let ts = parse_u64(&trade.timestamp);
        if ts < start_timestamp {
            start_timestamp = ts;
        }
        if ts > end_timestamp {
            end_timestamp = ts;
        }
    }

    if trades.is_empty() {
        start_timestamp = 0;
        // If no closed trades, use featured position's trader
        trader_bytes = decode_address(&featured.trader);
    }

    // ========================================================================
    // Part 2: Featured position data
    // ========================================================================

    let featured_trade_id = featured.trade_id;
    let featured_pair_index = featured.pair_index;
    let featured_is_buy: u8 = if featured.is_buy { 1 } else { 0 };
    let featured_leverage = parse_u128(&featured.leverage) as u32;
    let featured_collateral_micros = parse_u128(&featured.collateral) as u64;
    let featured_entry_price = parse_u128(&featured.entry_price);
    let featured_is_open: u8 = if featured.is_open { 1 } else { 0 };
    let featured_timestamp = parse_u64(&featured.timestamp);

    // ========================================================================
    // Commit all values in BIG-ENDIAN for Solidity compatibility
    // ========================================================================

    // Aggregate metrics (60 bytes)
    sp1_zkvm::io::commit_slice(&trader_bytes);                          // 20 bytes
    sp1_zkvm::io::commit_slice(&trade_count.to_be_bytes());             // 4 bytes
    sp1_zkvm::io::commit_slice(&win_count.to_be_bytes());               // 4 bytes
    sp1_zkvm::io::commit_slice(&total_pnl_micros.to_be_bytes());        // 8 bytes
    sp1_zkvm::io::commit_slice(&total_collateral_micros.to_be_bytes()); // 8 bytes
    sp1_zkvm::io::commit_slice(&start_timestamp.to_be_bytes());         // 8 bytes
    sp1_zkvm::io::commit_slice(&end_timestamp.to_be_bytes());           // 8 bytes

    // Featured position (50 bytes)
    sp1_zkvm::io::commit_slice(&featured_trade_id.to_be_bytes());       // 8 bytes
    sp1_zkvm::io::commit_slice(&featured_pair_index.to_be_bytes());     // 4 bytes
    sp1_zkvm::io::commit_slice(&[featured_is_buy]);                     // 1 byte
    sp1_zkvm::io::commit_slice(&featured_leverage.to_be_bytes());       // 4 bytes
    sp1_zkvm::io::commit_slice(&featured_collateral_micros.to_be_bytes()); // 8 bytes
    sp1_zkvm::io::commit_slice(&featured_entry_price.to_be_bytes());    // 16 bytes
    sp1_zkvm::io::commit_slice(&[featured_is_open]);                    // 1 byte
    sp1_zkvm::io::commit_slice(&featured_timestamp.to_be_bytes());      // 8 bytes
}
