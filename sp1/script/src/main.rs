//! Ostium Trader Proof — SP1 Host Script
//!
//! This host program:
//! 1. Reads combined input (trades + featured position) as JSON from stdin
//! 2. Executes the guest program in SP1's zkVM
//! 3. Generates a proof (Groth16 for on-chain, or mock for testing)
//! 4. Outputs the proof and public values as JSON to stdout
//!
//! Input JSON format:
//!   { "trades": [...], "featured": { ... } }
//!
//! Usage:
//!   echo '<input_json>' | cargo run --release -- --mode execute
//!   echo '<input_json>' | cargo run --release -- --mode prove

use clap::Parser;
use serde::{Deserialize, Serialize};
use sp1_sdk::{include_elf, HashableKey, ProverClient, SP1Stdin};
use std::io::Read;

/// The ELF binary of the compiled guest program
const GUEST_ELF: &[u8] = include_elf!("ostium-trader-proof");

#[derive(Parser)]
#[command(name = "ostium-trader-host")]
struct Args {
    /// Proving mode: "execute" (fast, no proof) or "prove" (full ZK proof)
    #[arg(long, default_value = "execute")]
    mode: String,
}

/// Trade data matching the guest program's Trade struct
#[derive(Serialize, Deserialize, Debug)]
struct Trade {
    trader: String,
    is_buy: bool,
    collateral: String,
    leverage: String,
    open_price: String,
    close_price: String,
    timestamp: String,
    funding: String,
    rollover: String,
}

/// Featured position matching the guest program's FeaturedPosition struct
#[derive(Serialize, Deserialize, Debug)]
struct FeaturedPosition {
    trader: String,
    trade_id: u64,
    pair_index: u32,
    is_buy: bool,
    leverage: String,
    collateral: String,
    entry_price: String,
    is_open: bool,
    timestamp: String,
}

/// Combined input matching the guest program's ProofInput struct
#[derive(Serialize, Deserialize, Debug)]
struct ProofInput {
    trades: Vec<Trade>,
    featured: FeaturedPosition,
}

/// JSON output structure
#[derive(Serialize)]
struct ProofOutput {
    success: bool,
    mode: String,
    metrics: MetricsOutput,
    featured: FeaturedOutput,
    proof: Option<String>,
    public_values: Option<String>,
    vkey_hash: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
struct MetricsOutput {
    trader: String,
    trade_count: u32,
    win_count: u32,
    total_pnl: f64,
    total_collateral: f64,
    start_timestamp: u64,
    end_timestamp: u64,
}

#[derive(Serialize)]
struct FeaturedOutput {
    trade_id: u64,
    pair_index: u32,
    is_buy: bool,
    leverage: f64,
    collateral: f64,
    entry_price: f64,
    is_open: bool,
    timestamp: u64,
}

fn main() {
    let args = Args::parse();

    // Read combined input JSON from stdin
    let mut input_str = String::new();
    std::io::stdin().read_to_string(&mut input_str).expect("Failed to read stdin");
    let input: ProofInput = serde_json::from_str(&input_str).expect("Failed to parse input JSON");

    eprintln!(
        "[sp1-host] Processing {} trades + featured position (tradeId={}) in '{}' mode",
        input.trades.len(),
        input.featured.trade_id,
        args.mode
    );

    // Create SP1 prover client
    let client = ProverClient::from_env();

    // Prepare stdin for the guest
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    match args.mode.as_str() {
        "execute" => {
            let (output, report) = client
                .execute(GUEST_ELF, &stdin)
                .run()
                .expect("Execution failed");

            let public_bytes = output.as_ref();
            eprintln!(
                "[sp1-host] Execution complete. Cycles: {}, public_values: {} bytes",
                report.total_instruction_count(),
                public_bytes.len()
            );

            let (_, vk) = client.setup(GUEST_ELF);

            let (metrics_out, featured_out) = decode_public_values(public_bytes);

            let result = ProofOutput {
                success: true,
                mode: "execute".to_string(),
                metrics: metrics_out,
                featured: featured_out,
                proof: None,
                public_values: Some(hex::encode(public_bytes)),
                vkey_hash: Some(vk.bytes32()),
                error: None,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        }
        "prove" => {
            let (pk, vk) = client.setup(GUEST_ELF);

            eprintln!("[sp1-host] Generating Groth16 proof...");

            let proof = client
                .prove(&pk, &stdin)
                .groth16()
                .run()
                .expect("Proving failed");

            let public_bytes = proof.public_values.as_ref();
            let (metrics_out, featured_out) = decode_public_values(public_bytes);

            // Verify locally before outputting
            client
                .verify(&proof, &vk)
                .expect("Local verification failed");

            eprintln!("[sp1-host] Proof generated and verified locally");

            let proof_bytes = proof.bytes();

            let result = ProofOutput {
                success: true,
                mode: "prove".to_string(),
                metrics: metrics_out,
                featured: featured_out,
                proof: Some(hex::encode(&proof_bytes)),
                public_values: Some(hex::encode(public_bytes)),
                vkey_hash: Some(vk.bytes32()),
                error: None,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        }
        other => {
            let result = ProofOutput {
                success: false,
                mode: other.to_string(),
                metrics: MetricsOutput {
                    trader: String::new(),
                    trade_count: 0,
                    win_count: 0,
                    total_pnl: 0.0,
                    total_collateral: 0.0,
                    start_timestamp: 0,
                    end_timestamp: 0,
                },
                featured: FeaturedOutput {
                    trade_id: 0,
                    pair_index: 0,
                    is_buy: false,
                    leverage: 0.0,
                    collateral: 0.0,
                    entry_price: 0.0,
                    is_open: false,
                    timestamp: 0,
                },
                proof: None,
                public_values: None,
                vkey_hash: None,
                error: Some(format!("Unknown mode: {}. Use 'execute' or 'prove'", other)),
            };
            println!("{}", serde_json::to_string(&result).unwrap());
            std::process::exit(1);
        }
    }
}

/// Decode the 110-byte big-endian public values committed by the guest.
///
/// Layout:
///   [0..20]   trader address (20 bytes)
///   [20..24]  trade_count (u32 BE)
///   [24..28]  win_count (u32 BE)
///   [28..36]  total_pnl (i64 BE)
///   [36..44]  total_collateral (u64 BE)
///   [44..52]  start_timestamp (u64 BE)
///   [52..60]  end_timestamp (u64 BE)
///   [60..68]  featured_trade_id (u64 BE)
///   [68..72]  featured_pair_index (u32 BE)
///   [72]      featured_is_buy (u8)
///   [73..77]  featured_leverage (u32 BE)
///   [77..85]  featured_collateral (u64 BE)
///   [85..101] featured_entry_price (u128 BE)
///   [101]     featured_is_open (u8)
///   [102..110] featured_timestamp (u64 BE)
fn decode_public_values(bytes: &[u8]) -> (MetricsOutput, FeaturedOutput) {
    assert!(
        bytes.len() >= 110,
        "Public values too short: {} bytes, expected 110",
        bytes.len()
    );

    // Aggregate metrics
    let mut trader = [0u8; 20];
    trader.copy_from_slice(&bytes[0..20]);

    let trade_count = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    let win_count = u32::from_be_bytes(bytes[24..28].try_into().unwrap());
    let total_pnl_micros = i64::from_be_bytes(bytes[28..36].try_into().unwrap());
    let total_collateral_micros = u64::from_be_bytes(bytes[36..44].try_into().unwrap());
    let start_timestamp = u64::from_be_bytes(bytes[44..52].try_into().unwrap());
    let end_timestamp = u64::from_be_bytes(bytes[52..60].try_into().unwrap());

    // Featured position
    let featured_trade_id = u64::from_be_bytes(bytes[60..68].try_into().unwrap());
    let featured_pair_index = u32::from_be_bytes(bytes[68..72].try_into().unwrap());
    let featured_is_buy = bytes[72] == 1;
    let featured_leverage_raw = u32::from_be_bytes(bytes[73..77].try_into().unwrap());
    let featured_collateral_micros = u64::from_be_bytes(bytes[77..85].try_into().unwrap());
    let featured_entry_price_raw = u128::from_be_bytes(bytes[85..101].try_into().unwrap());
    let featured_is_open = bytes[101] == 1;
    let featured_timestamp = u64::from_be_bytes(bytes[102..110].try_into().unwrap());

    let metrics = MetricsOutput {
        trader: format!("0x{}", hex::encode(trader)),
        trade_count,
        win_count,
        total_pnl: total_pnl_micros as f64 / 1_000_000.0,
        total_collateral: total_collateral_micros as f64 / 1_000_000.0,
        start_timestamp,
        end_timestamp,
    };

    let featured = FeaturedOutput {
        trade_id: featured_trade_id,
        pair_index: featured_pair_index,
        is_buy: featured_is_buy,
        leverage: featured_leverage_raw as f64 / 100.0,
        collateral: featured_collateral_micros as f64 / 1_000_000.0,
        entry_price: featured_entry_price_raw as f64 / 1e18,
        is_open: featured_is_open,
        timestamp: featured_timestamp,
    };

    (metrics, featured)
}
