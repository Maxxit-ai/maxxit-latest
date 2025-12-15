import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Home, Wallet, User, Plus, TrendingUp, Menu } from 'lucide-react';
import { Bot, BarChart3, FileText, Copy, Check, LogOut, X } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import Image from 'next/image';

export function Header() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  const navLinks = [
    { href: '/', label: 'Home', icon: Home, testId: 'nav-home' },
    { href: '/my-deployments', label: 'Deployments', icon: Wallet, testId: 'nav-deployments' },
    { href: '/your-trades', label: 'Your Trades', icon: TrendingUp, testId: 'nav-your-trades' },
    { href: '/creator', label: 'My Agents', icon: User, testId: 'nav-my-agents' },
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

  const renderNavLinks = (onClick?: () => void) =>
    navLinks.map(({ href, label, icon: Icon, testId }) => (
      <Link key={href} href={href}>
        <button
          onClick={onClick}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors w-full text-left md:w-auto md:text-center"
          data-testid={testId}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{label}</span>
        </button>
      </Link>
    ));

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
            <nav className="hidden md:flex items-center gap-1">
              {renderNavLinks()}
              <Link href="/create-agent">
                <button
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] text-sm font-bold hover:bg-[var(--accent-dim)] transition-colors ml-2"
                  data-testid="nav-create"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create</span>
                </button>
              </Link>

              {/* Wallet Connection */}
              {ready && (
                <div className="relative ml-2">
                  {authenticated ? (
                    <>
                      <button
                        ref={buttonRef}
                        onClick={() => setIsWalletModalOpen(!isWalletModalOpen)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-[var(--accent)] text-[var(--accent)] text-sm font-bold hover:bg-[var(--accent)]/10 transition-colors"
                        data-testid="button-disconnect-wallet"
                      >
                        <Wallet className="h-4 w-4" />
                        <span className="hidden sm:inline font-mono">
                          {user?.wallet?.address ?
                            `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` :
                            'WALLET'}
                        </span>
                      </button>

                      {/* Wallet Address Popup */}
                      {isWalletModalOpen && (
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
                                <p className="font-mono text-xs break-all text-[var(--text-primary)] leading-relaxed">
                                  {user?.wallet?.address || 'No address'}
                                </p>
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
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
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
                      <div className="flex flex-col gap-2 border border-[var(--border)] p-3 bg-[var(--bg-elevated)]">
                        <div className="text-xs text-[var(--text-muted)]">Connected</div>
                        <div className="font-mono text-sm text-[var(--text-primary)] break-all">
                          {user?.wallet?.address || 'No address'}
                        </div>
                        <div className="flex gap-2">
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
