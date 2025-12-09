import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Home, Wallet, User, Plus } from 'lucide-react';
import { Bot, BarChart3, FileText, Copy, Check, LogOut, X } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

export function Header() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="sticky py-4 top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg-deep)]/95 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 border border-[var(--accent)] flex items-center justify-center">
              <span className="text-accent font-bold">M</span>
            </div>
            <span className="font-display text-xl tracking-wide" data-testid="text-header-brand">
              MAXXIT
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link href="/">
              <button
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                data-testid="nav-home"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </button>
            </Link>
            <Link href="/my-deployments">
              <button
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                data-testid="nav-deployments"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Deployments</span>
              </button>
            </Link>
            <Link href="/creator">
              <button
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                data-testid="nav-my-agents"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">My Agents</span>
              </button>
            </Link>
            <Link href="/docs">
              <button
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                data-testid="nav-docs"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Docs</span>
              </button>
            </Link>
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
        </div>
      </div>
    </header>
  );
}
