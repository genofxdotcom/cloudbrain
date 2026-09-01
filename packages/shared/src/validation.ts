import { z } from 'zod';

// ── Redaction ─────────────────────────────────────────────────────────────
// Never let provider credentials reach logs, model context, or the client.
const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|api_?key|authorization|credential|refresh|access_?token|cookie|private_?key/i;

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (typeof value === 'string') {
    // Long opaque strings that look like tokens (heuristics; conservative)
    if (value.length > 128 && /^[A-Za-z0-9_\-./+=]+$/.test(value)) return '[redacted]';
    return value.length > 300 ? value.slice(0, 300) + '…' : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[redacted]' : redactValue(v, depth + 1);
    }
    return out;
  }
  if (value === undefined) return null;
  return value;
}

export function redactToJson(value: unknown, maxLen = 2000): string | null {
  try {
    const json = JSON.stringify(redactValue(value));
    return json.length > maxLen ? json.slice(0, maxLen) + '…[truncated]' : json;
  } catch {
    return '[unserializable]';
  }
}

// ── API request schemas ───────────────────────────────────────────────────
// Identity is Cloudflare Access — no register/login payloads exist.

export const chatSendSchema = z.object({
  conversationId: z.string().min(1).max(100).optional(),
  message: z.string().min(1).max(32000),
  mode: z.enum(['quick', 'agent', 'deep']).default('quick'),
  model: z.string().max(100).optional(),
  projectId: z.string().max(100).optional(),
});

export const scheduleCreateSchema = z.object({
  name: z.string().min(1).max(200),
  cron: z.string().min(9).max(100),
  timezone: z.string().max(60).default('UTC'),
  prompt: z.string().min(1).max(8000),
  mode: z.enum(['quick', 'agent', 'deep']).default('agent'),
  enabled: z.boolean().default(true),
});

export const connectApiKeySchema = z.object({
  authConfigId: z.string().min(1).max(120).optional(),
  fields: z.record(z.string().max(8000)).optional(),
  label: z.string().max(120).optional(),
});

export const memoryAddSchema = z.object({
  kind: z.enum(['long_term', 'project', 'semantic', 'episodic']).default('long_term'),
  content: z.string().min(1).max(8000),
  projectId: z.string().max(100).optional(),
});

export type ChatSendInput = z.infer<typeof chatSendSchema>;
export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;
export type ConnectApiKeyInput = z.infer<typeof connectApiKeySchema>;
