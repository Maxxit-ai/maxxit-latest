import { useState, useEffect } from 'react';
import { Check, Send, ExternalLink, MessageCircle, Plus, Trash2, Edit2, RefreshCw } from 'lucide-react';

interface TelegramSource {
  id: string;
  source_name: string;
  telegram_id: string | null;
  telegram_username: string | null;
  source_type: 'CHANNEL' | 'GROUP' | 'USER';
  is_active: boolean;
  description: string | null;
  research_institutes: any | null;
  _count?: {
    telegram_posts: number;
  };
  last_fetched_at: string | null;
}

interface TelegramSourceManagerProps {
  instituteId?: string;  // Optional: filter by research institute
  showAddButton?: boolean;
}

export function TelegramSourceManager({
  instituteId,
  showAddButton = true,
}: TelegramSourceManagerProps) {
  const [sources, setSources] = useState<TelegramSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    source_name: '',
    telegram_id: '',
    telegram_username: '',
    source_type: 'CHANNEL' as 'CHANNEL' | 'GROUP' | 'USER',
    description: '',
    institute_id: instituteId || '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/telegram-sources');
      const data = await response.json();

      if (data.success) {
        // Filter by institute if provided
        let filteredSources = data.sources;
        if (instituteId) {
          filteredSources = data.sources.filter(
            (s: TelegramSource) => s.research_institutes?.id === instituteId
          );
        }
        setSources(filteredSources);
      } else {
        setError('Failed to load Telegram sources');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Telegram sources');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      const response = await fetch('/api/admin/telegram-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await fetchSources();
        setShowAddForm(false);
        setFormData({
          source_name: '',
          telegram_id: '',
          telegram_username: '',
          source_type: 'CHANNEL',
          description: '',
          institute_id: instituteId || '',
        });
      } else {
        alert(`Error: ${data.error || 'Failed to create source'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (sourceId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/telegram-sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (response.ok) {
        await fetchSources();
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (sourceId: string, sourceName: string) => {
    if (!confirm(`Delete Telegram source "${sourceName}"? All associated messages will be deleted.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/telegram-sources/${sourceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchSources();
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleIngest = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/ingest-telegram', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        alert('Telegram messages ingested successfully!');
        await fetchSources();
      } else {
        alert(`Error: ${data.error || 'Ingestion failed'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && sources.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Telegram Signal Sources</h3>
          <p className="text-sm text-gray-600">
            Monitor Telegram channels and groups for alpha signals
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleIngest}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Ingest Now</span>
          </button>
          {showAddButton && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Source</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
          <h4 className="font-semibold text-gray-900">Add Telegram Source</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Name *
              </label>
              <input
                type="text"
                value={formData.source_name}
                onChange={(e) => setFormData({ ...formData, source_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Crypto Alpha Channel"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Type *
              </label>
              <select
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="CHANNEL">Channel</option>
                <option value="GROUP">Group</option>
                <option value="USER">User</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telegram ID
              </label>
              <input
                type="text"
                value={formData.telegram_id}
                onChange={(e) => setFormData({ ...formData, telegram_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="-1001234567890"
              />
              <p className="text-xs text-gray-500 mt-1">Chat ID (numeric)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telegram Username
              </label>
              <input
                type="text"
                value={formData.telegram_username}
                onChange={(e) => setFormData({ ...formData, telegram_username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="cryptoalphaofficial"
              />
              <p className="text-xs text-gray-500 mt-1">Without @ symbol</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="Brief description of this source"
              />
            </div>
          </div>

          <div className="flex space-x-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Source'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Sources List */}
      {sources.length === 0 ? (
        <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-2">No Telegram sources configured</p>
          <p className="text-sm text-gray-500">
            Add Telegram channels or groups to start monitoring signals
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {sources.map(source => (
            <div
              key={source.id}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${source.is_active
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-gray-50'
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  {/* Icon */}
                  <div className={`
                    w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0
                    ${source.is_active ? 'bg-blue-100' : 'bg-gray-200'}
                  `}>
                    <Send className={`w-6 h-6 ${source.is_active ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className={`font-semibold ${source.is_active ? 'text-blue-900' : 'text-gray-700'}`}>
                        {source.source_name}
                      </h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        source.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {source.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {source.source_type}
                      </span>
                    </div>

                    {source.description && (
                      <p className="text-sm text-gray-600 mb-2">
                        {source.description}
                      </p>
                    )}

                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      {source.telegram_username && (
                        <span>@{source.telegram_username}</span>
                      )}
                      {source._count && (
                        <span>{source._count.telegram_posts} messages</span>
                      )}
                      {source.last_fetched_at && (
                        <span>
                          Last fetched: {new Date(source.last_fetched_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {source.research_institutes && (
                      <div className="mt-2 text-xs text-gray-600">
                        Linked to: <strong>{source.research_institutes.name}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-3">
                  <button
                    onClick={() => handleToggleActive(source.id, source.is_active)}
                    className={`p-2 rounded-lg transition-colors ${
                      source.is_active
                        ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                    title={source.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(source.id, source.source_name)}
                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                    title="Delete source"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-sm text-blue-900">
          💡 <strong>Note:</strong> Your bot must be added as an admin to Telegram channels/groups to fetch messages.
        </div>
        <div className="text-xs text-blue-700 mt-1">
          Bot Token: {process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}
        </div>
      </div>
    </div>
  );
}

