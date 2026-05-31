import { query } from '../db/connection';
import { log } from '../utils/logger';

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  isActive: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Pre-made provider templates (user just adds API key)
 */
export const PROVIDER_TEMPLATES: Record<string, { name: string; baseUrl: string; models: string[] }> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini', 'o1-preview'],
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Llama-3.1-8B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.0-flash-exp', 'meta-llama/llama-3.3-70b-instruct'],
  },
  cloudflare: {
    name: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4',
    models: ['@cf/meta/llama-2-7b-chat-int8', '@cf/meta/llama-3-8b-instruct', '@cf/mistral/mistral-7b-instruct-v0.1'],
  },
};

/**
 * AI Provider Manager - handles multiple providers and model switching
 */
export class AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private activeProviderId: string = '';
  private activeModel: string = '';

  /**
   * Load all providers from DB
   */
  async loadProviders(): Promise<void> {
    const rows = await query('SELECT * FROM ai_providers');
    for (const row of rows) {
      const provider: AIProvider = {
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        apiKey: row.api_key,
        models: JSON.parse(row.models || '[]'),
        isActive: row.is_active === 1,
      };
      this.providers.set(row.id, provider);
      if (provider.isActive) {
        this.activeProviderId = provider.id;
      }
    }

    // Load active model
    const modelRow = await query('SELECT value FROM system_config WHERE key = ?', ['active_model']);
    if (modelRow.length > 0) this.activeModel = modelRow[0].value;

    log.info('AI', `Loaded ${this.providers.size} provider(s), active: ${this.activeProviderId || 'none'}`);
  }

  /**
   * Add a provider (pre-made or custom)
   */
  async addProvider(id: string, name: string, baseUrl: string, apiKey: string, models: string[]): Promise<void> {
    // Deactivate all others if this is the first
    const isFirst = this.providers.size === 0;

    await query(
      'INSERT OR REPLACE INTO ai_providers (id, name, base_url, api_key, models, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, baseUrl, apiKey, JSON.stringify(models), isFirst ? 1 : 0]
    );

    const provider: AIProvider = { id, name, baseUrl, apiKey, models, isActive: isFirst };
    this.providers.set(id, provider);

    if (isFirst) {
      this.activeProviderId = id;
      this.activeModel = models[0] || '';
      await query('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)', ['active_model', this.activeModel]);
    }

    log.success('AI', `Provider added: ${name} (${models.length} models)`);
  }

  /**
   * Remove a provider
   */
  async removeProvider(id: string): Promise<boolean> {
    await query('DELETE FROM ai_providers WHERE id = ?', [id]);
    this.providers.delete(id);
    if (this.activeProviderId === id) {
      this.activeProviderId = '';
      this.activeModel = '';
    }
    return true;
  }

  /**
   * Switch active provider
   */
  async switchProvider(id: string): Promise<boolean> {
    const provider = this.providers.get(id);
    if (!provider) return false;

    // Deactivate all
    await query('UPDATE ai_providers SET is_active = 0');
    for (const [, p] of this.providers) p.isActive = false;

    // Activate selected
    await query('UPDATE ai_providers SET is_active = 1 WHERE id = ?', [id]);
    provider.isActive = true;
    this.activeProviderId = id;
    this.activeModel = provider.models[0] || '';
    await query('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)', ['active_model', this.activeModel]);

    log.info('AI', `Switched to provider: ${provider.name}, model: ${this.activeModel}`);
    return true;
  }

  /**
   * Switch active model (within current provider)
   */
  async switchModel(model: string): Promise<boolean> {
    const provider = this.getActiveProvider();
    if (!provider) return false;
    if (!provider.models.includes(model)) return false;

    this.activeModel = model;
    await query('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)', ['active_model', model]);
    log.info('AI', `Switched model: ${model}`);
    return true;
  }

  /**
   * Get active provider
   */
  getActiveProvider(): AIProvider | null {
    if (!this.activeProviderId) return null;
    return this.providers.get(this.activeProviderId) || null;
  }

  /**
   * Get active model name
   */
  getActiveModel(): string {
    return this.activeModel;
  }

  /**
   * Get all providers
   */
  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Chat using the active provider
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    const provider = this.getActiveProvider();
    if (!provider) return 'No AI provider configured. Use /provider or run "cloudbrain setup" to add one.';

    try {
      if (provider.id === 'cloudflare') {
        return this.chatCloudflare(provider, messages);
      } else if (provider.id === 'anthropic') {
        return this.chatAnthropic(provider, messages);
      } else if (provider.id === 'gemini') {
        return this.chatGemini(provider, messages);
      } else {
        // OpenAI-compatible (OpenAI, Groq, Together, OpenRouter, custom)
        return this.chatOpenAICompatible(provider, messages);
      }
    } catch (error: any) {
      log.error('AI', `Chat error (${provider.name}): ${error.message}`);
      return `AI error: ${error.message}`;
    }
  }

  /**
   * OpenAI-compatible API (works for OpenAI, Groq, Together, OpenRouter, and most custom providers)
   */
  private async chatOpenAICompatible(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.activeModel,
        messages,
        max_tokens: 2048,
      }),
    });

    const data: any = await response.json();
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }
    if (data.error) {
      return `API error: ${data.error.message || JSON.stringify(data.error)}`;
    }
    return 'No response from AI.';
  }

  /**
   * Anthropic API (different format)
   */
  private async chatAnthropic(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    // Anthropic separates system prompt from messages
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': provider.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.activeModel,
        max_tokens: 2048,
        system: systemMsg?.content || '',
        messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data: any = await response.json();
    if (data.content?.[0]?.text) {
      return data.content[0].text.trim();
    }
    if (data.error) {
      return `Anthropic error: ${data.error.message || JSON.stringify(data.error)}`;
    }
    return 'No response from Anthropic.';
  }

  /**
   * Google Gemini API
   */
  private async chatGemini(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    const contents = chatMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await fetch(
      `${provider.baseUrl}/models/${this.activeModel}:generateContent?key=${provider.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        }),
      }
    );

    const data: any = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    if (data.error) {
      return `Gemini error: ${data.error.message || JSON.stringify(data.error)}`;
    }
    return 'No response from Gemini.';
  }

  /**
   * Cloudflare Workers AI
   */
  private async chatCloudflare(provider: AIProvider, messages: ChatMessage[]): Promise<string> {
    // Get account ID from credentials
    const { getCredential } = require('../db/credentials');
    const accountId = await getCredential('CF_ACCOUNT_ID');
    if (!accountId) return 'Cloudflare Account ID not set.';

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${this.activeModel}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      }
    );

    const data: any = await response.json();
    if (data.result?.response) {
      return data.result.response.trim();
    }
    return 'No response from Workers AI.';
  }
}
