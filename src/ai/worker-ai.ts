import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';

const SYSTEM_PROMPT = `You are CloudBrain, a powerful AI assistant. Respond naturally like a helpful friend. Never prefix responses with "AI:", "Bot:", etc. Never say "Processing..." or "Done!". Just answer directly and concisely.`;

/**
 * Workers AI client - calls Cloudflare Workers AI API directly
 */
export class WorkersAI {
  private accountId: string = '';
  private apiToken: string = '';

  async init(): Promise<void> {
    this.accountId = (await getCredential('CF_ACCOUNT_ID')) || '';
    this.apiToken = (await getCredential('CF_API_TOKEN')) || '';
  }

  async chat(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.accountId || !this.apiToken) await this.init();
    if (!this.apiToken) return 'AI not configured. Run "cloudbrain setup" and add Cloudflare credentials.';

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/meta/llama-2-7b-chat-int8`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt || SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
        }
      );

      const data = await response.json();
      if (data.result?.response) {
        return this.cleanResponse(data.result.response);
      }
      return 'Could not generate a response.';
    } catch (error: any) {
      log.error('AI', `Chat error: ${error.message}`);
      return `AI error: ${error.message}`;
    }
  }

  async generateImage(prompt: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    if (!this.accountId || !this.apiToken) await this.init();
    if (!this.apiToken) return { success: false, error: 'Not configured' };

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        return { success: false, error: `API returned ${response.status}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return { success: true, data: buffer };
    } catch (error: any) {
      log.error('AI', `Image gen error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<{ success: boolean; text?: string; error?: string }> {
    if (!this.accountId || !this.apiToken) await this.init();
    if (!this.apiToken) return { success: false, error: 'Not configured' };

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/openai/whisper`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.apiToken}` },
          body: audioBuffer,
        }
      );

      const data = await response.json();
      if (data.result?.text) {
        return { success: true, text: data.result.text };
      }
      return { success: false, error: 'No transcription returned' };
    } catch (error: any) {
      log.error('AI', `Transcription error: ${error.message}`);
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
