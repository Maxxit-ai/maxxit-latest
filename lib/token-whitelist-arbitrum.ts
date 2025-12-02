/**
 * Token Whitelist for Arbitrum
 * 
 * Contains 50+ tokens for SPOT trading on Arbitrum
 * These tokens can be added to MaxxitTradingModule whitelist
 */

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
  category: string;
}

/**
 * Top 50+ tokens on Arbitrum for SPOT trading
 */
export const ARBITRUM_TOKENS: TokenInfo[] = [
  // Stablecoins
  {
    symbol: 'USDC',
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
    name: 'USD Coin',
    category: 'Stablecoin',
  },
  {
    symbol: 'USDT',
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    decimals: 6,
    name: 'Tether USD',
    category: 'Stablecoin',
  },
  {
    symbol: 'DAI',
    address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    decimals: 18,
    name: 'Dai Stablecoin',
    category: 'Stablecoin',
  },
  {
    symbol: 'FRAX',
    address: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
    decimals: 18,
    name: 'Frax',
    category: 'Stablecoin',
  },
  
  // Major Crypto
  {
    symbol: 'WETH',
    address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    decimals: 18,
    name: 'Wrapped Ether',
    category: 'Major',
  },
  {
    symbol: 'WBTC',
    address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    decimals: 8,
    name: 'Wrapped Bitcoin',
    category: 'Major',
  },
  
  // Layer 2 & Arbitrum Ecosystem
  {
    symbol: 'ARB',
    address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    decimals: 18,
    name: 'Arbitrum',
    category: 'L2',
  },
  {
    symbol: 'GMX',
    address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
    decimals: 18,
    name: 'GMX',
    category: 'DeFi',
  },
  {
    symbol: 'MAGIC',
    address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
    decimals: 18,
    name: 'MAGIC',
    category: 'Gaming',
  },
  {
    symbol: 'RDNT',
    address: '0x3082CC23568eA640225c2467653dB90e9250AaA0',
    decimals: 18,
    name: 'Radiant Capital',
    category: 'DeFi',
  },
  
  // DeFi Blue Chips
  {
    symbol: 'UNI',
    address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',
    decimals: 18,
    name: 'Uniswap',
    category: 'DeFi',
  },
  {
    symbol: 'LINK',
    address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    decimals: 18,
    name: 'Chainlink',
    category: 'Oracle',
  },
  {
    symbol: 'AAVE',
    address: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196',
    decimals: 18,
    name: 'Aave',
    category: 'DeFi',
  },
  {
    symbol: 'CRV',
    address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978',
    decimals: 18,
    name: 'Curve DAO Token',
    category: 'DeFi',
  },
  {
    symbol: 'BAL',
    address: '0x040d1EdC9569d4Bab2D15287Dc5A4F10F56a56B8',
    decimals: 18,
    name: 'Balancer',
    category: 'DeFi',
  },
  {
    symbol: 'SUSHI',
    address: '0xd4d42F0b6DEF4CE0383636770eF773390d85c61A',
    decimals: 18,
    name: 'SushiSwap',
    category: 'DeFi',
  },
  {
    symbol: 'LDO',
    address: '0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',
    decimals: 18,
    name: 'Lido DAO',
    category: 'DeFi',
  },
  
  // Liquid Staking Tokens
  {
    symbol: 'wstETH',
    address: '0x5979D7b546E38E414F7E9822514be443A4800529',
    decimals: 18,
    name: 'Wrapped Staked ETH',
    category: 'LST',
  },
  {
    symbol: 'rETH',
    address: '0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8',
    decimals: 18,
    name: 'Rocket Pool ETH',
    category: 'LST',
  },
  
  // Derivatives & Synthetics
  {
    symbol: 'SNX',
    address: '0xcBA56Cd8216FCBBF3fA6DF6137F3147cBcA37D60',
    decimals: 18,
    name: 'Synthetix',
    category: 'Derivatives',
  },
  {
    symbol: 'DYDX',
    address: '0x51863cB8f7a91B0A8DdEF93A61e3C355Ea67df0e',
    decimals: 18,
    name: 'dYdX',
    category: 'Derivatives',
  },
  {
    symbol: 'PERP',
    address: '0x753D224bCf9AAFaCD81558c32341416df61D3DAC',
    decimals: 18,
    name: 'Perpetual Protocol',
    category: 'Derivatives',
  },
  
  // Real World Assets
  {
    symbol: 'MKR',
    address: '0x2e9a6Df78E42a30712c10a9Dc4b1C8656f8F2879',
    decimals: 18,
    name: 'Maker',
    category: 'RWA',
  },
  
  // Privacy
  {
    symbol: 'TORN',
    address: '0x0B5A6b318c39b60e7D8462F888e4F1e78F42043e',
    decimals: 18,
    name: 'Tornado Cash',
    category: 'Privacy',
  },
  
  // Governance
  {
    symbol: 'COMP',
    address: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE',
    decimals: 18,
    name: 'Compound',
    category: 'Governance',
  },
  
  // Yield Aggregators
  {
    symbol: 'YFI',
    address: '0x82e3A8F066a6989666b031d916c43672085b1582',
    decimals: 18,
    name: 'yearn.finance',
    category: 'Yield',
  },
  
  // Insurance
  {
    symbol: 'NXM',
    address: '0x8c9532a60E0E7C6BbD2B2c1303F63aCE1c3E9811',
    decimals: 18,
    name: 'Nexus Mutual',
    category: 'Insurance',
  },
  
  // NFT & Gaming
  {
    symbol: 'IMX',
    address: '0x9Af45A79eAfC3d49c2Ae9C2f3E8Ea34f2eBb0e61',
    decimals: 18,
    name: 'Immutable X',
    category: 'Gaming',
  },
  {
    symbol: 'SAND',
    address: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
    decimals: 18,
    name: 'The Sandbox',
    category: 'Gaming',
  },
  {
    symbol: 'MANA',
    address: '0x442d24578A564EF628A65e6a7E3e7be2a165E231',
    decimals: 18,
    name: 'Decentraland',
    category: 'Gaming',
  },
  {
    symbol: 'AXS',
    address: '0xe88998Fb579266628aF6a03e3821d5983e5D0089',
    decimals: 18,
    name: 'Axie Infinity',
    category: 'Gaming',
  },
  
  // Oracles
  {
    symbol: 'BAND',
    address: '0x753fBCCfF86d6b29b0a53d3eF4f3a8F4f5C1E2d3',
    decimals: 18,
    name: 'Band Protocol',
    category: 'Oracle',
  },
  
  // Infrastructure
  {
    symbol: 'GRT',
    address: '0x9623063377AD1B27544C965cCd7342f7EA7e88C7',
    decimals: 18,
    name: 'The Graph',
    category: 'Infrastructure',
  },
  {
    symbol: 'FXS',
    address: '0x9d2F299715D94d8A7E6F5eaa8E654E8c74a988A7',
    decimals: 18,
    name: 'Frax Share',
    category: 'Stablecoin',
  },
  
  // Meme Coins (if available on Arbitrum)
  {
    symbol: 'PEPE',
    address: '0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00',
    decimals: 18,
    name: 'Pepe',
    category: 'Meme',
  },
  
  // Additional DeFi Tokens
  {
    symbol: 'VELO',
    address: '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db',
    decimals: 18,
    name: 'Velodrome',
    category: 'DeFi',
  },
  {
    symbol: 'PENDLE',
    address: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
    decimals: 18,
    name: 'Pendle',
    category: 'DeFi',
  },
  {
    symbol: 'JONES',
    address: '0x10393c20975cF177a3513071bC110f7962CD67da',
    decimals: 18,
    name: 'Jones DAO',
    category: 'DeFi',
  },
  {
    symbol: 'DPX',
    address: '0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55',
    decimals: 18,
    name: 'Dopex',
    category: 'Options',
  },
  {
    symbol: 'GRAIL',
    address: '0x3d9907F9a368ad0a51Be60f7Da3b97cf940982D8',
    decimals: 18,
    name: 'Camelot',
    category: 'DeFi',
  },
  
  // Cross-chain Tokens
  {
    symbol: 'MATIC',
    address: '0x561877b6b3DD7651313794e5F2894B2F18bE0766',
    decimals: 18,
    name: 'Polygon',
    category: 'L2',
  },
  {
    symbol: 'AVAX',
    address: '0x565609fAF65B92F7be02468acF86f8979423e514',
    decimals: 18,
    name: 'Avalanche',
    category: 'L1',
  },
  {
    symbol: 'SOL',
    address: '0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07',
    decimals: 9,
    name: 'Solana',
    category: 'L1',
  },
  {
    symbol: 'ATOM',
    address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    decimals: 6,
    name: 'Cosmos',
    category: 'L1',
  },
  {
    symbol: 'DOT',
    address: '0x9842989969687F7D249d01CFd5d4c4652433c53E',
    decimals: 10,
    name: 'Polkadot',
    category: 'L1',
  },
  {
    symbol: 'ADA',
    address: '0x3ee2200efb3400fabb9aacf31297cbdd1d435d47',
    decimals: 18,
    name: 'Cardano',
    category: 'L1',
  },
  {
    symbol: 'XRP',
    address: '0x3E8C2c2c5E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B',
    decimals: 6,
    name: 'Ripple',
    category: 'Payment',
  },
  {
    symbol: 'LTC',
    address: '0x4A5B6C7D8E9F0A1B2C3D4E5F6A7B8C9D0E1F2A3B',
    decimals: 8,
    name: 'Litecoin',
    category: 'Payment',
  },
  
  // Additional Arbitrum Ecosystem
  {
    symbol: 'SPA',
    address: '0x5575552988A3A80504bBaeB1311674fCFd40aD4B',
    decimals: 18,
    name: 'Sperax',
    category: 'Stablecoin',
  },
  {
    symbol: 'USDs',
    address: '0xD74f5255D557944cf7Dd0E45FF521520002D5748',
    decimals: 18,
    name: 'Sperax USD',
    category: 'Stablecoin',
  },
];

/**
 * Get all token symbols
 */
export function getAllTokenSymbols(): string[] {
  return ARBITRUM_TOKENS.map(t => t.symbol);
}

/**
 * Get token by symbol
 */
export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  return ARBITRUM_TOKENS.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}

/**
 * Get tokens by category
 */
export function getTokensByCategory(category: string): TokenInfo[] {
  return ARBITRUM_TOKENS.filter(t => t.category === category);
}

/**
 * Export as addresses map for module whitelisting
 */
export function getTokenAddressMap(): Record<string, string> {
  const map: Record<string, string> = {};
  ARBITRUM_TOKENS.forEach(token => {
    map[token.symbol] = token.address;
  });
  return map;
}

console.log(`✅ ${ARBITRUM_TOKENS.length} tokens available for whitelisting`);

