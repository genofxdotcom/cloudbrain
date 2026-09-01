/**
 * Model layer — provider-flexible LLM abstraction.
 *
 * - `workers-ai` is always available (binding-backed, zero config) and is the
 *   default model so a fresh deployment works out of the box.
 * - Remote providers activate when the operator configures their BYOK secret.
 *   Keys are read from env only, never from the DB, and never returned.
 *
 * Unified call signature: messages + optional tools, returns text and/or
 * tool calls. Streaming emits token deltas through a callback.
 */

import type { ProviderId } from '@cloudbrain/shared';
import type { Env } from './env.js';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string (may need parsing)
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ChatOptions {
  model: string; // e.g. "workers-ai/llama-3.3-70b-instruct-fp8-fast" | "openai/gpt-4o-mini"
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
  temperature?: number;
  onToken?: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelConfig {
  provider: ProviderId;
  slug: string; // provider-native model name
  label: string;
  contextWindow?: number;
}

// Curated default catalog. Remote entries become available when keys exist.
export const MODEL_CATALOG: (ModelConfig & { secretKey?: keyof Env })[] = [
  {
    provider: 'workers-ai',
    slug: 'llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B (Workers AI)',
    contextWindow: 32_000,
  },
  { provider: 'workers-ai', slug: 'llama-3.1-8b-instruct-fast', label: 'Llama 3.1 8B fast (Workers AI)', contextWindow: 16_000 },
  { provider: 'openai', slug: 'gpt-4o-mini', label: 'GPT-4o mini', contextWindow: 128_000, secretKey: 'OPENAI_API_KEY' },
  { provider: 'openai', slug: 'gpt-4o', label: 'GPT-4o', contextWindow: 128_000, secretKey: 'OPENAI_API_KEY' },
  { provider: 'anthropic', slug: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', contextWindow: 200_000, secretKey: 'ANTHROPIC_API_KEY' },
  { provider: 'anthropic', slug: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', contextWindow: 200_000, secretKey: 'ANTHROPIC_API_KEY' },
  { provider: 'gemini', slug: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextWindow: 1_000_000, secretKey: 'GEMINI_API_KEY' },
  { provider: 'groq', slug: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Groq)', contextWindow: 128_000, secretKey: 'GROQ_API_KEY' },
  { provider: 'openrouter', slug: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', contextWindow: 200_000, secretKey: 'OPENROUTER_API_KEY' },
];

export const DEFAULT_MODEL = 'workers-ai/llama-3.3-70b-instruct-fp8-fast';

export function parseModelId(modelId: string): { provider: ProviderId; slug: string } | null {
  const idx = modelId.indexOf('/');
  if (idx <= 0) return null;
  const provider = modelId.slice(0, idx) as ProviderId;
  const slug = modelId.slice(idx + 1);
  if (!MODEL_CATALOG.some((m) => m.provider === provider)) return null;
  return { provider, slug };
}

export function availableModels(env: Env): ModelOptionInternal[] {
  return MODEL_CATALOG.map((m) => ({
    id: `${m.provider}/${m.slug}`,
    provider: m.provider,
    label: m.label,
    available: m.provider === 'workers-ai' || (m.secretKey ? Boolean(env[m.secretKey]) : false),
    contextWindow: m.contextWindow,
  }));
}

export interface ModelOptionInternal {
  id: string;
  provider: ProviderId;
  label: string;
  available: boolean;
  contextWindow?: number;
}

export class ModelGateway {
  constructor(private readonly env: Env) {}

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const parsed = parseModelId(opts.model) ?? parseModelId(DEFAULT_MODEL);
    if (!parsed) throw new Error(`Unknown model: ${opts.model}`);

    switch (parsed.provider) {
      case 'workers-ai':
        return this.chatWorkersAI(parsed.slug, opts);
      case 'openai':
      case 'groq':
      case 'openrouter':
        return this.chatOpenAICompatible(parsed.provider, parsed.slug, opts);
      case 'anthropic':
        return this.chatAnthropic(parsed.slug, opts);
      case 'gemini':
        return this.chatGemini(parsed.slug, opts);
      default:
        throw new Error(`Provider ${parsed.provider} is not supported yet.`);
    }
  }

  // ── Workers AI (binding) ────────────────────────────────────────────────
  private async chatWorkersAI(slug: string, opts: ChatOptions): Promise<ChatResult> {
    const model = opts.tools?.length ? '@cf/meta/llama-3.3-70b-instruct-fp8-tool' : `@cf/meta/${slug}`;
    const response = (await (this.env.AI as unknown as {
      run: (m: string, input: unknown) => Promise<unknown>;
    }).run(model, {
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      stream: false,
    })) as { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };

    const text = response.response ?? '';
    if (opts.onToken && text) await opts.onToken(text);
    return {
      text,
      toolCalls: [],
      model: `workers-ai/${slug}`,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
    };
  }

  // ── OpenAI-compatible (OpenAI, Groq, OpenRouter) ───────────────────────
  private async chatOpenAICompatible(
    provider: 'openai' | 'groq' | 'openrouter',
    slug: string,
    opts: ChatOptions
  ): Promise<ChatResult> {
    const { baseUrl, apiKey } = this.openAiCompatCreds(provider);
    const body: Record<string, unknown> = {
      model: slug,
      messages: opts.messages.map((m) => {
        if (m.role === 'tool') {
          return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
        }
        if (m.role === 'assistant' && m.tool_calls?.length) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
        }
        return { role: m.role, content: m.content };
      }),
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      stream: Boolean(opts.onToken),
    };
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Model provider ${provider} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    if (opts.onToken) {
      return this.consumeOpenAIStream(res, opts, provider, slug);
    }
    const data = (await res.json()) as OpenAIChatResponse;
    const choice = data.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
    return {
      text: choice?.message?.content ?? '',
      toolCalls,
      model: `${provider}/${slug}`,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  private async consumeOpenAIStream(
    res: Response,
    opts: ChatOptions,
    provider: string,
    slug: string
  ): Promise<ChatResult> {
    let text = '';
    const toolCalls: ToolCall[] = [];
    const reader = res.body?.getReader();
    if (!reader) return { text: '', toolCalls, model: `${provider}/${slug}` };
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as OpenAIChatResponse;
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            text += delta.content;
            await opts.onToken?.(delta.content);
          }
          for (const tc of delta?.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const existing = toolCalls[idx];
            if (!existing) {
              toolCalls[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' };
            } else {
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            }
          }
        } catch {
          // ignore malformed SSE fragments
        }
      }
    }
    return { text, toolCalls: toolCalls.filter(Boolean), model: `${provider}/${slug}` };
  }

  private openAiCompatCreds(provider: 'openai' | 'groq' | 'openrouter'): { baseUrl: string; apiKey: string } {
    switch (provider) {
      case 'openai':
        this.requireKey('OPENAI_API_KEY');
        return { baseUrl: 'https://api.openai.com/v1', apiKey: this.env.OPENAI_API_KEY! };
      case 'groq':
        this.requireKey('GROQ_API_KEY');
        return { baseUrl: 'https://api.groq.com/openai/v1', apiKey: this.env.GROQ_API_KEY! };
      case 'openrouter':
        this.requireKey('OPENROUTER_API_KEY');
        return { baseUrl: 'https://openrouter.ai/api/v1', apiKey: this.env.OPENROUTER_API_KEY! };
    }
  }

  private requireKey(key: keyof Env): void {
    if (!this.env[key]) {
      throw new Error(
        `Model provider not configured. Set the ${String(key)} secret (wrangler secret put ${String(key)}).`
      );
    }
  }

  // ── Anthropic ───────────────────────────────────────────────────────────
  private async chatAnthropic(slug: string, opts: ChatOptions): Promise<ChatResult> {
    this.requireKey('ANTHROPIC_API_KEY');
    const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const turns = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body: Record<string, unknown> = {
      model: slug,
      system: system || undefined,
      messages: turns,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      stream: Boolean(opts.onToken),
    };
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    let text = '';
    const toolCalls: ToolCall[] = [];
    if (opts.onToken) {
      // SSE stream: content_block_delta events carry text; tool_use arrives in blocks.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let blockIdx = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          try {
            const evt = JSON.parse(payload) as AnthropicStreamEvent;
            if (evt.type === 'content_block_start') {
              blockIdx = evt.index ?? 0;
              if (evt.content_block?.type === 'tool_use') {
                toolCalls.push({ id: evt.content_block.id ?? '', name: evt.content_block.name ?? '', arguments: '' });
              }
            } else if (evt.type === 'content_block_delta' && evt.delta) {
              if (evt.delta.type === 'text_delta' && evt.delta.text) {
                text += evt.delta.text;
                await opts.onToken(evt.delta.text);
              } else if (evt.delta.type === 'input_json_delta' && toolCalls[blockIdx]) {
                toolCalls[blockIdx]!.arguments += evt.delta.partial_json ?? '';
              }
            }
          } catch {
            // ignore malformed SSE
          }
        }
      }
    } else {
      const data = (await res.json()) as AnthropicResponse;
      for (const block of data.content ?? []) {
        if (block.type === 'text') text += block.text;
        if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
        }
      }
    }
    return { text, toolCalls: toolCalls.filter(Boolean), model: `anthropic/${slug}` };
  }

  // ── Gemini ──────────────────────────────────────────────────────────────
  private async chatGemini(slug: string, opts: ChatOptions): Promise<ChatResult> {
    this.requireKey('GEMINI_API_KEY');
    const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const body: Record<string, unknown> = {
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 2048, temperature: opts.temperature ?? 0.4 },
    };
    if (opts.tools?.length) {
      body.tools = [
        {
          functionDeclarations: opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(slug)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': this.env.GEMINI_API_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: crypto.randomUUID(),
          name: part.functionCall.name ?? '',
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        });
      }
    }
    if (opts.onToken && text) await opts.onToken(text);
    return { text, toolCalls, model: `gemini/${slug}` };
  }
}

// ── Provider response shapes (minimal) ───────────────────────────────────
interface OpenAIChatResponse {
  choices?: {
    message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
    delta?: {
      content?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface AnthropicResponse {
  content?: ({ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown })[];
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type: string; text?: string; partial_json?: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }[] } }[];
}
