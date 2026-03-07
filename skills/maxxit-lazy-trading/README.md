# Maxxit Lazy Trading Skill

Execute perpetual futures trades on Ostium, Aster, and Avantis through Maxxit's Lazy Trading API.

## Installation

### Via ClawHub CLI
```bash
npx clawhub@latest install maxxit-lazy-trading
```

### Manual Installation
Copy the `maxxit-lazy-trading` folder to:
- Global: `~/.openclaw/skills/`
- Workspace: `<project>/skills/`

## Configuration

Set these environment variables:

```bash
export MAXXIT_API_KEY="lt_your_api_key_here"
export MAXXIT_API_URL="https://maxxit.ai"
```

## Quick Start

1. **Get an API Key**: 
   - Visit [maxxit.ai/lazy-trading](https://maxxit.ai/lazy-trading)
   - Connect your wallet
   - Complete the setup wizard
   - Generate an API key from your [dashboard](https://www.maxxit.ai/dashboard)

2. **Configure**: Set environment variables

3. **Use**: Ask your assistant to send trading signals!

## Example Usage

```
"Send a trading signal: Long ETH 5x leverage at 3200"

"Check my lazy trading account status"

"Execute a short on BTC with 10x leverage, TP 60000, SL 68000"
```

## Supported Venues

- **Ostium** - Perpetual futures on Arbitrum
- **Aster DEX** - Perpetual futures on BNB Chain (testnet setup in Maxxit)
- **Avantis DEX** - Perpetual futures on Base mainnet
- **Alpha Marketplace** - Trustless ZK-verified trading signals (Arbitrum Sepolia testnet)

## Built-in Strategy Scripts

- `ema-strategy.py` - EMA crossover trend-following strategy
- `rsi-bollinger-strategy.py` - RSI + Bollinger Band mean reversion strategy
- `donchian-adx-strategy.py` - Donchian breakout with ADX trend filter

Each script fetches Binance klines, derives signals locally, and routes execution through the Maxxit Lazy Trading API.

## Links

- [Maxxit App](https://maxxit.ai)
- [Lazy Trading Setup](https://maxxit.ai/lazy-trading)
- [GitHub](https://github.com/Maxxit-ai/maxxit-latest)
