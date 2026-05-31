import { AIProviderManager, ChatMessage } from './providers';
import { log } from '../utils/logger';
import { getCredential } from '../db/credentials';

const SYSTEM_PROMPT = `You are CloudBrain, a powerful AI assistant. Respond naturally like a helpful friend. Be direct and action-oriented. Execute tasks, don't just talk about them. Never prefix responses with "AI:", "Bot:", etc.`;

/**
 * WorkersAI - Multi-provider AI client
 * Supports: OpenAI, Anthropic, Gemini, Groq, Together, OpenRouter, Cloudflare Workers AI, custom
 */
export class WorkersAI {
  private providerManager: AIProviderManager;
  private initialized = false;

  constructor() {
    this.providerManager = new AIProviderManager();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.providerManager.loadProviders();
    this.initialized = true;
  }

  getProviderManager(): AIProviderManager {
    return this.providerManager;
  }

  async chat(prompt: string, systemPrompt?: string): Promise<string> {
    await this.init();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt || SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    const response = await this.providerManager.chat(messages);
    return this.cleanResponse(response);
  }

  async chatWithHistory(messages: ChatMessage[]): Promise<string> {
    await this.init();
    const response = await this.providerManager.chat(messages);
    return this.cleanResponse(response);
  }

  async generateImage(prompt: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    // Image generation still uses Cloudflare Workers AI directly
    const accountId = await getCredential('CF_ACCOUNT_ID');
    const apiToken = await getCredential('CF_API_TOKEN');
    if (!accountId || !apiToken) return { success: false, error: 'Cloudflare not configured for image generation' };

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) return { success: false, error: `API returned ${response.status}` };
      const buffer = Buffer.from(await response.arrayBuffer());
      return { success: true, data: buffer };
    } catch (error: any) {
      log.error('AI', `Image gen error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<{ success: boolean; text?: string; error?: string }> {
    const accountId = await getCredential('CF_ACCOUNT_ID');
    const apiToken = await getCredential('CF_API_TOKEN');
    if (!accountId || !apiToken) return { success: false, error: 'Cloudflare not configured for transcription' };

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}` },
          body: audioBuffer,
        }
      );

      const data: any = await response.json();
      if (data.result?.text) return { success: true, text: data.result.text };
      return { success: false, error: 'No transcription returned' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private cleanResponse(text: string): string {
    let cleaned = text.trim();
    const prefixes = [
      /^(AI|Bot|Assistant|CloudBrain|Response|Answer)\s*[:\-]\s*/i,
      /^(Here is|Here's) (my |your |the )?(response|answer)[:\s]*/i,
      /^💭\s*/,
    ];
    for (const p of prefixes) cleaned = cleaned.replace(p, '');
    return cleaned.trim();
  }
}
