import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

// RPC endpoints
const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

// Common token addresses on Arbitrum
const TOKENS: Record<string, { address: string; decimals: number }> = {
  USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
  USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
  ARB: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

interface WalletBalance {
  address: string;
  type: 'profit_receiver' | 'safe_wallet' | 'agent_address';
  agentId?: string;
  agentName?: string;
  deploymentId?: string;
  userWallet?: string;
  ethBalance: string;
  tokenBalances: Record<string, string>;
}

async function getWalletBalances(
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<{ eth: string; tokens: Record<string, string> }> {
  try {
    // Get ETH balance
    const ethBalance = await provider.getBalance(address);
    const ethFormatted = ethers.utils.formatEther(ethBalance);

    // Get token balances
    const tokenBalances: Record<string, string> = {};

    await Promise.all(
      Object.entries(TOKENS).map(async ([symbol, { address: tokenAddress, decimals }]) => {
        try {
          const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const balance = await contract.balanceOf(address);
          const formatted = ethers.utils.formatUnits(balance, decimals);
          if (parseFloat(formatted) > 0) {
            tokenBalances[symbol] = formatted;
          }
        } catch (err) {
          // Token balance fetch failed, skip
        }
      })
    );

    return { eth: ethFormatted, tokens: tokenBalances };
  } catch (error) {
    console.error(`Failed to fetch balances for ${address}:`, error);
    return { eth: '0', tokens: {} };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC);
    const walletBalances: WalletBalance[] = [];

    // Get all agents with their profit receiver addresses
    const agents = await prisma.agents.findMany({
      select: {
        id: true,
        name: true,
        profit_receiver_address: true,
      },
    });

    // Get all deployments with safe wallets
    const deployments = await prisma.agent_deployments.findMany({
      select: {
        id: true,
        agent_id: true,
        user_wallet: true,
        safe_wallet: true,
      },
      where: {
        safe_wallet: { not: undefined },
      },
    });

    // Get all user agent addresses (Hyperliquid/Ostium agent wallets)
    const userAgentAddresses = await prisma.user_agent_addresses.findMany({
      select: {
        user_wallet: true,
        hyperliquid_agent_address: true,
        ostium_agent_address: true,
      },
    });

    // Collect unique addresses to fetch
    const addressesToFetch = new Set<string>();

    agents.forEach((agent) => {
      if (agent.profit_receiver_address) {
        addressesToFetch.add(agent.profit_receiver_address.toLowerCase());
      }
    });

    deployments.forEach((deployment) => {
      if (deployment.safe_wallet) {
        addressesToFetch.add(deployment.safe_wallet.toLowerCase());
      }
    });

    userAgentAddresses.forEach((ua) => {
      if (ua.hyperliquid_agent_address) {
        addressesToFetch.add(ua.hyperliquid_agent_address.toLowerCase());
      }
      if (ua.ostium_agent_address) {
        addressesToFetch.add(ua.ostium_agent_address.toLowerCase());
      }
    });

    // Fetch balances for all unique addresses (batch to avoid rate limiting)
    const addressArray = Array.from(addressesToFetch);
    const balanceMap = new Map<string, { eth: string; tokens: Record<string, string> }>();

    // Process in batches of 10
    const batchSize = 10;
    for (let i = 0; i < addressArray.length; i += batchSize) {
      const batch = addressArray.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((addr) => getWalletBalances(provider, addr))
      );
      batch.forEach((addr, idx) => {
        balanceMap.set(addr, results[idx]);
      });
    }

    // Map back to wallet info
    agents.forEach((agent) => {
      const addr = agent.profit_receiver_address.toLowerCase();
      const balances = balanceMap.get(addr);
      if (balances) {
        walletBalances.push({
          address: agent.profit_receiver_address,
          type: 'profit_receiver',
          agentId: agent.id,
          agentName: agent.name,
          ethBalance: balances.eth,
          tokenBalances: balances.tokens,
        });
      }
    });

    deployments.forEach((deployment) => {
      if (deployment.safe_wallet) {
        const addr = deployment.safe_wallet.toLowerCase();
        const balances = balanceMap.get(addr);
        const agent = agents.find((a) => a.id === deployment.agent_id);
        if (balances) {
          walletBalances.push({
            address: deployment.safe_wallet,
            type: 'safe_wallet',
            agentId: deployment.agent_id,
            agentName: agent?.name,
            deploymentId: deployment.id,
            userWallet: deployment.user_wallet,
            ethBalance: balances.eth,
            tokenBalances: balances.tokens,
          });
        }
      }
    });

    userAgentAddresses.forEach((ua) => {
      if (ua.hyperliquid_agent_address) {
        const addr = ua.hyperliquid_agent_address.toLowerCase();
        const balances = balanceMap.get(addr);
        if (balances) {
          walletBalances.push({
            address: ua.hyperliquid_agent_address,
            type: 'agent_address',
            userWallet: ua.user_wallet,
            ethBalance: balances.eth,
            tokenBalances: balances.tokens,
          });
        }
      }
      if (ua.ostium_agent_address) {
        const addr = ua.ostium_agent_address.toLowerCase();
        const balances = balanceMap.get(addr);
        if (balances) {
          walletBalances.push({
            address: ua.ostium_agent_address,
            type: 'agent_address',
            userWallet: ua.user_wallet,
            ethBalance: balances.eth,
            tokenBalances: balances.tokens,
          });
        }
      }
    });

    // Calculate totals
    const totals = {
      totalEth: walletBalances.reduce((sum, w) => sum + parseFloat(w.ethBalance || '0'), 0),
      totalByToken: {} as Record<string, number>,
      walletCount: walletBalances.length,
    };

    walletBalances.forEach((w) => {
      Object.entries(w.tokenBalances).forEach(([symbol, balance]) => {
        totals.totalByToken[symbol] = (totals.totalByToken[symbol] || 0) + parseFloat(balance);
      });
    });

    res.status(200).json({
      wallets: walletBalances,
      totals,
    });
  } catch (error: any) {
    console.error('[Admin Wallet Balances] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch wallet balances' });
  } finally {
    await prisma.$disconnect();
  }
}
