import { useState, useEffect } from 'react';
import { Check, Send, User } from 'lucide-react';

interface TelegramAlphaUser {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  impact_factor: number;
  last_message_at: string | null;
  _count: {
    telegram_posts: number;
    agent_telegram_users: number;
  };
}

interface TelegramAlphaUserSelectorProps {
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

export function TelegramAlphaUserSelector({
  selectedIds,
  onToggle,
}: TelegramAlphaUserSelectorProps) {
  const [alphaUsers, setAlphaUsers] = useState<TelegramAlphaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAlphaUsers();
  }, []);

  const fetchAlphaUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/telegram-alpha-users');
      const data = await response.json();

      if (data.success) {
        setAlphaUsers(data.alphaUsers);
      } else {
        setError('Failed to load telegram alpha users');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load telegram alpha users');
    } finally {
      setLoading(false);
    }
  };

  const getDisplayName = (user: TelegramAlphaUser) => {
    if (user.telegram_username) {
      return `@${user.telegram_username}`;
    }
    if (user.first_name) {
      return user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.first_name;
    }
    return 'Telegram User';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-[var(--danger)] bg-[var(--danger)]/10 rounded">
        <p className="text-[var(--danger)] text-sm">⚠️ {error}</p>
      </div>
    );
  }

  if (alphaUsers.length === 0) {
    return (
      <div className="p-6 border border-[var(--border)] bg-[var(--bg-elevated)] rounded-lg text-center">
        <Send className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-[var(--text-secondary)] mb-2">No Telegram alpha sources yet</p>
        <p className="text-sm text-[var(--text-muted)]">
          Users will appear here when they start DMing alpha signals to the bot
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--text-secondary)] mb-3">
        Select Telegram users whose alpha signals your agent should follow.
        Selected: {selectedIds.size}
      </div>

      <div className="max-h-96 overflow-y-auto space-y-2" onWheel={(e) => {
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
      }}>
        {alphaUsers.map(user => {
          const isSelected = selectedIds.has(user.id);
          const displayName = getDisplayName(user);

          return (
            <label
              key={user.id}
              className={`
                block p-4 border rounded-lg cursor-pointer transition-all
                ${isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_10px_rgba(0,255,136,0.1)]'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50 bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)]'
                }
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(user.id)}
                className="sr-only"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {/* Icon */}
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${isSelected ? 'bg-[var(--accent)]/20' : 'bg-[var(--bg-deep)]'}
                  `}>
                    {user.telegram_username ? (
                      <Send className={`w-5 h-5 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                    ) : (
                      <User className={`w-5 h-5 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h3 className={`font-semibold ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                      {displayName}
                    </h3>
                    <div className="flex gap-3 mt-1 text-xs text-[var(--text-secondary)]">
                      <span>{user._count.telegram_posts} messages</span>
                      {user._count.agent_telegram_users > 0 && (
                        <span className="text-[var(--accent)] font-medium">
                          {user._count.agent_telegram_users} agents following
                        </span>
                      )}
                      <span>Impact: {user.impact_factor.toFixed(2)}</span>
                    </div>
                    {user.last_message_at && (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        Last active: {new Date(user.last_message_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Checkmark */}
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                  ${isSelected ? 'bg-[var(--accent)]' : 'bg-[var(--bg-deep)] border border-[var(--border)]'}
                `}>
                  {isSelected && <Check className="w-4 h-4 text-[var(--bg-deep)]" />}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="mt-4 p-3 border border-[var(--accent)] bg-[var(--accent)]/10 rounded-lg shadow-[0_0_10px_rgba(0,255,136,0.1)]">
          <div className="text-sm text-[var(--accent)]">
            ✅ <strong>{selectedIds.size}</strong> Telegram alpha source{selectedIds.size !== 1 ? 's' : ''} selected
          </div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            Your agent will execute signals from these Telegram users
          </div>
        </div>
      )}

      <div className="mt-4 p-3 border border-[var(--border)] bg-[var(--bg-elevated)] rounded-lg">
        <div className="text-xs text-[var(--text-secondary)]">
          💡 <strong>Tip:</strong> Telegram users appear here when they DM alpha signals to your bot.
          Share your bot link to grow your alpha sources!
        </div>
      </div>
    </div>
  );
}

