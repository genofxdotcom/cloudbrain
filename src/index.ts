import { ChannelManager } from './channels/manager';
import { MemoryDatabase } from './db/memory';
import { ensureWebhookSetup, getWebhookStatus } from './webhook-setup';
import { CloudflareAPIManager } from './cloudflare/api-manager';
import { WebSearch } from './search/web-search';
import { HeartbeatScheduler } from './scheduling/heartbeat-scheduler';
import { AIContentGenerator } from './ai/content-generator';

export interface Env {
  SECRETS: any; // KVNamespace binding
  DB: any; // D1Database binding
  AI: any; // Workers AI binding
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

// Deduplication: track recently processed update IDs to avoid double-processing
// Telegram retries webhooks if response is slow, causing duplicates
const recentlyProcessed = new Set<string>();
const DEDUP_TTL = 60_000; // 60 seconds

function isDuplicate(updateId: string): boolean {
  if (recentlyProcessed.has(updateId)) return true;
  recentlyProcessed.add(updateId);
  // Auto-cleanup after TTL
  setTimeout(() => recentlyProcessed.delete(updateId), DEDUP_TTL);
  return false;
}

const textEncoder = new TextEncoder();

// ============================================================================
// SYSTEM PROMPT - Defines agent personality and capabilities
// ============================================================================
const SYSTEM_PROMPT = `You are CloudBrain, a powerful AI assistant. You respond naturally like a helpful friend. You NEVER prefix your responses with labels like "AI:", "Bot:", "Response:", "Answer:" or any similar prefix. You never say things like "Processing your request" or "Task completed successfully" or "Here is your response". You just answer directly.

You can:
- Search the web for current information
- Manage Cloudflare services (domains, DNS, Workers, KV, D1, R2)
- Generate images, transcribe audio
- Schedule recurring tasks (heartbeat/cron)
- Store and recall memories
- Handle media files

Be concise. Be natural. Just answer.`;

// ============================================================================
// UTILITIES
// ============================================================================

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function verifyDiscordSignature(request: Request, rawBody: string, publicKeyHex: string): Promise<boolean> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  if (!signature || !timestamp || !publicKeyHex) return false;
  const publicKey = hexToBytes(publicKeyHex);
  const signatureBytes = hexToBytes(signature);
  if (!publicKey || !signatureBytes) return false;
  try {
    const key = await crypto.subtle.importKey('raw', toArrayBuffer(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, toArrayBuffer(signatureBytes), toArrayBuffer(textEncoder.encode(`${timestamp}${rawBody}`)));
  } catch { return false; }
}

async function getCredentialsFromKV(env: Env): Promise<Record<string, string>> {
  const keys = [
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_OWNER_ID',
    'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_WEBHOOK_URL',
    'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_VERIFY_TOKEN',
    'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID',
  ];
  const credentials: Record<string, string> = {};
  for (const key of keys) {
    const value = await env.SECRETS.get(key);
    if (value) credentials[key] = value;
  }
  return credentials;
}

/**
 * Strip AI-generated prefixes that models sometimes add despite system prompt
 */
function cleanAIResponse(text: string): string {
  // Remove common LLM prefixes
  let cleaned = text.trim();
  const prefixes = [
    /^(AI|Bot|Assistant|CloudBrain|Response|Answer|Reply)\s*[:\-]\s*/i,
    /^(Here is|Here's) (my |your |the )?(response|answer|reply)[:\s]*/i,
    /^(I'd be happy to help|Sure|Of course|Certainly)[!.]?\s*/i,
    /^💭\s*/,
    /^🤖\s*/,
  ];
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }
  return cleaned.trim();
}

// ============================================================================
// MAIN WORKER EXPORT
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      const credentials = await getCredentialsFromKV(env);
      const channelManager = new ChannelManager();
      await channelManager.initializeChannels(credentials);

      const memoryDb = new MemoryDatabase(env.DB);
      await memoryDb.initialize();

      // Background Telegram webhook setup
      if (channelManager.isChannelActive('telegram') && credentials.TELEGRAM_BOT_TOKEN) {
        ctx.waitUntil(ensureWebhookSetup(credentials.TELEGRAM_BOT_TOKEN, url.origin).catch(() => {}));
      }

      // ===== GET ROUTES =====
      if (request.method === 'GET') {
        if (pathname === '/health' || pathname === '/test' || pathname === '/') {
          return json({ status: 'CloudBrain running', channels: channelManager.getActiveChannels(), ts: new Date().toISOString() });
        }
        if (pathname === '/webhook/status' || pathname === '/telegram/status') {
          if (!credentials.TELEGRAM_BOT_TOKEN) return json({ error: 'Telegram not configured' }, 400);
          return json({ webhook: await getWebhookStatus(credentials.TELEGRAM_BOT_TOKEN) });
        }
        if (pathname === '/whatsapp') {
          const challenge = url.searchParams.get('hub.challenge');
          if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === credentials.WHATSAPP_VERIFY_TOKEN && challenge) {
            return new Response(challenge, { status: 200 });
          }
          return new Response('Forbidden', { status: 403 });
        }
        return json({ status: 'CloudBrain running' });
      }

      // ===== POST ROUTES =====
      if (request.method === 'POST') {
        const rawBody = await request.text();
        let payload: any;
        try { payload = JSON.parse(rawBody); } catch { return ok(); }

        // --- TELEGRAM ---
        if (pathname === '/' || pathname === '/telegram') {
          // Deduplication check using update_id
          const updateId = payload.update_id?.toString();
          if (updateId && isDuplicate(updateId)) return ok();

          const message = await channelManager.routeWebhook('telegram', payload);
          if (!message) return ok();
          ctx.waitUntil(processMessage(env, credentials, channelManager, memoryDb, message));
          return ok();
        }

        // --- DISCORD ---
        if (pathname === '/discord') {
          const pubKey = credentials.DISCORD_PUBLIC_KEY;
          if (!pubKey) return new Response('Not configured', { status: 500 });
          if (!(await verifyDiscordSignature(request, rawBody, pubKey))) return new Response('Unauthorized', { status: 401 });
          if (payload.type === 1) return json({ type: 1 });

          const message = await channelManager.routeWebhook('discord', payload);
          if (!message) return json({ type: 4, data: { content: 'Could not process.', flags: 64 } });
          ctx.waitUntil(processMessage(env, credentials, channelManager, memoryDb, message));
          return json({ type: 5 }); // ACK deferred
        }

        // --- WHATSAPP ---
        if (pathname === '/whatsapp') {
          const message = await channelManager.routeWebhook('whatsapp', payload);
          if (!message) return ok();
          ctx.waitUntil(processMessage(env, credentials, channelManager, memoryDb, message));
          return ok();
        }

        return ok();
      }

      return new Response('Method not allowed', { status: 405 });
    } catch (error) {
      console.error('Fatal:', error);
      return ok();
    }
  },
};

function ok() { return new Response('OK', { status: 200 }); }
function json(data: any, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }

// ============================================================================
// CORE: Process a single user message. ONE input → ONE output. No spam.
// For multi-step tasks, sends progress messages ONLY when truly multi-step.
// ============================================================================

async function processMessage(
  env: Env,
  credentials: Record<string, string>,
  channelManager: ChannelManager,
  memoryDb: MemoryDatabase,
  message: any
): Promise<void> {
  try {
    const userText = message.text?.trim();
    if (!userText) return;

    const send = (text: string) => channelManager.sendMessage(message.channelType, message.userId, text);

    // Initialize all services
    const webSearch = new WebSearch(env.SECRETS);
    const aiGen = new AIContentGenerator(env.AI);
    const scheduler = new HeartbeatScheduler(
      env.SECRETS,
      credentials.CLOUDFLARE_API_TOKEN || '',
      credentials.CLOUDFLARE_ACCOUNT_ID || '',
      'cloudbrain'
    );
    let cfApi: CloudflareAPIManager | null = null;
    if (credentials.CLOUDFLARE_API_TOKEN && credentials.CLOUDFLARE_ACCOUNT_ID) {
      cfApi = new CloudflareAPIManager({ apiToken: credentials.CLOUDFLARE_API_TOKEN, accountId: credentials.CLOUDFLARE_ACCOUNT_ID });
    }

    // Route to the correct handler and get ONE response
    const response = await routeRequest(userText, env, channelManager, memoryDb, webSearch, aiGen, scheduler, cfApi, message, send);

    // Send the single final response
    if (response) await send(response);

    // Silently store in memory
    try {
      await memoryDb.storeMemory({ userId: message.userId, channelType: message.channelType, content: `Q: ${userText}\nA: ${response || ''}`, importance: 3 });
    } catch {}

  } catch (error) {
    console.error('processMessage error:', error);
    try {
      await channelManager.sendMessage(message.channelType, message.userId, `Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } catch {}
  }
}

// ============================================================================
// ROUTER: Detect intent from FULL sentence context (not single keywords)
// ============================================================================

async function routeRequest(
  userText: string,
  env: Env,
  channelManager: ChannelManager,
  memoryDb: MemoryDatabase,
  webSearch: WebSearch,
  aiGen: AIContentGenerator,
  scheduler: HeartbeatScheduler,
  cfApi: CloudflareAPIManager | null,
  message: any,
  send: (text: string) => Promise<boolean>
): Promise<string> {
  const lower = userText.toLowerCase();

  // ===== WEB SEARCH - must be explicit multi-word phrase =====
  if (matchesSearch(lower)) {
    const query = extractAfter(lower, ['search for', 'search about', 'look up', 'find me', 'find out about', 'google', 'search the web for']);
    const results = await webSearch.search(query || userText);
    if (results.success && results.results && results.results.length > 0) {
      return webSearch.formatResults(results.results, query || userText);
    }
    return await askAI(env, userText);
  }

  // ===== IMAGE GENERATION =====
  if (matchesImage(lower)) {
    const prompt = extractAfter(lower, ['generate image of', 'generate an image of', 'create image of', 'create an image of', 'make image of', 'make an image of', 'draw me', 'draw a', 'draw']);
    await send(`Generating image: "${prompt || userText}"...`);
    const result = await aiGen.generateImage(prompt || userText);
    if (result.success) {
      return `Done! Image created for "${prompt || userText}" using Stable Diffusion XL.`;
    }
    return `Could not generate image: ${result.error || 'unknown error'}`;
  }

  // ===== SCHEDULING (heartbeat) - requires BOTH time pattern AND action context =====
  if (matchesSchedule(lower, userText)) {
    const { taskName, action, timeExpression } = parseSchedule(userText);
    const result = await scheduler.createScheduledTask(
      message.userId, taskName, action, timeExpression,
      undefined, { userId: message.userId, channelType: message.channelType }
    );
    return result.success
      ? (result.message || 'Scheduled.')
      : (result.error || 'Could not schedule. Try "at 9am", "every hour", "daily".');
  }

  // ===== LIST TASKS =====
  if (lower.includes('my tasks') || lower.includes('my schedules') || lower.includes('list tasks') || lower.includes('show tasks') || lower.includes('scheduled tasks')) {
    const tasks = await scheduler.listUserTasks(message.userId);
    return scheduler.formatTasksForDisplay(tasks);
  }

  // ===== CLOUDFLARE API =====
  if (cfApi && matchesCloudflare(lower)) {
    return await handleCF(lower, cfApi);
  }

  // ===== MEMORY =====
  if (matchesMemory(lower)) {
    const memories = await memoryDb.getUserMemories(message.userId, 5);
    if (memories.length === 0) return "I don't have any saved memories yet.";
    return memories.map((m, i) => `${i + 1}. ${m.content.substring(0, 120)}`).join('\n\n');
  }

  // ===== DEFAULT: AI chat =====
  return await askAI(env, userText);
}

// ============================================================================
// AI CALL - with response cleaning
// ============================================================================

async function askAI(env: Env, userText: string): Promise<string> {
  try {
    const res = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
    });
    const raw = res?.response || "I couldn't generate a response.";
    return cleanAIResponse(raw);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'AI unavailable'}`;
  }
}

// ============================================================================
// INTENT MATCHERS - Require full phrase context, NOT single keywords
// ============================================================================

function matchesSearch(text: string): boolean {
  // Requires explicit multi-word search phrases
  const phrases = ['search for ', 'search about ', 'look up ', 'find me ', 'find out about ', 'google ', 'search the web', 'search online', 'what is the latest', 'latest news about'];
  return phrases.some(p => text.includes(p));
}

function matchesImage(text: string): boolean {
  const phrases = ['generate image', 'generate an image', 'create image', 'create an image', 'make image', 'make an image', 'draw me', 'draw a '];
  return phrases.some(p => text.includes(p));
}

function matchesSchedule(lower: string, original: string): boolean {
  // Must have a clear time expression AND enough words to be intentional (not just "look at this")
  const timePattern = /\b(at\s+\d{1,2}\s*(am|pm))\b/i;
  const recurPattern = /\b(every\s+(hour|day|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s+minutes?))\b/i;
  const hasTime = timePattern.test(original) || recurPattern.test(original) || /\b(daily|hourly)\b/i.test(original);
  // Also must have at least 4 words total to avoid false positives like "look at 5pm" in casual speech
  const wordCount = original.split(/\s+/).length;
  // And must contain an action-like verb or noun beyond just time
  const hasAction = /\b(send|give|get|remind|run|do|check|fetch|news|report|backup|update|alert|notify)\b/i.test(original);
  return hasTime && wordCount >= 4 && hasAction;
}

function matchesCloudflare(text: string): boolean {
  const phrases = ['my domains', 'list domains', 'show domains', 'create domain', 'delete domain',
    'my workers', 'list workers', 'show workers', 'deploy worker', 'delete worker',
    'list kv', 'create kv', 'kv namespaces',
    'my databases', 'list databases', 'create database',
    'list buckets', 'r2 buckets', 'create bucket',
    'dns records', 'add dns', 'list dns', 'firewall rules'];
  return phrases.some(p => text.includes(p));
}

function matchesMemory(text: string): boolean {
  const phrases = ['what did i tell you', 'what did i say', 'recall my', 'my memories', 'remember what'];
  return phrases.some(p => text.includes(p));
}

// ============================================================================
// EXTRACTORS
// ============================================================================

function extractAfter(text: string, prefixes: string[]): string {
  for (const p of prefixes) {
    const idx = text.indexOf(p);
    if (idx !== -1) return text.substring(idx + p.length).trim();
  }
  return text;
}

function parseSchedule(text: string): { taskName: string; action: string; timeExpression: string } {
  const timePatterns = [
    /at\s+\d{1,2}\s*(am|pm)/i,
    /every\s+(hour|day|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /every\s+\d+\s+minutes?/i,
    /\bdaily\b/i,
    /\bhourly\b/i,
  ];
  let timeExpression = '';
  for (const p of timePatterns) {
    const m = text.match(p);
    if (m) { timeExpression = m[0]; break; }
  }
  const action = text.replace(new RegExp(timeExpression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/^\s*(please\s+)?(send|give|get|fetch|run|do|execute)\s+(me\s+)?/i, '').trim();
  const taskName = action.substring(0, 50) || 'Scheduled task';
  return { taskName, action: action || text, timeExpression: timeExpression || text };
}

// ============================================================================
// CLOUDFLARE API HANDLER
// ============================================================================

async function handleCF(lower: string, cfApi: CloudflareAPIManager): Promise<string> {
  try {
    if (lower.includes('list domains') || lower.includes('my domains') || lower.includes('show domains')) {
      const r = await cfApi.listZones();
      if (!r.success) return `Could not fetch domains: ${r.error}`;
      const d = r.data as any[];
      if (!d || d.length === 0) return 'No domains found.';
      return d.map((z: any, i: number) => `${i + 1}. ${z.name} (${z.status})`).join('\n');
    }
    if (lower.includes('list workers') || lower.includes('my workers') || lower.includes('show workers')) {
      const r = await cfApi.listWorkers();
      if (!r.success) return `Could not fetch workers: ${r.error}`;
      const d = r.data as any[];
      if (!d || d.length === 0) return 'No workers deployed.';
      return d.map((w: any, i: number) => `${i + 1}. ${w.id}`).join('\n');
    }
    if (lower.includes('list kv') || lower.includes('kv namespaces')) {
      const r = await cfApi.listKVNamespaces();
      if (!r.success) return `Could not fetch KV: ${r.error}`;
      const d = r.data as any[];
      if (!d || d.length === 0) return 'No KV namespaces.';
      return d.map((ns: any, i: number) => `${i + 1}. ${ns.title} (${ns.id.substring(0, 8)}...)`).join('\n');
    }
    if (lower.includes('list databases') || lower.includes('my databases')) {
      const r = await cfApi.listD1Databases();
      if (!r.success) return `Could not fetch databases: ${r.error}`;
      const d = r.data as any[];
      if (!d || d.length === 0) return 'No D1 databases.';
      return d.map((db: any, i: number) => `${i + 1}. ${db.name}`).join('\n');
    }
    if (lower.includes('list buckets') || lower.includes('r2 buckets')) {
      const r = await cfApi.listR2Buckets();
      if (!r.success) return `Could not fetch R2: ${r.error}`;
      const d = r.data as any[];
      if (!d || d.length === 0) return 'No R2 buckets.';
      return d.map((b: any, i: number) => `${i + 1}. ${b.name}`).join('\n');
    }
    return `Available commands:\n- list my domains\n- list my workers\n- list kv namespaces\n- list my databases\n- list r2 buckets`;
  } catch (error) {
    return `Cloudflare API error: ${error instanceof Error ? error.message : 'unknown'}`;
  }
}
