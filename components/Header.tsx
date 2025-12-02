import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { Bot, Home, BarChart3, FileText, Wallet, User, Copy, Check, LogOut, X } from 'lucide-react';
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
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center gap-3 hover-elevate rounded-md px-3 py-2 -ml-3">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-primary" data-testid="text-header-brand">
                MAXXIT
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link href="/">
              <button
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-home"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </button>
            </Link>
            <Link href="/my-deployments">
              <button
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-deployments"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">My Deployments</span>
              </button>
            </Link>
            <Link href="/creator">
              <button
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-my-agents"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">My Agents</span>
              </button>
            </Link>
            <Link href="/create-agent">
              <button
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-create"
              >
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">Create Agent</span>
              </button>
            </Link>
            <Link href="/docs">
              <button
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-docs"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Docs</span>
              </button>
            </Link>

            {/* Wallet Connection */}
            {ready && (
              <div className="relative">
                {authenticated ? (
                  <>
                    <button
                      ref={buttonRef}
                      onClick={() => setIsWalletModalOpen(!isWalletModalOpen)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-primary text-primary rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                      data-testid="button-disconnect-wallet"
                    >
                      <Wallet className="h-4 w-4" />
                      <span className="hidden sm:inline">
                        {user?.wallet?.address ?
                          `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` :
                          'Disconnect'}
                      </span>
                    </button>

                    {/* Wallet Address Popup */}
                    {isWalletModalOpen && (
                      <div
                        ref={popupRef}
                        className="absolute right-0 top-full mt-2 w-80 z-50 rounded-md border bg-[#08080a] text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
                        style={{
                          animationDuration: '150ms'
                        }}
                      >
                        <div className="p-4 space-y-4">
                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-primary" />
                              <h3 className="text-sm font-semibold">Wallet Account</h3>
                            </div>
                            <button
                              onClick={() => setIsWalletModalOpen(false)}
                              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm hover:bg-accent"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Address Display */}
                          <div className="p-3 bg-muted/50 rounded-md border border-border/50">
                            <p className="text-xs text-muted-foreground mb-2 font-medium">Connected Account</p>
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-mono text-xs break-all text-foreground leading-relaxed">
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
                                className="flex-shrink-0 p-1.5 hover:bg-background rounded-md transition-colors hover-elevate"
                                title="Copy address"
                              >
                                {copied ? (
                                  <Check className="h-4 w-4 text-primary" />
                                ) : (
                                  <Copy className="h-4 w-4 text-muted-foreground" />
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
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 rounded-md text-sm font-medium transition-all hover-elevate active-elevate-2"
                          >
                            <LogOut className="h-4 w-4" />
                            Log Out
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={login}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-primary text-primary rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                    data-testid="button-connect-wallet"
                  >
                    <Wallet className="h-4 w-4" />
                    <span className="hidden sm:inline">Connect Wallet</span>
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
