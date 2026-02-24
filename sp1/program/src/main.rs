//! Ostium Trader Performance Proof — SP1 Guest Program
//!
//! This program runs inside the SP1 zkVM and proves that given a set of trades,
//! the computed metrics (PnL, win rate, trade count) are correct.
//!
//! Inputs (read from host):
//!   - Vec<Trade> — closed trade data from Ostium subgraph
//!
//! Outputs (committed to public):
//!   - trader: [u8; 20]     — trader address
//!   - trade_count: u32     — number of closed trades
//!   - win_count: u32       — trades with positive PnL
//!   - total_pnl: i64       — total PnL in USDC micros (6 decimals)
//!   - total_collateral: u64 — total collateral in USDC micros
//!   - start_timestamp: u64 — earliest trade timestamp
//!   - end_timestamp: u64   — latest trade timestamp

#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::{Deserialize, Serialize};

/// A single trade from the Ostium subgraph.
/// All values are raw strings from the subgraph; parsing happens here.
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

/// Output metrics committed as public values
#[derive(Serialize, Deserialize, Debug)]
pub struct TraderMetrics {
    pub trader: [u8; 20],
    pub trade_count: u32,
    pub win_count: u32,
    pub total_pnl_micros: i64,    // PnL in USDC * 1e6
    pub total_collateral_micros: u64, // Collateral in USDC * 1e6
    pub start_timestamp: u64,
    pub end_timestamp: u64,
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
    // Read trade data from host
    let trades: Vec<Trade> = sp1_zkvm::io::read();

    let mut trade_count: u32 = 0;
    let mut win_count: u32 = 0;
    let mut total_pnl_micros: i64 = 0;
    let mut total_collateral_micros: u64 = 0;
    let mut start_timestamp: u64 = u64::MAX;
    let mut end_timestamp: u64 = 0;
    let mut trader_bytes = [0u8; 20];

    for trade in &trades {
        // Set trader from first trade
        if trade_count == 0 {
            trader_bytes = decode_address(&trade.trader);
        }

        trade_count += 1;

        // Collateral: 6 decimals → already in micros
        let collateral_micros = parse_u128(&trade.collateral);
        total_collateral_micros += collateral_micros as u64;

        // Compute PnL
        let open_price = parse_u128(&trade.open_price);  // 18 decimals
        let close_price = parse_u128(&trade.close_price); // 18 decimals
        let leverage = parse_u128(&trade.leverage);        // 2 decimals (÷100)

        let mut trade_pnl_micros: i64 = 0;

        if open_price > 0 {
            // PnL = collateral * leverage * |price_diff| / open_price / 100
            // Working in higher precision to avoid overflow:
            // collateral_micros is ~1e8 range, leverage ~5000, price ~1e23
            // Result should be in micros (6 decimals)
            let price_diff = if trade.is_buy {
                close_price as i128 - open_price as i128
            } else {
                open_price as i128 - close_price as i128
            };

            // PnL = collateral_micros * leverage * price_diff / (open_price * 100)
            let numerator = collateral_micros as i128 * leverage as i128 * price_diff;
            let denominator = open_price as i128 * 100;
            trade_pnl_micros = (numerator / denominator) as i64;
        }

        // Subtract fees (funding and rollover are in 18 decimals)
        // Convert to 6 decimals: ÷ 1e12
        let funding_micros = (parse_u128(&trade.funding) / 1_000_000_000_000) as i64;
        let rollover_micros = (parse_u128(&trade.rollover) / 1_000_000_000_000) as i64;
        trade_pnl_micros -= funding_micros.abs() + rollover_micros.abs();

        total_pnl_micros += trade_pnl_micros;
        if trade_pnl_micros > 0 {
            win_count += 1;
        }

        // Timestamps
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
    }

    // Commit the proven metrics as public output
    let metrics = TraderMetrics {
        trader: trader_bytes,
        trade_count,
        win_count,
        total_pnl_micros,
        total_collateral_micros,
        start_timestamp,
        end_timestamp,
    };

    sp1_zkvm::io::commit(&metrics);
}
