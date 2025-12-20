import { useState, useEffect } from 'react';
import { Check, Twitter, Search, Plus as PlusIcon, X, Activity } from 'lucide-react';
import { db } from '../client/src/lib/db';
import { FaXTwitter } from 'react-icons/fa6';

type CtAccount = {
  id: string;
  xUsername: string;
  displayName: string | null;
  followersCount: number | null;
  impactFactor: number;
  lastSeenAt: Date | null;
  _count?: {
    ctPosts: number;
    agentAccounts: number;
  };
};

interface CtAccountSelectorProps {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CtAccountSelector({
  selectedIds,
  onToggle,
  onNext,
  onBack,
}: CtAccountSelectorProps) {
  const [ctAccounts, setCtAccounts] = useState<CtAccount[]>([]);
  const [loadingCtAccounts, setLoadingCtAccounts] = useState(false);
  const [ctAccountSearch, setCtAccountSearch] = useState('');
  const [ctAccountSearchExecuted, setCtAccountSearchExecuted] = useState(false);
  const [showAddCtAccount, setShowAddCtAccount] = useState(false);
  const [newCtUsername, setNewCtUsername] = useState('');
  const [newCtDisplayName, setNewCtDisplayName] = useState('');
  const [addingCtAccount, setAddingCtAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCtAccounts();
  }, []);

  const loadCtAccounts = async (searchTerm?: string) => {
    const trimmedSearch = searchTerm?.trim();
    setLoadingCtAccounts(true);
    try {
      let accounts;
      if (trimmedSearch) {
        const response = await fetch(`/api/ct-accounts/search?q=${encodeURIComponent(trimmedSearch)}`);
        if (!response.ok) throw new Error('Failed to search CT accounts');
        accounts = await response.json();
      } else {
        accounts = await db.get('ct_accounts');
      }
      setCtAccounts(accounts || []);
      setCtAccountSearchExecuted(!!trimmedSearch);
    } catch (err: any) {
      console.error('Failed to load CT accounts:', err);
      setError(trimmedSearch ? 'Failed to search CT accounts' : 'Failed to load CT accounts');
    } finally {
      setLoadingCtAccounts(false);
    }
  };

  useEffect(() => {
    const trimmedSearch = ctAccountSearch.trim();
    if (!trimmedSearch) return;

    const timeoutId = setTimeout(() => {
      loadCtAccounts(trimmedSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [ctAccountSearch]);

  const handleAddCtAccount = async () => {
    if (!newCtUsername.trim()) {
      setError('Username is required');
      return;
    }
    setAddingCtAccount(true);
    setError(null);
    try {
      const newAccount = await db.post('ct_accounts', {
        xUsername: newCtUsername.trim().replace('@', ''),
        displayName: newCtDisplayName.trim() || undefined,
      });
      if (newAccount && newAccount.id) {
        setCtAccounts([newAccount, ...ctAccounts]);
        onToggle(newAccount.id);
        setShowAddCtAccount(false);
        setNewCtUsername('');
        setNewCtDisplayName('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add CT account');
    } finally {
      setAddingCtAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-display text-2xl">CT ACCOUNTS</h2>
          <p className="text-[var(--text-secondary)] text-sm">Selected: {selectedIds.size}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddCtAccount(!showAddCtAccount)}
          className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold text-sm flex items-center gap-2 hover:bg-[var(--accent-dim)] transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          ADD
        </button>
      </div>

      {showAddCtAccount && (
        <div className="p-4 border-2 border-[var(--accent)] bg-[var(--bg-elevated)] space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-bold text-[var(--text-primary)]">ADD NEW ACCOUNT</span>
            <button
              type="button"
              onClick={() => setShowAddCtAccount(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={newCtUsername}
            onChange={(e) => setNewCtUsername(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="@username"
          />
          <input
            type="text"
            value={newCtDisplayName}
            onChange={(e) => setNewCtDisplayName(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Display Name (optional)"
          />
          <button
            type="button"
            onClick={handleAddCtAccount}
            disabled={addingCtAccount}
            className="w-full py-2 bg-[var(--accent)] text-[var(--bg-deep)] font-bold disabled:opacity-50 hover:bg-[var(--accent-dim)] transition-colors"
          >
            {addingCtAccount ? 'ADDING...' : 'ADD ACCOUNT'}
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 border border-[var(--danger)] bg-[var(--danger)]/10">
          <p className="text-[var(--danger)] text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={ctAccountSearch}
            onChange={(e) => {
              const value = e.target.value;
              setCtAccountSearch(value);
              if (value === '') loadCtAccounts();
            }}
            className="w-full pl-10 pr-3 py-2 bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search accounts"
          />
        </div>
      </div>

      {loadingCtAccounts ? (
        <div className="py-12 text-center">
          <Activity className="h-8 w-8 mx-auto text-[var(--accent)] animate-pulse" />
        </div>
      ) : ctAccounts.length === 0 ? (
        <div className="text-center py-12 border border-[var(--border)] bg-[var(--bg-elevated)]">
          <FaXTwitter className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)]">
            {ctAccountSearchExecuted ? 'No results found' : 'No accounts yet'}
          </p>
        </div>
      ) : (
        <div className="border border-[var(--border)] bg-[var(--bg-deep)] max-h-[500px] flex flex-col overflow-hidden">
          <div
            className="h-full overflow-y-auto overflow-x-hidden pr-2 space-y-2 custom-scrollbar"
            onWheel={(e) => {
              const element = e.currentTarget;
              const isScrollable = element.scrollHeight > element.clientHeight;
              const isAtTop = element.scrollTop === 0;
              const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;

              if (isScrollable && ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0))) {
                // Allow parent scroll only when at boundaries
                return;
              }
              // Prevent parent scroll when scrolling within the container
              if (isScrollable) {
                e.stopPropagation();
              }
            }}
          >
            {ctAccounts.map((account) => (
              <label
                key={account.id}
                className={`relative h-full flex flex-col p-4 border cursor-pointer transition-all ${selectedIds.has(account.id)
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_20px_rgba(0,255,136,0.1)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-surface)]'
                  }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(account.id)}
                  onChange={() => onToggle(account.id)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label={`Select account ${account.xUsername}`}
                />
                <div className="flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 border flex items-center justify-center flex-shrink-0 ${selectedIds.has(account.id)
                        ? 'border-[var(--accent)] bg-[var(--accent)]/20'
                        : 'border-[var(--border)]'
                        }`}
                    >
                      <FaXTwitter
                        className={`h-5 w-5 ${selectedIds.has(account.id) ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                          }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[var(--text-primary)] truncate">@{account.xUsername}</p>
                      {account.displayName && (
                        <p className="text-sm text-[var(--text-muted)] truncate">{account.displayName}</p>
                      )}
                      {account.followersCount && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {account.followersCount.toLocaleString()} followers
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className={`flex-shrink-0 ml-3 ${selectedIds.has(account.id) ? 'text-[var(--accent)]' : 'text-transparent'
                      }`}
                  >
                    <Check className="h-5 w-5" />
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="p-3 border border-[var(--accent)]/50 bg-[var(--accent)]/5">
          <p className="text-sm text-[var(--accent)] font-bold">
            ✓ {selectedIds.size} account{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-4 border border-[var(--border)] font-bold hover:border-[var(--text-primary)] transition-colors"
        >
          BACK
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-4 bg-[var(--accent)] text-[var(--bg-deep)] font-bold hover:bg-[var(--accent-dim)] transition-colors"
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}
