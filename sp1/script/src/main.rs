//! Ostium Trader Proof — SP1 Host Script
//!
//! This host program:
//! 1. Reads trade data as JSON from stdin (piped from TypeScript)
//! 2. Executes the guest program in SP1's zkVM
//! 3. Generates a proof (Groth16 for on-chain, or mock for testing)
//! 4. Outputs the proof and public values as JSON to stdout
//!
//! Usage:
//!   echo '<trades_json>' | cargo run --release -- --mode execute
//!   echo '<trades_json>' | cargo run --release -- --mode prove
//!
//! Modes:
//!   execute  — Run the guest program without generating a proof (fast, for testing)
//!   prove    — Generate a full ZK proof (slow, for production)

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

/// Output metrics from the guest program
#[derive(Serialize, Deserialize, Debug)]
struct TraderMetrics {
    trader: [u8; 20],
    trade_count: u32,
    win_count: u32,
    total_pnl_micros: i64,
    total_collateral_micros: u64,
    start_timestamp: u64,
    end_timestamp: u64,
}

/// JSON output structure
#[derive(Serialize)]
struct ProofOutput {
    success: bool,
    mode: String,
    metrics: MetricsOutput,
    proof: Option<String>,      // hex-encoded proof bytes
    public_values: Option<String>, // hex-encoded public values
    vkey_hash: Option<String>,  // verifying key hash
    error: Option<String>,
}

#[derive(Serialize)]
struct MetricsOutput {
    trader: String,
    trade_count: u32,
    win_count: u32,
    total_pnl: f64,         // PnL in USDC (human-readable)
    total_collateral: f64,  // Collateral in USDC (human-readable)
    start_timestamp: u64,
    end_timestamp: u64,
}

fn main() {
    let args = Args::parse();

    // Read trades JSON from stdin
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("Failed to read stdin");
    let trades: Vec<Trade> = serde_json::from_str(&input).expect("Failed to parse trades JSON");

    eprintln!("[sp1-host] Processing {} trades in '{}' mode", trades.len(), args.mode);

    // Create SP1 prover client
    let client = ProverClient::from_env();

    // Prepare stdin for the guest
    let mut stdin = SP1Stdin::new();
    stdin.write(&trades);

    match args.mode.as_str() {
        "execute" => {
            // Execute without proof (fast, for testing)
            let (mut output, report) = client
                .execute(GUEST_ELF, &stdin)
                .run()
                .expect("Execution failed");

            let metrics: TraderMetrics = output.read();

            eprintln!("[sp1-host] Execution complete. Cycles: {}", report.total_instruction_count());

            let (_, vk) = client.setup(GUEST_ELF);

            let result = ProofOutput {
                success: true,
                mode: "execute".to_string(),
                metrics: to_metrics_output(&metrics),
                proof: None,
                public_values: Some(hex::encode(output.as_ref())),
                vkey_hash: Some(vk.bytes32()),
                error: None,
            };

            println!("{}", serde_json::to_string(&result).unwrap());
        }
        "prove" => {
            // Generate full Groth16 proof for on-chain verification
            let (pk, vk) = client.setup(GUEST_ELF);

            eprintln!("[sp1-host] Generating Groth16 proof...");

            let proof = client
                .prove(&pk, &stdin)
                .groth16()
                .run()
                .expect("Proving failed");

            let mut public_values = proof.public_values.clone();
            let metrics: TraderMetrics = public_values.read();

            // Verify locally before outputting
            client
                .verify(&proof, &vk)
                .expect("Local verification failed");

            eprintln!("[sp1-host] Proof generated and verified locally");

            // proof.bytes() returns the compact on-chain format:
            // [4-byte groth16 vkey hash prefix] ++ [encoded proof]
            let proof_bytes = proof.bytes();

            let result = ProofOutput {
                success: true,
                mode: "prove".to_string(),
                metrics: to_metrics_output(&metrics),
                proof: Some(hex::encode(&proof_bytes)),
                public_values: Some(hex::encode(proof.public_values.as_ref())),
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

fn to_metrics_output(m: &TraderMetrics) -> MetricsOutput {
    MetricsOutput {
        trader: format!("0x{}", hex::encode(m.trader)),
        trade_count: m.trade_count,
        win_count: m.win_count,
        total_pnl: m.total_pnl_micros as f64 / 1_000_000.0,
        total_collateral: m.total_collateral_micros as f64 / 1_000_000.0,
        start_timestamp: m.start_timestamp,
        end_timestamp: m.end_timestamp,
    }
}
