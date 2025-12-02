/**
 * X (Twitter) API Integration - Multiple Authentication Methods
 * Supports: Bearer Token, GAME API, and other alternatives
 */

import { GameTwitterClient } from './game-twitter-client';

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


/**
 * Multi-method X API Client
 * Tries different authentication methods automatically
 */
export class MultiMethodXApiClient {
  private bearerToken?: string;
  private gameApiKey?: string;
  private gameApiUrl?: string;

  constructor(config: {
    bearerToken?: string;
    gameApiKey?: string;
    gameApiUrl?: string;
  }) {
    this.bearerToken = config.bearerToken;
    this.gameApiKey = config.gameApiKey;
    this.gameApiUrl = config.gameApiUrl;
  }

  /**
   * Fetch tweets using best available method
   */
  async getUserTweets(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
    } = {}
  ): Promise<Tweet[]> {
    // Try GAME SDK direct API first (official approach)
    if (this.gameApiKey) {
      console.log('[X API] Using GAME SDK (direct API)');
      try {
        const gameClient = new GameTwitterClient(this.gameApiKey);
        const tweets = await gameClient.getUserTweets(username, options);
        if (tweets.length > 0) {
          return tweets;
        }
        console.log('[X API] GAME SDK returned 0 tweets, trying fallback...');
      } catch (error) {
        console.error('[X API] GAME SDK failed, trying bearer token method');
      }
    }

    // Fallback to standard bearer token method
    if (this.bearerToken) {
      console.log('[X API] Using standard bearer token method');
      return this.fetchWithBearerToken(username, options);
    }

    console.warn('[X API] No authentication method available');
    return [];
  }

  /**
   * Standard bearer token method (existing implementation)
   */
  private async fetchWithBearerToken(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
    }
  ): Promise<Tweet[]> {
    try {
      const cleanUsername = username.replace('@', '');
      
      // Get user ID
      const userUrl = `https://api.twitter.com/2/users/by/username/${cleanUsername}`;
      const userResponse = await fetch(userUrl, {
        headers: { 'Authorization': `Bearer ${this.bearerToken}` },
      });

      if (!userResponse.ok) {
        throw new Error(`User fetch failed: ${userResponse.status}`);
      }

      const userData = await userResponse.json();
      const userId = userData.data?.id;

      if (!userId) {
        throw new Error('User ID not found');
      }

      // Get tweets
      const maxResults = Math.min(options.maxResults || 10, 100);
      const params = new URLSearchParams({
        'max_results': maxResults.toString(),
        'tweet.fields': 'created_at,public_metrics',
        'exclude': 'retweets,replies',
      });

      if (options.sinceId) {
        params.append('since_id', options.sinceId);
      }

      const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets?${params}`;
      const tweetsResponse = await fetch(tweetsUrl, {
        headers: { 'Authorization': `Bearer ${this.bearerToken}` },
      });

      if (!tweetsResponse.ok) {
        throw new Error(`Tweets fetch failed: ${tweetsResponse.status}`);
      }

      const tweetsData = await tweetsResponse.json();
      return tweetsData.data || [];
    } catch (error) {
      console.error('[X API] Bearer token method error:', error);
      return [];
    }
  }
}

/**
 * Create X API client with auto-detection of available methods
 */
export function createMultiMethodXApiClient(): MultiMethodXApiClient | null {
  const bearerToken = process.env.X_API_BEARER_TOKEN || process.env.X_API_KEY || process.env.TWITTER_BEARER_TOKEN;
  const gameApiKey = process.env.GAME_API_KEY || process.env.X_GAME_API_KEY;
  const gameApiUrl = process.env.GAME_API_URL;

  if (!bearerToken && !gameApiKey) {
    console.warn('[X API] No authentication credentials found');
    return null;
  }

  return new MultiMethodXApiClient({
    bearerToken,
    gameApiKey,
    gameApiUrl,
  });
}

