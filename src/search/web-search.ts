/**
 * Web Search Module - Real-time web search capabilities
 * Allows the AI agent to search the web for current information
 * Integrates with multiple search APIs
 */

export interface SearchResult {
  title: string;
  url: string;
  description?: string;
  source?: string;
  publishedAt?: string;
  imageUrl?: string;
}

export interface WebSearchResponse {
  success: boolean;
  query: string;
  results?: SearchResult[];
  totalResults?: number;
  error?: string;
}

export interface SearchOptions {
  query?: string;
  type?: 'web' | 'news' | 'images' | 'academic';
  limit?: number;
  language?: string;
}

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [${tag}] ${message}`, error || '');
  },
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] [WARN] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

/**
 * WebSearch - Real-time web search capabilities
 */
export class WebSearch {
  private kv: KVNamespace;
  private cache: Map<string, { data: SearchResult[]; timestamp: number }> = new Map();
  private cacheExpiry = 30 * 60 * 1000; // 30 minutes cache

  constructor(kv: KVNamespace) {
    this.kv = kv;
    logger.info('SEARCH', 'Web Search module initialized');
  }

  /**
   * Search the web for information
   */
  async search(query: string, options?: SearchOptions): Promise<WebSearchResponse> {
    try {
      logger.info('SEARCH', `Searching web: ${query}`);

      const limit = options?.limit || 5;
      const searchType = options?.type || 'web';

      // Check cache first
      const cacheKey = `search_${query}_${searchType}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        logger.debug('SEARCH', 'Using cached search results');
        return {
          success: true,
          query,
          results: cached.data.slice(0, limit),
          totalResults: cached.data.length,
        };
      }

      // Try multiple search methods
      let results: SearchResult[] = [];

      // Method 1: DuckDuckGo (no API key needed, simple fetch)
      results = await this.searchDuckDuckGo(query, limit);

      // Method 2: Bing Search (if configured with API key)
      if (!results || results.length === 0) {
        results = await this.searchBing(query, searchType, limit);
      }

      if (results && results.length > 0) {
        // Cache results
        this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
        logger.info('SEARCH', `Found ${results.length} results for "${query}"`);

        return {
          success: true,
          query,
          results: results.slice(0, limit),
          totalResults: results.length,
        };
      }

      logger.warn('SEARCH', `No results found for "${query}"`);
      return {
        success: false,
        query,
        error: `No results found for "${query}"`,
      };
    } catch (error) {
      logger.error('SEARCH', `Search error for "${query}"`, error);
      return {
        success: false,
        query,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  }

  /**
   * Search using DuckDuckGo (no API key required)
   */
  private async searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
    try {
      logger.debug('SEARCH', 'Attempting DuckDuckGo search');

      const encodedQuery = encodeURIComponent(query);
      const url = `https://duckduckgo.com/?q=${encodedQuery}&format=json`;

      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      // Parse DuckDuckGo results
      const results: SearchResult[] = [];

      if (data.Results && data.Results.length > 0) {
        data.Results.forEach((result: any) => {
          if (result.FirstURL && result.Text) {
            results.push({
              title: result.Result || result.Text.substring(0, 50),
              url: result.FirstURL,
              description: result.Text,
              source: 'DuckDuckGo',
            });
          }
        });
      }

      logger.debug('SEARCH', `DuckDuckGo returned ${results.length} results`);
      return results.slice(0, limit);
    } catch (error) {
      logger.debug('SEARCH', 'DuckDuckGo search failed', error);
      return [];
    }
  }

  /**
   * Search using Bing (requires API key in KV)
   */
  private async searchBing(query: string, type: string, limit: number): Promise<SearchResult[]> {
    try {
      logger.debug('SEARCH', 'Attempting Bing search');

      // Bing Search API requires subscription key
      const apiKey = await this.kv.get('BING_SEARCH_KEY');
      if (!apiKey) {
        logger.debug('SEARCH', 'Bing API key not configured, skipping');
        return [];
      }

      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodedQuery}&count=${limit}`;

      const response = await fetch(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      const results: SearchResult[] = [];
      if (data.webPages && data.webPages.value) {
        data.webPages.value.forEach((page: any) => {
          results.push({
            title: page.name,
            url: page.url,
            description: page.snippet,
            source: 'Bing',
            publishedAt: page.datePublished,
          });
        });
      }

      return results.slice(0, limit);
    } catch (error) {
      logger.debug('SEARCH', 'Bing search failed', error);
      return [];
    }
  }

  /**
   * Search for current information (news)
   */
  async searchCurrent(query: string, limit: number = 5): Promise<WebSearchResponse> {
    logger.info('SEARCH', `Searching for current info: ${query}`);
    return this.search(query, { type: 'news', limit });
  }

  /**
   * Answer a question by searching the web
   */
  async answerQuestion(question: string): Promise<string> {
    try {
      logger.info('SEARCH', `Answering question: ${question}`);

      const result = await this.search(question, { limit: 3 });

      if (!result.success || !result.results || result.results.length === 0) {
        return `I couldn't find information about: "${question}"`;
      }

      let answer = `🔍 Based on my search for "${question}":\n\n`;

      result.results.forEach((r, i) => {
        answer += `${i + 1}. **${r.title}**\n`;
        if (r.description) {
          answer += `   ${r.description.substring(0, 150)}...\n`;
        }
        answer += `   🔗 [Read more](${r.url})\n\n`;
      });

      return answer;
    } catch (error) {
      logger.error('SEARCH', 'Error answering question', error);
      return `Error searching for information: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Format search results for display
   */
  formatResults(results: SearchResult[], query: string): string {
    if (!results || results.length === 0) {
      return `📭 No results found for: "${query}"`;
    }

    let display = `🔍 **Search Results for: "${query}"**\n\n`;

    results.forEach((result, i) => {
      display += `${i + 1}. **${result.title}**\n`;
      if (result.source) {
        display += `   📍 ${result.source}\n`;
      }
      if (result.description) {
        display += `   ${result.description.substring(0, 150)}...\n`;
      }
      if (result.publishedAt) {
        display += `   📅 ${new Date(result.publishedAt).toLocaleDateString()}\n`;
      }
      display += `   🔗 ${result.url}\n\n`;
    });

    return display;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('SEARCH', 'Search cache cleared');
  }

  /**
   * Smart search with fallback to multiple sources
   */
  async smartSearch(query: string, limit: number = 5): Promise<WebSearchResponse> {
    try {
      logger.info('SEARCH', `Smart search: ${query}`);

      // Check cache
      const cacheKey = `smart_search_${query}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return {
          success: true,
          query,
          results: cached.data.slice(0, limit),
          totalResults: cached.data.length,
        };
      }

      // Try DuckDuckGo first (no API key needed)
      let results = await this.searchDuckDuckGo(query, limit);

      // If no results, try Bing
      if (!results || results.length === 0) {
        results = await this.searchBing(query, 'web', limit);
      }

      // Cache successful results
      if (results && results.length > 0) {
        this.cache.set(cacheKey, { data: results, timestamp: Date.now() });
      }

      return {
        success: results && results.length > 0,
        query,
        results: results ? results.slice(0, limit) : [],
        totalResults: results ? results.length : 0,
        error: results && results.length > 0 ? undefined : 'No results found',
      };
    } catch (error) {
      logger.error('SEARCH', 'Smart search error', error);
      return {
        success: false,
        query,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  }
}

/**
 * KVNamespace type
 */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: any): Promise<void>;
}
