/**
 * Tool Registry + built-in tools.
 *
 * Tools are metadata-described capabilities. The agent receives a FILTERED
 * capability set per request (risk-aware, mode-aware) — never every tool.
 * Approval requirements are enforced by the orchestrator, not the model.
 */

import type { RiskLevel, ToolDescriptor } from '@cloudbrain/shared';
import type { Env } from './env.js';
import type { IntegrationProvider } from '@cloudbrain/integrations';

export interface ToolContext {
  env: Env;
  userId: string;
  /** Non-secret metadata for rendering the UI activity feed. */
  taskId?: string;
  integration: IntegrationProvider;
  /** Emit progress to the client (best-effort). */
  onEvent?: (summary: string) => void;
  /** Signal that this call requires human approval; orchestrator handles it. */
  requestApproval?: (info: { summary: string; resource?: string; consequence?: string }) => Promise<boolean>;
}

export interface ToolHandler {
  descriptor: ToolDescriptor;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

// ── Registry ──────────────────────────────────────────────────────────────
export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    this.tools.set(handler.descriptor.id, handler);
  }

  get(id: string): ToolHandler | undefined {
    return this.tools.get(id);
  }

  /** Filtered capability set for a request. */
  list(filter?: { maxRisk?: RiskLevel; categories?: ToolDescriptor['category'][] }): ToolDescriptor[] {
    const order: RiskLevel[] = ['read', 'safe', 'write', 'external', 'destructive', 'sensitive'];
    const maxIdx = filter?.maxRisk ? order.indexOf(filter.maxRisk) : order.length - 1;
    return [...this.tools.values()]
      .map((t) => t.descriptor)
      .filter((d) => {
        if (filter?.categories && !filter.categories.includes(d.category)) return false;
        return order.indexOf(d.riskLevel) <= maxIdx;
      });
  }

  /** OpenAI-compatible tool defs for the model layer. */
  toModelTools(descriptors: ToolDescriptor[]): { name: string; description: string; parameters: Record<string, unknown> }[] {
    return descriptors.map((d) => ({
      name: d.id,
      description: `${d.description}${d.requiresApproval ? ' (requires user approval before execution)' : ''}`,
      parameters: d.inputSchema,
    }));
  }
}

// ── Schema helpers ────────────────────────────────────────────────────────
const str = (description: string): Record<string, unknown> => ({ type: 'string', description });

// ── Built-in tools ────────────────────────────────────────────────────────
export function createCoreTools(): ToolHandler[] {
  const handlers: ToolHandler[] = [];

  // Knowledge: web search (DuckDuckGo — no API key needed)
  handlers.push({
    descriptor: {
      id: 'web_search',
      name: 'Web Search',
      description: 'Search the public web and return ranked results with snippets.',
      category: 'knowledge',
      provider: 'core',
      riskLevel: 'read',
      requiresApproval: false,
      inputSchema: { type: 'object', properties: { query: str('Search query') }, required: ['query'] },
      associatedSkill: 'research',
    },
    run: async (args) => {
      const query = String(args['query'] ?? '');
      return searchWeb(query);
    },
  });

  // Knowledge: fetch a URL as text
  handlers.push({
    descriptor: {
      id: 'web_fetch',
      name: 'Fetch Page',
      description: 'Fetch a web page and extract readable text content.',
      category: 'knowledge',
      provider: 'core',
      riskLevel: 'read',
      requiresApproval: false,
      inputSchema: { type: 'object', properties: { url: str('Absolute http(s) URL') }, required: ['url'] },
      associatedSkill: 'research',
    },
    run: async (args) => {
      const url = String(args['url'] ?? '');
      if (!/^https?:\/\//i.test(url)) throw new Error('url must be an absolute http(s) URL');
      const res = await fetch(url, { headers: { accept: 'text/html' }, redirect: 'follow' });
      if (!res.ok) throw new Error(`Fetch failed with HTTP ${res.status}`);
      const html = await res.text();
      return { url, title: extractTitle(html), text: htmlToText(html).slice(0, 20_000) };
    },
  });

  return handlers;
}

// ── Web search implementation (kept concept from legacy, hardened) ────────
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string): Promise<{ query: string; results: SearchResult[] }> {
  if (!query.trim()) throw new Error('query is required');
  const results: SearchResult[] = [];

  try {
    // 1) DuckDuckGo Instant Answer API (structured, cheap)
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { accept: 'application/json' } }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: { Text?: string; FirstURL?: string }[];
      };
      if (data.AbstractText && data.AbstractURL) {
        results.push({ title: data.Heading ?? query, url: data.AbstractURL, snippet: data.AbstractText });
      }
      for (const topic of (data.RelatedTopics ?? []).slice(0, 8)) {
        if (topic.FirstURL && topic.Text) {
          results.push({ title: topic.Text.split(' - ')[0] ?? topic.Text, url: topic.FirstURL, snippet: topic.Text });
        }
      }
    }
  } catch {
    // fall through to HTML scraping
  }

  if (results.length < 3) {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; CloudBrainBot/2.0)' },
      });
      if (res.ok) {
        const html = await res.text();
        const seen = new Set<string>();
        const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) && results.length < 10) {
          const url = decodeDdgUrl(m[1]!);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const snippetRe = new RegExp(`href="${escapeRe(m[1]!)}"[\\s\\S]*?class="[^"]*result__snippet[^"]*"[^>]*>([\\s\\S]*?)<a`);
          const sm = snippetRe.exec(html);
          results.push({
            title: htmlToText(m[2]!).slice(0, 120),
            url,
            snippet: sm ? htmlToText(sm[1]!).slice(0, 240) : '',
          });
        }
      }
    } catch {
      // return whatever we have
    }
  }

  return { query, results: results.slice(0, 10) };
}

function decodeDdgUrl(href: string): string | null {
  try {
    const absolute = href.startsWith('http') ? href : `https://duckduckgo.com${href}`;
    const url = new URL(absolute);
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return null;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? htmlToText(m[1]!).slice(0, 200) : '';
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
