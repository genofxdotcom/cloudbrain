import { log } from '../utils/logger';

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

/**
 * Web Search - Built-in, no API keys needed
 * Uses DuckDuckGo Instant Answer API + HTML scraping fallback
 */
export class WebSearch {

  async search(query: string, limit: number = 5): Promise<string> {
    log.info('SEARCH', `Searching: ${query}`);

    let results = await this.duckDuckGoInstant(query, limit);
    if (results.length === 0) results = await this.duckDuckGoHtml(query, limit);

    if (results.length === 0) return `No results found for "${query}"`;

    let output = `Search results for "${query}":\n\n`;
    results.forEach((r, i) => {
      output += `${i + 1}. ${r.title}\n   ${r.description?.substring(0, 150) || ''}\n   ${r.url}\n\n`;
    });
    return output;
  }

  private async duckDuckGoInstant(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
      if (!response.ok) return [];
      const data: any = await response.json();

      const results: SearchResult[] = [];
      if (data.AbstractText) {
        results.push({ title: data.Heading || query, url: data.AbstractURL || '', description: data.AbstractText });
      }
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, limit)) {
          if (topic.FirstURL && topic.Text) {
            results.push({ title: topic.Text.substring(0, 80), url: topic.FirstURL, description: topic.Text });
          }
        }
      }
      if (data.Results) {
        for (const r of data.Results.slice(0, limit)) {
          if (r.FirstURL && r.Text) {
            results.push({ title: r.Text.substring(0, 80), url: r.FirstURL, description: r.Text });
          }
        }
      }
      return results.slice(0, limit);
    } catch { return []; }
  }

  private async duckDuckGoHtml(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) return [];
      const html = await response.text();

      const results: SearchResult[] = [];
      // Parse result links from HTML
      const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;

      const links: { url: string; title: string }[] = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null && links.length < limit) {
        const url = this.decodeRedirectUrl(match[1]);
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (url && title) links.push({ url, title });
      }

      const snippets: string[] = [];
      while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
      }

      for (let i = 0; i < links.length; i++) {
        results.push({
          title: links[i].title,
          url: links[i].url,
          description: snippets[i] || '',
        });
      }

      return results.slice(0, limit);
    } catch { return []; }
  }

  private decodeRedirectUrl(url: string): string {
    // DuckDuckGo wraps URLs in redirects
    const match = url.match(/uddg=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
    if (url.startsWith('http')) return url;
    return '';
  }
}
