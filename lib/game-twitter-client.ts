/**
 * GAME Twitter Client via Python Proxy
 * Uses Python proxy server that calls GAME API
 * Based on: https://github.com/abxglia/tweets-fetcher/blob/main/twitter_api.py
 */

import axios from 'axios';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
}

export class GameTwitterClient {
  private proxyUrl: string;

  constructor() {
    // Use Python proxy server
    this.proxyUrl = process.env.TWITTER_PROXY_URL || 'http://localhost:5002';
  }

  /**
   * Fetch user tweets via Python proxy
   */
  async getUserTweets(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
    } = {}
  ): Promise<Tweet[]> {
    try {
      const cleanUsername = username.replace('@', '');
      const maxResults = Math.max(5, Math.min(options.maxResults || 10, 100));

      console.log(`[Twitter Proxy] Fetching ${maxResults} tweets from: ${cleanUsername}`);
      console.log(`[Twitter Proxy] Using proxy: ${this.proxyUrl}`);

      // Call Python proxy
      const url = `${this.proxyUrl}/tweets/${cleanUsername}`;
      const params: any = {
        max_results: maxResults
      };

      if (options.sinceId) {
        params.since_id = options.sinceId;
      }

      const response = await axios.get(url, { 
        params,
        timeout: 30000 // 30 second timeout
      });

      if (!response.data || !response.data.data) {
        console.log('[Twitter Proxy] No tweets returned');
        return [];
      }

      const tweets: Tweet[] = response.data.data;
      console.log(`[Twitter Proxy] Fetched ${tweets.length} tweets`);
      return tweets;

    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.error('[Twitter Proxy] ERROR: Cannot connect to proxy server!');
        console.error(`[Twitter Proxy] Make sure Python proxy is running on ${this.proxyUrl}`);
        console.error('[Twitter Proxy] Run: python services/twitter-proxy.py');
      } else {
        console.error('[Twitter Proxy] Error fetching tweets:', error.response?.data || error.message);
      }
      return [];
    }
  }
}

/**
 * Create GAME Twitter client (uses Python proxy)
 */
export function createGameTwitterClient(): GameTwitterClient {
  return new GameTwitterClient();
}

