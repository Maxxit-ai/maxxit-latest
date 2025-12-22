import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Home, Wallet, User, Plus, TrendingUp, Menu, BookOpen } from 'lucide-react';
import { Bot, BarChart3, FileText, Copy, Check, LogOut, X, AlertCircle } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import Image from 'next/image';
import { ethers } from 'ethers';

const ARBITRUM_ONE_CHAIN_ID = 42161;
const USDC_CONTRACT_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

export function Header() {
  const router = useRouter();
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isInitialBalanceLoad, setIsInitialBalanceLoad] = useState(true);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  // Monitor current network chain ID
  useEffect(() => {
    if (!window.ethereum) return;

    const handleChainChanged = (chainId: string) => {
      setCurrentChainId(parseInt(chainId, 16));
    };

    const handleConnect = async () => {
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        setCurrentChainId(parseInt(chainId, 16));
      } catch (error) {
        console.error('Failed to get chain ID:', error);
      }
    };

    // Get initial chain ID
    handleConnect();

    // Listen for chain changes
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const isOnArbitrum = currentChainId === ARBITRUM_ONE_CHAIN_ID;
  const needsNetworkSwitch = authenticated && currentChainId !== null && !isOnArbitrum;

  useEffect(() => {
    if (!authenticated || !isOnArbitrum) {
      setIsInitialBalanceLoad(true);
      setUsdcBalance(null);
    }
  }, [authenticated, isOnArbitrum]);

  // Fetch USDC balance using ethers.js contract call
  const fetchUsdcBalance = async (walletAddress: string, showLoadingState = false) => {
    if (!isOnArbitrum) {
      setUsdcBalance(null);
      return;
    }

    try {
      if (showLoadingState) {
        setIsLoadingBalance(true);
      }
      
      // Get provider from connected wallet
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);

      // Direct contract call to get balance
      const balance = await contract.balanceOf(walletAddress);
      const formattedBalance = ethers.utils.formatUnits(balance, 6); // USDC has 6 decimals

      setUsdcBalance(parseFloat(formattedBalance).toFixed(2));
    } catch (error) {
      console.error('Failed to fetch USDC balance:', error);
      setUsdcBalance(null);
    } finally {
      if (showLoadingState) {
        setIsLoadingBalance(false);
      }
    }
  };

  // Fetch USDC balance when on correct network and authenticated
  useEffect(() => {
    if (authenticated && isOnArbitrum && user?.wallet?.address) {
      const address = user.wallet.address;
      fetchUsdcBalance(address, isInitialBalanceLoad);
      if (isInitialBalanceLoad) {
        setIsInitialBalanceLoad(false);
      }
      
      const interval = setInterval(() => {
        fetchUsdcBalance(address, false);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated, isOnArbitrum, user?.wallet?.address]);

  const navLinks = [
    // { href: '/', label: 'Home', icon: Home, testId: 'nav-home' },
    { href: '/my-deployments', label: 'My Clubs', icon: Wallet, testId: 'nav-deployments' },
    { href: '/my-trades', label: 'My Trades', icon: TrendingUp, testId: 'nav-my-trades' },
    { href: '/lazy-trading', label: 'Lazy Trading', icon: Bot, testId: 'nav-lazy-trading' },
    { href: '/creator', label: 'Create Club', icon: User, testId: 'nav-my-agents' },
    { href: '/blog', label: 'Blog', icon: BookOpen, testId: 'nav-blog' },
    { href: '/docs', label: 'Docs', icon: FileText, testId: 'nav-docs' },
  ];

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isWalletModalOpen &&
        popupRef.current &&
        buttonRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsWalletModalOpen(false);
      }
    };

    if (isWalletModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isWalletModalOpen]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMobileMenuOpen &&
        mobileMenuRef.current &&
        mobileButtonRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        !mobileButtonRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobileMenuOpen]);

  // Collapse mobile menu when resizing up to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileMenuOpen]);

  // Handle switching to Arbitrum One network
  const handleSwitchToArbitrum = async () => {
    if (!window.ethereum) {
      console.error('Ethereum provider not found');
      return;
    }

    try {
      setIsSwitchingNetwork(true);
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa4b1' }], // 0xa4b1 is the hex for 42161 (Arbitrum One)
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xa4b1',
                chainName: 'Arbitrum One',
                rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                blockExplorerUrls: ['https://arbiscan.io'],
                nativeCurrency: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                },
              },
            ],
          });
        } catch (addError) {
          console.error('Failed to add Arbitrum network:', addError);
        }
      }
      console.error('Failed to switch network:', switchError);
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  const renderNavLinks = (onClick?: () => void) =>
    navLinks.map(({ href, label, icon: Icon, testId }) => {
      const isActive = router.pathname === href;
      return (
        <Link key={href} href={href}>
          <button
            onClick={onClick}
            className={`relative inline-flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors w-full text-left md:w-auto md:text-center group ${isActive
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            data-testid={testId}
          >
            <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-[var(--accent)]' : ''}`} />
            <span className="hidden sm:inline relative">{label}</span>
            <span className="sm:hidden relative">{label}</span>
            {isActive && (
              <>
                {/* Decorative underline with accent dot */}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-80"></span>
              </>
            )}
          </button>
        </Link>
      );
    });

  return (
    <header className="sticky py-4 top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg-deep)]/95 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center gap-2">
            {/* <div className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center">
              <span className="text-accent font-bold">M</span>
            </div>
            <span className="font-display text-xl tracking-wide" data-testid="text-header-brand">
              MAXXIT
            </span> */}
            <Image src="/logo.png" alt="Maxxit" width={100} height={100} />
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <nav className="hidden lg:flex items-center gap-1">
              {renderNavLinks()}
              <Link href="/#agents">
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] transition-colors ml-2"
                  data-testid="nav-create"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Join</span>
                </button>
              </Link>

              {/* Wallet Connection */}
              {ready && (
                <div className="relative ml-2">
                  {authenticated ? (
                    <>
                      {needsNetworkSwitch ? (
                        <button
                          onClick={handleSwitchToArbitrum}
                          disabled={isSwitchingNetwork}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          data-testid="button-switch-network"
                        >
                          {isSwitchingNetwork ? 'Switching...' : 'Switch to Arbitrum'}
                        </button>
                      ) : (
                        <button
                          ref={buttonRef}
                          onClick={() => setIsWalletModalOpen(!isWalletModalOpen)}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--accent)] text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/10 transition-colors"
                          data-testid="button-disconnect-wallet"
                        >
                          <Wallet className="h-4 w-4" />
                          <div className="hidden sm:flex items-center gap-2">
                            {isLoadingBalance ? (
                              <span className="text-xs font-normal">Loading...</span>
                            ) : (
                              <>
                                {usdcBalance && (
                                  <span className="text-xs font-normal">${usdcBalance}</span>
                                )}
                                <span className="font-mono">
                                  {user?.wallet?.address ?
                                    `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` :
                                    'WALLET'}
                                </span>
                              </>
                            )}
                          </div>
                          <span className="sm:hidden font-mono">
                            {user?.wallet?.address ?
                              `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` :
                              'WALLET'}
                          </span>
                        </button>
                      )}

                      {/* Wallet Address Popup */}
                      {isWalletModalOpen && !needsNetworkSwitch && (
                        <div
                          ref={popupRef}
                          className="absolute right-0 top-full mt-2 w-80 z-50 border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg"
                        >
                          <div className="p-4 space-y-4">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-[var(--accent)]" />
                                <h3 className="text-sm font-bold">WALLET</h3>
                              </div>
                              <button
                                onClick={() => setIsWalletModalOpen(false)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Address Display */}
                            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border)]">
                              <p className="data-label mb-2">CONNECTED ACCOUNT</p>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="font-mono text-xs break-all text-[var(--text-primary)] leading-relaxed mb-2">
                                    {user?.wallet?.address || 'No address'}
                                  </p>
                                  <div className="text-xs text-[var(--text-secondary)]">
                                    <p className="mb-1">USDC Balance</p>
                                    <p className="font-mono text-sm font-bold text-[var(--text-primary)]">
                                      {isLoadingBalance ? 'Loading...' : (usdcBalance ? `$${usdcBalance}` : '$0.00')}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                    if (user?.wallet?.address) {
                                      await navigator.clipboard.writeText(user.wallet.address);
                                      setCopied(true);
                                      setTimeout(() => setCopied(false), 2000);
                                    }
                                  }}
                                  className="flex-shrink-0 p-1.5 hover:bg-[var(--bg-deep)] transition-colors"
                                  title="Copy address"
                                >
                                  {copied ? (
                                    <Check className="h-4 w-4 text-[var(--accent)]" />
                                  ) : (
                                    <Copy className="h-4 w-4 text-[var(--text-muted)]" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Sign Out Button */}
                            <button
                              onClick={() => {
                                logout();
                                setIsWalletModalOpen(false);
                              }}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-[var(--danger)] text-[var(--danger)] text-sm font-bold hover:bg-[var(--danger)]/10 transition-colors"
                            >
                              <LogOut className="h-4 w-4" />
                              LOG OUT
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={login}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--accent)] text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/10 transition-colors"
                      data-testid="button-connect-wallet"
                    >
                      <Wallet className="h-4 w-4" />
                      <span className="hidden sm:inline">CONNECT</span>
                    </button>
                  )}
                </div>
              )}
            </nav>

            {/* Mobile menu toggle */}
            <button
              ref={mobileButtonRef}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {isMobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="md:hidden mt-3 border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg"
          >
            <div className="flex flex-col divide-y divide-[var(--border)]">
              <div className="flex flex-col p-2">{renderNavLinks(() => setIsMobileMenuOpen(false))}</div>
              <div className="p-3 flex flex-col gap-3">
                <Link href="/create-agent">
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] transition-colors"
                    data-testid="nav-create"
                  >
                    <Plus className="h-4 w-4" />
                    Create
                  </button>
                </Link>
                {ready && (
                  <>
                    {authenticated ? (
                      <>
                        {needsNetworkSwitch ? (
                          <button
                            onClick={handleSwitchToArbitrum}
                            disabled={isSwitchingNetwork}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            data-testid="button-switch-network-mobile"
                          >
                            {isSwitchingNetwork ? 'Switching...' : 'Switch to Arbitrum One'}
                          </button>
                        ) : (
                          <div className="flex flex-col gap-2 border border-[var(--border)] p-3 bg-[var(--bg-elevated)]">
                            <div className="text-xs text-[var(--text-muted)]">Connected</div>
                            <div className="font-mono text-xs text-[var(--text-primary)] break-all mb-2">
                              {user?.wallet?.address || 'No address'}
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] mb-3">
                              <p className="mb-1">USDC Balance</p>
                              <p className="font-mono text-sm font-bold text-[var(--text-primary)]">
                                {isLoadingBalance ? 'Loading...' : (usdcBalance ? `$${usdcBalance}` : '$0.00')}
                              </p>
                            </div>

                            <div className="flex flex-col gap-2">
                              <button
                                onClick={async () => {
                                  if (user?.wallet?.address) {
                                    await navigator.clipboard.writeText(user.wallet.address);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                  }
                                }}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-deep)] transition-colors"
                              >
                                {copied ? <Check className="h-4 w-4 text-[var(--accent)]" /> : <Copy className="h-4 w-4" />}
                                {copied ? 'Copied' : 'Copy'}
                              </button>
                              <button
                                onClick={() => {
                                  logout();
                                  setIsMobileMenuOpen(false);
                                }}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-[var(--danger)] text-[var(--danger)] text-sm font-bold hover:bg-[var(--danger)]/10 transition-colors"
                              >
                                <LogOut className="h-4 w-4" />
                                Log out
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          login();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--accent)] text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/10 transition-colors"
                        data-testid="button-connect-wallet"
                      >
                        <Wallet className="h-4 w-4" />
                        Connect wallet
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
