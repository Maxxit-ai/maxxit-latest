/**
 * X (Twitter) API Integration
 * Handles fetching tweets from X API v2
 */

interface XApiConfig {
  apiKey: string;
  apiSecret?: string;
  bearerToken?: string;
}

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

interface XApiResponse {
  data?: Tweet[];
  meta?: {
    oldest_id: string;
    newest_id: string;
    result_count: number;
    next_token?: string;
  };
  errors?: Array<{
    title: string;
    detail: string;
    type: string;
  }>;
}

interface UserResponse {
  data?: {
    id: string;
    name: string;
    username: string;
    public_metrics?: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
    };
  };
  errors?: Array<{
    title: string;
    detail: string;
    type: string;
  }>;
}

/**
 * X API Client for fetching tweets
 */
export class XApiClient {
  private bearerToken: string;
  private baseUrl = 'https://api.twitter.com/2';

  constructor(config: XApiConfig) {
    // Prefer bearer token, fall back to API key
    this.bearerToken = config.bearerToken || config.apiKey;
  }

  /**
   * Fetch user information by username
   */
  async getUserByUsername(username: string): Promise<UserResponse['data'] | null> {
    try {
      const cleanUsername = username.replace('@', '');
      const url = `${this.baseUrl}/users/by/username/${cleanUsername}?user.fields=public_metrics,name`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error(`[X API] Failed to fetch user ${username}:`, response.status, response.statusText);
        return null;
      }

      const data: UserResponse = await response.json();
      
      if (data.errors) {
        console.error('[X API] User fetch errors:', data.errors);
        return null;
      }

      return data.data || null;
    } catch (error) {
      console.error('[X API] Error fetching user:', error);
      return null;
    }
  }

  /**
   * Fetch recent tweets from a user by username
   * @param username Twitter username (with or without @)
   * @param options Query options
   */
  async getUserTweets(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
      untilId?: string;
    } = {}
  ): Promise<Tweet[]> {
    try {
      // First, get user ID from username
      const user = await this.getUserByUsername(username);
      
      if (!user) {
        console.error(`[X API] User not found: ${username}`);
        return [];
      }

      const userId = user.id;
      const maxResults = Math.min(options.maxResults || 10, 100); // Max 100 per request

      // Build query parameters
      const params = new URLSearchParams({
        'max_results': maxResults.toString(),
        'tweet.fields': 'created_at,public_metrics',
        'exclude': 'retweets,replies', // Only get original tweets
      });

      if (options.sinceId) {
        params.append('since_id', options.sinceId);
      }

      if (options.untilId) {
        params.append('until_id', options.untilId);
      }

      const url = `${this.baseUrl}/users/${userId}/tweets?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error(`[X API] Failed to fetch tweets for ${username}:`, response.status, response.statusText);
        const errorText = await response.text();
        console.error('[X API] Error details:', errorText);
        return [];
      }

      const data: XApiResponse = await response.json();
      
      if (data.errors) {
        console.error('[X API] Tweet fetch errors:', data.errors);
        return [];
      }

      return data.data || [];
    } catch (error) {
      console.error('[X API] Error fetching tweets:', error);
      return [];
    }
  }

  /**
   * Search for tweets matching a query
   * @param query Search query (supports operators like from:username, #hashtag, etc.)
   * @param options Query options
   */
  async searchTweets(
    query: string,
    options: {
      maxResults?: number;
      sinceId?: string;
      startTime?: Date;
    } = {}
  ): Promise<Tweet[]> {
    try {
      const maxResults = Math.min(options.maxResults || 10, 100);

      const params = new URLSearchParams({
        'query': query,
        'max_results': maxResults.toString(),
        'tweet.fields': 'created_at,public_metrics',
      });

      if (options.sinceId) {
        params.append('since_id', options.sinceId);
      }

      if (options.startTime) {
        params.append('start_time', options.startTime.toISOString());
      }

      const url = `${this.baseUrl}/tweets/search/recent?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
        },
      });

      if (!response.ok) {
        console.error('[X API] Search failed:', response.status, response.statusText);
        return [];
      }

      const data: XApiResponse = await response.json();
      
      if (data.errors) {
        console.error('[X API] Search errors:', data.errors);
        return [];
      }

      return data.data || [];
    } catch (error) {
      console.error('[X API] Error searching tweets:', error);
      return [];
    }
  }
}

/**
 * Create an X API client instance
 */
export function createXApiClient(): XApiClient | null {
  const bearerToken = process.env.X_API_BEARER_TOKEN || process.env.X_API_KEY || process.env.TWITTER_BEARER_TOKEN;
  
  if (!bearerToken) {
    console.warn('[X API] No API credentials found. Set X_API_BEARER_TOKEN or X_API_KEY environment variable.');
    return null;
  }

  return new XApiClient({ apiKey: bearerToken });
}

