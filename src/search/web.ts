import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

/**
 * Web Search - DuckDuckGo (free) + Bing (optional)
 */
export class WebSearch {

  async search(query: string, limit: number = 5): Promise<string> {
    log.info('SEARCH', `Searching: ${query}`);

    let results = await this.duckDuckGo(query, limit);
    if (results.length === 0) results = await this.bing(query, limit);

    if (results.length === 0) return `No results found for "${query}"`;

    let output = `Search results for "${query}":\n\n`;
    results.forEach((r, i) => {
      output += `${i + 1}. ${r.title}\n   ${r.description?.substring(0, 120) || ''}\n   ${r.url}\n\n`;
    });
    return output;
  }

  private async duckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const response = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
      if (!response.ok) return [];
      const data = await response.json();

      const results: SearchResult[] = [];
      if (data.AbstractText) {
        results.push({ title: data.Heading || query, url: data.AbstractURL || '', description: data.AbstractText });
      }
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, limit)) {
          if (topic.FirstURL && topic.Text) {
            results.push({ title: topic.Text.substring(0, 60), url: topic.FirstURL, description: topic.Text });
          }
        }
      }
      return results.slice(0, limit);
    } catch { return []; }
  }

  private async bing(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const key = await getCredential('BING_SEARCH_KEY');
      if (!key) return [];

      const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${limit}`, {
        headers: { 'Ocp-Apim-Subscription-Key': key },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.webPages?.value || []).map((p: any) => ({ title: p.name, url: p.url, description: p.snippet }));
    } catch { return []; }
  }
}
