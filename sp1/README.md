# SP1 ZK Prover for Ostium Alpha Marketplace

## Architecture

```
TypeScript (lib/zk-prover.ts) → spawns → Rust Host (sp1/script) → runs → Rust Guest (sp1/program)
                                                                           ↓
                                                                    Proof + Metrics JSON
                                                                           ↓
                                                                  Verify on Arbitrum Sepolia
                                                                  (SP1VerifierGateway — pre-deployed)
```

## Setup

### 1. Install SP1

```bash
curl -L https://sp1up.dev | bash
sp1up
```

### 2. Build the guest program

```bash
cd sp1/program
cargo prove build
```

### 3. Build the host

```bash
cd sp1/script
cargo build --release
```

### 4. Test (execute mode — fast, no proof)

```bash
echo '[{"trader":"0xabc...","is_buy":true,"collateral":"1000000","leverage":"5000","open_price":"68000000000000000000000","close_price":"69000000000000000000000","timestamp":"1700000000","funding":"0","rollover":"0"}]' | cargo run --release -- --mode execute
```

### 5. Generate real proof (Groth16)

```bash
echo '<trades_json>' | cargo run --release -- --mode prove
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SP1_PRIVATE_KEY` | Private key for Succinct Network (hosted proving) |
| `SP1_PROVER_MODE` | `execute` (fast/test) or `prove` (ZK proof) |

## Files

| File | Purpose |
|------|---------|
| `program/src/main.rs` | Guest — computes metrics inside zkVM |
| `script/src/main.rs` | Host — feeds data, generates proof, outputs JSON |
| `Cargo.toml` | Workspace config |
