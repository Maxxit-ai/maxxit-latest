import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Home, Wallet, User, Plus, TrendingUp, Menu, BookOpen, ChevronDown, Activity, Coins } from 'lucide-react';
import { Bot, BarChart3, FileText, Copy, Check, LogOut, X, AlertCircle, Sparkles, BookMarked } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import Image from 'next/image';
import { ethers } from 'ethers';

// Set this to true for testing on Sepolia, false for Mainnet
const IS_TESTNET = process.env.NEXT_PUBLIC_USE_TESTNET === 'true';

const NETWORKS = {
  MAINNET: {
    chainId: 42161,
    chainName: 'Arbitrum One',
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    explorer: 'https://arbiscan.io',
    rpc: 'https://arb1.arbitrum.io/rpc',
    hexId: '0xa4b1'
  },
  TESTNET: {
    chainId: 421614,
    chainName: 'Arbitrum Sepolia',
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    explorer: 'https://sepolia.arbiscan.io',
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    hexId: '0x66eee' // 421614 in hex
  }
};

const ACTIVE_NETWORK = IS_TESTNET ? NETWORKS.TESTNET : NETWORKS.MAINNET;
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
  const [isPortfolioOpen, setIsPortfolioOpen] = useState(false);
  const [isTradingOpen, setIsTradingOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const portfolioRef = useRef<HTMLDivElement>(null);
  const portfolioButtonRef = useRef<HTMLButtonElement>(null);
  const tradingRef = useRef<HTMLDivElement>(null);
  const tradingButtonRef = useRef<HTMLButtonElement>(null);
  const resourcesRef = useRef<HTMLDivElement>(null);
  const resourcesButtonRef = useRef<HTMLButtonElement>(null);

  // Credit balance state
  const [creditBalance, setCreditBalance] = useState<string | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const creditFetchedRef = useRef(false);

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

  const isOnArbitrum = currentChainId === ACTIVE_NETWORK.chainId;
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
      const contract = new ethers.Contract(ACTIVE_NETWORK.usdcAddress, USDC_ABI, provider);

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

  // Fetch credit balance (optimized - only once per mount + 60s polling)
  const fetchCreditBalance = async (walletAddress: string, showLoader = false) => {
    try {
      if (showLoader) setIsLoadingCredits(true);
      const res = await fetch(`/api/user/credits/balance?wallet=${walletAddress}`);
      const data = await res.json();
      if (data.balance !== undefined) {
        const bal = parseFloat(data.balance);
        setCreditBalance(isNaN(bal) ? '0' : bal.toLocaleString());
      }
    } catch (error) {
      console.error('Failed to fetch credit balance:', error);
    } finally {
      if (showLoader) setIsLoadingCredits(false);
    }
  };

  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      const address = user.wallet.address;
      // Only fetch with loader on first load
      if (!creditFetchedRef.current) {
        fetchCreditBalance(address, true);
        creditFetchedRef.current = true;
      }
      // Poll every 60 seconds silently
      const interval = setInterval(() => {
        fetchCreditBalance(address, false);
      }, 60000);
      return () => clearInterval(interval);
    } else {
      setCreditBalance(null);
      creditFetchedRef.current = false;
    }
  }, [authenticated, user?.wallet?.address]);

  const navLinks = [{ href: '/', label: 'Home', icon: Home, testId: 'nav-home' }];

  const portfolioItems = [
    { href: '/dashboard', label: 'Dashboard', icon: Activity, testId: 'nav-dashboard' },
    { href: '/my-deployments', label: 'My Clubs', icon: Wallet, testId: 'nav-deployments' },
    { href: '/my-trades', label: 'My Trades', icon: TrendingUp, testId: 'nav-my-trades' },
  ];

  const tradingItems = [
    { href: '/lazy-trading', label: 'Lazy Trading', icon: Bot, testId: 'nav-lazy-trading' },
    { href: '/creator', label: 'Create Club', icon: User, testId: 'nav-my-agents' },
  ];

  const resourcesItems = [
    { href: '/blog', label: 'Blog', icon: BookOpen, testId: 'nav-blog' },
    { href: '/docs', label: 'Docs', icon: FileText, testId: 'nav-docs' },
    { href: '/user-manual', label: 'User Manual', icon: BookMarked, testId: 'nav-user-manual' },
    { href: '/pricing', label: 'Pricing', icon: Sparkles, testId: 'nav-pricing' },
  ];

  const isPortfolioActive = router.pathname === '/dashboard' || router.pathname === '/my-deployments' || router.pathname === '/my-trades';
  const isTradingActive = router.pathname === '/lazy-trading' || router.pathname === '/creator';
  const isResourcesActive = router.pathname === '/blog' || router.pathname === '/docs' || router.pathname === '/user-manual' || router.pathname === '/pricing';

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

  // Close portfolio dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isPortfolioOpen &&
        portfolioRef.current &&
        portfolioButtonRef.current &&
        !portfolioRef.current.contains(event.target as Node) &&
        !portfolioButtonRef.current.contains(event.target as Node)
      ) {
        setIsPortfolioOpen(false);
      }
    };

    if (isPortfolioOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPortfolioOpen]);

  // Close trading dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isTradingOpen &&
        tradingRef.current &&
        tradingButtonRef.current &&
        !tradingRef.current.contains(event.target as Node) &&
        !tradingButtonRef.current.contains(event.target as Node)
      ) {
        setIsTradingOpen(false);
      }
    };

    if (isTradingOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isTradingOpen]);

  // Close resources dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isResourcesOpen &&
        resourcesRef.current &&
        resourcesButtonRef.current &&
        !resourcesRef.current.contains(event.target as Node) &&
        !resourcesButtonRef.current.contains(event.target as Node)
      ) {
        setIsResourcesOpen(false);
      }
    };

    if (isResourcesOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isResourcesOpen]);

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


  // Handle switching to correct Arbitrum network
  const handleSwitchToArbitrum = async () => {
    if (!window.ethereum) {
      console.error('Ethereum provider not found');
      return;
    }

    try {
      setIsSwitchingNetwork(true);
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ACTIVE_NETWORK.hexId }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: ACTIVE_NETWORK.hexId,
                chainName: ACTIVE_NETWORK.chainName,
                rpcUrls: [ACTIVE_NETWORK.rpc],
                blockExplorerUrls: [ACTIVE_NETWORK.explorer],
                nativeCurrency: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                },
              },
            ],
          });
        } catch (addError) {
          console.error('Failed to add network:', addError);
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

  const renderDropdownItem = (
    href: string,
    label: string,
    Icon: any,
    testId: string,
    isActive: boolean,
    onClick?: () => void
  ) => {
    const isExternal = href.startsWith('http://') || href.startsWith('https://');

    if (isExternal) {
      return (
        <Link
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${isActive
            ? 'text-[var(--text-primary)] bg-[var(--accent)]/10'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
            }`}
          data-testid={testId}
        >
          <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-[var(--accent)]' : ''}`} />
          {label}
        </Link>
      );
    }

    return (
      <Link key={href} href={href}>
        <button
          onClick={onClick}
          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${isActive
            ? 'text-[var(--text-primary)] bg-[var(--accent)]/10'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
            }`}
          data-testid={testId}
        >
          <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-[var(--accent)]' : ''}`} />
          {label}
        </button>
      </Link>
    );
  };

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
              {/* Portfolio Dropdown */}
              <div className="relative">
                <button
                  ref={portfolioButtonRef}
                  onClick={() => setIsPortfolioOpen(!isPortfolioOpen)}
                  className={`relative inline-flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors md:w-auto md:text-center group ${isPortfolioActive
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  <Wallet className={`h-4 w-4 transition-colors ${isPortfolioActive ? 'text-[var(--accent)]' : ''}`} />
                  <span className="hidden sm:inline relative">Portfolio</span>
                  <span className="sm:hidden relative">Portfolio</span>
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${isPortfolioOpen ? 'rotate-180' : ''}`} />
                  {isPortfolioActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-80"></span>
                  )}
                </button>
                {isPortfolioOpen && (
                  <div
                    ref={portfolioRef}
                    className="absolute left-0 top-full mt-2 w-48 z-50 border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg rounded-md"
                  >
                    <div className="py-1">
                      {portfolioItems.map(({ href, label, icon: Icon, testId }) =>
                        renderDropdownItem(href, label, Icon, testId, router.pathname === href)
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Trading Dropdown */}
              <div className="relative">
                <button
                  ref={tradingButtonRef}
                  onClick={() => setIsTradingOpen(!isTradingOpen)}
                  className={`relative inline-flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors md:w-auto md:text-center group ${isTradingActive
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  <TrendingUp className={`h-4 w-4 transition-colors ${isTradingActive ? 'text-[var(--accent)]' : ''}`} />
                  <span className="hidden sm:inline relative">Trading</span>
                  <span className="sm:hidden relative">Trading</span>
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${isTradingOpen ? 'rotate-180' : ''}`} />
                  {isTradingActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-80"></span>
                  )}
                </button>
                {isTradingOpen && (
                  <div
                    ref={tradingRef}
                    className="absolute left-0 top-full mt-2 w-48 z-50 border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg rounded-md"
                  >
                    <div className="py-1">
                      {tradingItems.map(({ href, label, icon: Icon, testId }) =>
                        renderDropdownItem(href, label, Icon, testId, router.pathname === href)
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Resources Dropdown */}
              <div className="relative">
                <button
                  ref={resourcesButtonRef}
                  onClick={() => setIsResourcesOpen(!isResourcesOpen)}
                  className={`relative inline-flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors md:w-auto md:text-center group ${isResourcesActive
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                >
                  <BookOpen className={`h-4 w-4 transition-colors ${isResourcesActive ? 'text-[var(--accent)]' : ''}`} />
                  <span className="hidden sm:inline relative">Resources</span>
                  <span className="sm:hidden relative">Resources</span>
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${isResourcesOpen ? 'rotate-180' : ''}`} />
                  {isResourcesActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-80"></span>
                  )}
                </button>
                {isResourcesOpen && (
                  <div
                    ref={resourcesRef}
                    className="absolute left-0 top-full mt-2 w-48 z-50 border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg rounded-md"
                  >
                    <div className="py-1">
                      {resourcesItems.map(({ href, label, icon: Icon, testId }) =>
                        renderDropdownItem(href, label, Icon, testId, router.pathname === href)
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Link href="/#agents">
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] transition-colors ml-2"
                  data-testid="nav-create"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Join</span>
                </button>
              </Link>

              {/* Credit Balance Badge - Desktop */}
              {ready && authenticated && (
                <Link href="/credit-history">
                  <button
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 ml-2 border border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/20 hover:border-[var(--accent)] transition-all group"
                    data-testid="nav-credits"
                  >
                    <Coins className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    <span className="hidden sm:inline font-mono min-w-[2ch]">
                      {isLoadingCredits || creditBalance === null ? '—' : creditBalance}
                    </span>
                    <span className="hidden sm:inline text-[10px] text-[var(--accent)]/70 uppercase tracking-wider">Credits</span>
                  </button>
                </Link>
              )}

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
                          {isSwitchingNetwork ? 'Switching...' : `Switch to ${ACTIVE_NETWORK.chainName}`}
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
              <div className="flex flex-col p-2">
                {renderNavLinks(() => setIsMobileMenuOpen(false))}
                {/* Portfolio Section */}
                <div className="pt-2">
                  <div className="px-4 py-2 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Portfolio</div>
                  {portfolioItems.map(({ href, label, icon: Icon, testId }) =>
                    renderDropdownItem(href, label, Icon, testId, router.pathname === href, () => setIsMobileMenuOpen(false))
                  )}
                </div>
                {/* Trading Section */}
                <div className="pt-2">
                  <div className="px-4 py-2 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Trading</div>
                  {tradingItems.map(({ href, label, icon: Icon, testId }) =>
                    renderDropdownItem(href, label, Icon, testId, router.pathname === href, () => setIsMobileMenuOpen(false))
                  )}
                </div>
                {/* Resources Section */}
                <div className="pt-2">
                  <div className="px-4 py-2 text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Resources</div>
                  {resourcesItems.map(({ href, label, icon: Icon, testId }) =>
                    renderDropdownItem(href, label, Icon, testId, router.pathname === href, () => setIsMobileMenuOpen(false))
                  )}
                </div>
              </div>
              <div className="p-3 flex flex-col gap-3">
                <Link href="/#agents" onClick={() => setIsMobileMenuOpen(false)}>
                  <button
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] transition-colors"
                    data-testid="nav-create"
                  >
                    <Plus className="h-4 w-4" />
                    Join
                  </button>
                </Link>

                {/* Credit Balance Badge - Mobile */}
                {ready && authenticated && (
                  <Link href="/credit-history" onClick={() => setIsMobileMenuOpen(false)}>
                    <button
                      className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 border border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/20 transition-all"
                      data-testid="nav-credits-mobile"
                    >
                      <Coins className="h-5 w-5" />
                      <span className="font-mono text-lg min-w-[2ch]">
                        {isLoadingCredits || creditBalance === null ? '—' : creditBalance}
                      </span>
                      <span className="text-xs text-[var(--accent)]/70 uppercase tracking-wider">Credits</span>
                    </button>
                  </Link>
                )}

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
                            {isSwitchingNetwork ? 'Switching...' : `Switch to ${ACTIVE_NETWORK.chainName}`}
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
