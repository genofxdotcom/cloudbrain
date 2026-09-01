/**
 * CloudBrain V3 — server environment & bindings.
 * Keep in sync with wrangler.jsonc.
 */

/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // Bindings
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  REALTIME: DurableObjectNamespace;
  AI: Ai;
  ASSETS: Fetcher;

  // Secrets (BYOK — operator-set, server-only)
  COMPOSIO_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;

  // Vars
  APP_NAME: string;
}

export type { D1Database, R2Bucket, DurableObjectNamespace, Fetcher } from '@cloudflare/workers-types';
