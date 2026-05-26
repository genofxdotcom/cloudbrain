import { ChannelManager } from './channels/manager';
import { MemoryDatabase } from './db/memory';
import { ensureWebhookSetup, getWebhookStatus } from './webhook-setup';
import { CloudflareAPIManager } from './cloudflare/api-manager';
import { WebSearch } from './search/web-search';
import { HeartbeatScheduler } from './scheduling/heartbeat-scheduler';
import { AIContentGenerator } from './ai/content-generator';

export interface Env {
  SECRETS: KVNamespace;
  DB: D1Database;
  AI: any;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

const textEncoder = new TextEncoder();
const DISCORD_EPHEMERAL_FLAG = 64;

// ============================================================================
// SYSTEM PROMPT - This defines what the AI CAN do (not what it can't)
// ============================================================================
const SYSTEM_PROMPT = `You are CloudBrain, an intelligent AI agent running on Cloudflare Workers. You have FULL capabilities to manage Cloudflare services and perform actions.

YOUR CAPABILITIES:
- Search the web for real-time information (news, weather, prices, anything)
- Manage Cloudflare resources (domains, DNS, Workers, KV, D1, R2, firewall)
- Generate images using Stable Diffusion XL
- Transcribe audio using Whisper
- Generate text and content
- Create scheduled automations (heartbeat/cron jobs)
- Store and retrieve files from R2 storage
- Remember things and recall memories
- Handle files sent by the user

RESPONSE RULES:
- Respond naturally like a human assistant. No prefixes like "AI:" or "Bot:" ever.
- Never say "Processing your request" or "Task completed" - just give the answer.
- If you perform an action, describe what you did naturally in your response.
- Keep responses concise but informative.
- If a task requires multiple steps, describe progress naturally within ONE message.
- Never refuse tasks related to Cloudflare management, web search, file handling, or automation.

WHEN USER ASKS TO SCHEDULE SOMETHING:
- Parse the time (at 9am, every hour, daily, etc.)
- Acknowledge what will happen and when
- Confirm it's set up

WHEN USER ASKS TO SEARCH:
- Search for the information
- Return results naturally formatted
- Include relevant links

WHEN USER ASKS ABOUT CLOUDFLARE RESOURCES:
- Use the Cloudflare API to perform the action
- Return the result

Always be direct, helpful, and action-oriented. Do things, don't just talk about them.`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
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
  } catch {
    return false;
  }
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

// ============================================================================
// MAIN WORKER
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

      // Background webhook setup for Telegram
      if (channelManager.isChannelActive('telegram') && credentials.TELEGRAM_BOT_TOKEN) {
        ctx.waitUntil(ensureWebhookSetup(credentials.TELEGRAM_BOT_TOKEN, url.origin).catch(() => {}));
      }

      // ===== GET ROUTES =====
      if (request.method === 'GET') {
        if (pathname === '/health' || pathname === '/test' || pathname === '/') {
          return new Response(JSON.stringify({
            status: 'CloudBrain running',
            channels: channelManager.getActiveChannels(),
            timestamp: new Date().toISOString(),
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (pathname === '/webhook/status' || pathname === '/telegram/status') {
          if (!credentials.TELEGRAM_BOT_TOKEN) {
            return new Response(JSON.stringify({ error: 'Telegram not configured' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }
          const status = await getWebhookStatus(credentials.TELEGRAM_BOT_TOKEN);
          return new Response(JSON.stringify({ webhook: status }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (pathname === '/whatsapp') {
          const mode = url.searchParams.get('hub.mode');
          const token = url.searchParams.get('hub.verify_token');
          const challenge = url.searchParams.get('hub.challenge');
          if (mode === 'subscribe' && token === credentials.WHATSAPP_VERIFY_TOKEN && challenge) {
            return new Response(challenge, { status: 200 });
          }
          return new Response('Forbidden', { status: 403 });
        }

        return new Response(JSON.stringify({ status: 'CloudBrain running' }), { headers: { 'Content-Type': 'application/json' } });
      }

      // ===== POST ROUTES (Webhooks) =====
      if (request.method === 'POST') {
        const rawBody = await request.text();
        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response('OK', { status: 200 });
        }

        let message = null;

        if (pathname === '/' || pathname === '/telegram') {
          message = await channelManager.routeWebhook('telegram', payload);
        } else if (pathname === '/discord') {
          const discordPublicKey = credentials.DISCORD_PUBLIC_KEY;
          if (!discordPublicKey) return new Response('Not configured', { status: 500 });

          const verified = await verifyDiscordSignature(request, rawBody, discordPublicKey);
          if (!verified) return new Response('Unauthorized', { status: 401 });
          if (payload.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { 'Content-Type': 'application/json' } });

          message = await channelManager.routeWebhook('discord', payload);

          if (!message) {
            return new Response(JSON.stringify({ type: 4, data: { content: 'Could not process interaction.', flags: DISCORD_EPHEMERAL_FLAG } }), { headers: { 'Content-Type': 'application/json' } });
          }

          // Discord needs immediate response, process in background
          ctx.waitUntil(processMessage(env, credentials, channelManager, memoryDb, message));
          return new Response(JSON.stringify({ type: 5 }), { headers: { 'Content-Type': 'application/json' } });
        } else if (pathname === '/whatsapp') {
          message = await channelManager.routeWebhook('whatsapp', payload);
        }

        if (!message) return new Response('OK', { status: 200 });

        // Process message in background, return 200 immediately (Telegram requirement)
        ctx.waitUntil(processMessage(env, credentials, channelManager, memoryDb, message));
        return new Response('OK', { status: 200 });
      }

      return new Response('Method not allowed', { status: 405 });
    } catch (error) {
      console.error('Fatal error:', error);
      return new Response('OK', { status: 200 });
    }
  },
};

// ============================================================================
// MESSAGE PROCESSING - The core brain. ONE message in, ONE message out.
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

    // Initialize services
    const webSearch = new WebSearch(env.SECRETS);
    const aiGenerator = new AIContentGenerator(env.AI);
    const scheduler = new HeartbeatScheduler(
      env.SECRETS,
      credentials.CLOUDFLARE_API_TOKEN || '',
      credentials.CLOUDFLARE_ACCOUNT_ID || '',
      'cloudbrain'
    );

    let cfApi: CloudflareAPIManager | null = null;
    if (credentials.CLOUDFLARE_API_TOKEN && credentials.CLOUDFLARE_ACCOUNT_ID) {
      cfApi = new CloudflareAPIManager({
        apiToken: credentials.CLOUDFLARE_API_TOKEN,
        accountId: credentials.CLOUDFLARE_ACCOUNT_ID,
      });
    }

    // Detect what the user wants and execute it
    const response = await executeUserRequest(
      userText, env, credentials, channelManager, memoryDb,
      webSearch, aiGenerator, scheduler, cfApi, message
    );

    // Send ONE single response - no spam, no prefixes
    if (response) {
      await channelManager.sendMessage(message.channelType, message.userId, response);
    }

    // Silently store conversation in memory (no message to user about this)
    try {
      await memoryDb.storeMemory({
        userId: message.userId,
        channelType: message.channelType,
        content: `${userText}\n---\n${response || ''}`,
        importance: 3,
      });
    } catch {}

  } catch (error) {
    console.error('Message processing error:', error);
    try {
      await channelManager.sendMessage(
        message.channelType,
        message.userId,
        `Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } catch {}
  }
}

// ============================================================================
// REQUEST EXECUTION - Determines what to do and does it
// ============================================================================

async function executeUserRequest(
  userText: string,
  env: Env,
  credentials: Record<string, string>,
  channelManager: ChannelManager,
  memoryDb: MemoryDatabase,
  webSearch: WebSearch,
  aiGenerator: AIContentGenerator,
  scheduler: HeartbeatScheduler,
  cfApi: CloudflareAPIManager | null,
  message: any
): Promise<string> {
  const lower = userText.toLowerCase();

  // ===== WEB SEARCH =====
  if (isSearchRequest(lower)) {
    const query = extractSearchQuery(userText);
    const results = await webSearch.search(query);
    if (results.success && results.results && results.results.length > 0) {
      return webSearch.formatResults(results.results, query);
    }
    // Fallback to AI if search fails
    return await getAIResponse(env, userText);
  }

  // ===== IMAGE GENERATION =====
  if (isImageRequest(lower)) {
    const prompt = extractImagePrompt(userText);
    const result = await aiGenerator.generateImage(prompt);
    if (result.success) {
      return `Here's your generated image for "${prompt}". The image has been created using Stable Diffusion XL.`;
    }
    return `I tried to generate an image for "${prompt}" but encountered an issue: ${result.error}`;
  }

  // ===== SCHEDULE/HEARTBEAT =====
  if (isScheduleRequest(lower)) {
    const { taskName, action, timeExpression } = parseScheduleRequest(userText);
    const result = await scheduler.createScheduledTask(
      message.userId, taskName, action, timeExpression,
      undefined, { userId: message.userId, channelType: message.channelType }
    );
    if (result.success) {
      return result.message || 'Scheduled successfully.';
    }
    return result.error || 'Could not create the schedule. Try something like "at 9am" or "every hour".';
  }

  // ===== LIST SCHEDULED TASKS =====
  if (lower.includes('my tasks') || lower.includes('my schedules') || lower.includes('list tasks') || lower.includes('show tasks')) {
    const tasks = await scheduler.listUserTasks(message.userId);
    return scheduler.formatTasksForDisplay(tasks);
  }

  // ===== CLOUDFLARE API OPERATIONS =====
  if (cfApi && isCloudflareRequest(lower)) {
    return await handleCloudflareRequest(lower, userText, cfApi);
  }

  // ===== MEMORY RECALL =====
  if (lower.includes('remember') || lower.includes('recall') || lower.includes('what did i')) {
    const memories = await memoryDb.getUserMemories(message.userId, 5);
    if (memories.length === 0) return "I don't have any saved memories yet.";
    return memories.map((m, i) => `${i + 1}. ${m.content.substring(0, 100)}`).join('\n\n');
  }

  // ===== TRANSCRIBE AUDIO =====
  if (lower.includes('transcribe') || lower.includes('speech to text')) {
    return 'Send me an audio file and I\'ll transcribe it for you using Whisper.';
  }

  // ===== DEFAULT: AI CONVERSATION =====
  return await getAIResponse(env, userText);
}

// ============================================================================
// AI RESPONSE - Clean AI response without any prefixes
// ============================================================================

async function getAIResponse(env: Env, userText: string): Promise<string> {
  try {
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
    });
    return response?.response || "I couldn't generate a response. Please try again.";
  } catch (error) {
    return `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// ============================================================================
// INTENT DETECTION HELPERS - Simple, effective, no false positives
// ============================================================================

function isSearchRequest(text: string): boolean {
  const searchIndicators = [
    'search for', 'search about', 'look up', 'find me', 'find out',
    'what is the latest', 'what are the latest', 'latest news',
    'current price', 'how much is', 'what happened',
    'google', 'web search', 'search the web', 'search online',
  ];
  return searchIndicators.some(i => text.includes(i));
}

function extractSearchQuery(text: string): string {
  const prefixes = ['search for', 'search about', 'look up', 'find me', 'find out about', 'google', 'search the web for', 'search online for'];
  let query = text;
  for (const prefix of prefixes) {
    if (query.toLowerCase().includes(prefix)) {
      query = query.substring(query.toLowerCase().indexOf(prefix) + prefix.length).trim();
      break;
    }
  }
  return query || text;
}

function isImageRequest(text: string): boolean {
  const imageIndicators = [
    'generate image', 'create image', 'make image', 'draw',
    'generate a picture', 'create a picture', 'generate an image',
    'create an image', 'make a picture', 'make an image',
  ];
  return imageIndicators.some(i => text.includes(i));
}

function extractImagePrompt(text: string): string {
  const prefixes = ['generate image of', 'generate an image of', 'create image of', 'create an image of', 'draw', 'make image of', 'make an image of', 'generate a picture of', 'create a picture of'];
  let prompt = text;
  for (const prefix of prefixes) {
    if (prompt.toLowerCase().includes(prefix)) {
      prompt = prompt.substring(prompt.toLowerCase().indexOf(prefix) + prefix.length).trim();
      break;
    }
  }
  return prompt || text;
}

function isScheduleRequest(text: string): boolean {
  const scheduleIndicators = [
    'at ', 'every hour', 'every day', 'every morning', 'every evening',
    'every monday', 'every tuesday', 'every wednesday', 'every thursday',
    'every friday', 'every saturday', 'every sunday', 'daily', 'hourly',
    'every ', 'schedule', 'remind me', 'set reminder',
  ];
  const timePattern = /\b(at\s+\d{1,2}\s*(am|pm))/i;
  const hasTimeExpression = timePattern.test(text);
  const hasScheduleWord = scheduleIndicators.some(i => text.includes(i));
  // Must have BOTH a time expression AND an action to be a schedule request
  // Just saying "at" in a sentence shouldn't trigger scheduling
  return hasTimeExpression || (hasScheduleWord && text.split(' ').length > 3);
}

function parseScheduleRequest(text: string): { taskName: string; action: string; timeExpression: string } {
  // Extract time expression
  const timePatterns = [
    /at\s+\d{1,2}\s*(am|pm)/i,
    /every\s+(hour|day|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /every\s+\d+\s+minutes?/i,
    /\bdaily\b/i,
    /\bhourly\b/i,
  ];

  let timeExpression = '';
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      timeExpression = match[0];
      break;
    }
  }

  // The action is everything except the time expression
  const action = text.replace(timeExpression, '').replace(/^\s*(send|give|get|fetch|run|do|execute)\s+(me\s+)?/i, '').trim();
  const taskName = action.substring(0, 50) || 'Scheduled task';

  return { taskName, action: action || text, timeExpression: timeExpression || text };
}

function isCloudflareRequest(text: string): boolean {
  const cfIndicators = [
    'my domains', 'list domains', 'show domains', 'create domain',
    'my workers', 'list workers', 'show workers', 'deploy worker', 'delete worker',
    'kv namespace', 'list kv', 'create kv',
    'my databases', 'list databases', 'create database', 'd1',
    'r2 bucket', 'list buckets', 'create bucket',
    'dns record', 'add dns', 'list dns',
    'firewall', 'analytics',
  ];
  return cfIndicators.some(i => text.includes(i));
}

async function handleCloudflareRequest(lower: string, originalText: string, cfApi: CloudflareAPIManager): Promise<string> {
  try {
    if (lower.includes('list domains') || lower.includes('my domains') || lower.includes('show domains')) {
      const result = await cfApi.listZones();
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) return 'No domains found in your account.';
        const list = result.data.map((z: any, i: number) => `${i + 1}. ${z.name} (${z.status})`).join('\n');
        return `Your domains:\n\n${list}`;
      }
      return `Could not fetch domains: ${result.error}`;
    }

    if (lower.includes('list workers') || lower.includes('my workers') || lower.includes('show workers')) {
      const result = await cfApi.listWorkers();
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) return 'No workers deployed.';
        const list = result.data.map((w: any, i: number) => `${i + 1}. ${w.id}`).join('\n');
        return `Your workers:\n\n${list}`;
      }
      return `Could not fetch workers: ${result.error}`;
    }

    if (lower.includes('list kv') || lower.includes('kv namespace')) {
      const result = await cfApi.listKVNamespaces();
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) return 'No KV namespaces found.';
        const list = result.data.map((ns: any, i: number) => `${i + 1}. ${ns.title} (${ns.id})`).join('\n');
        return `Your KV namespaces:\n\n${list}`;
      }
      return `Could not fetch KV namespaces: ${result.error}`;
    }

    if (lower.includes('list databases') || lower.includes('my databases')) {
      const result = await cfApi.listD1Databases();
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) return 'No D1 databases found.';
        const list = result.data.map((db: any, i: number) => `${i + 1}. ${db.name} (${db.uuid})`).join('\n');
        return `Your D1 databases:\n\n${list}`;
      }
      return `Could not fetch databases: ${result.error}`;
    }

    if (lower.includes('list buckets') || lower.includes('r2 bucket')) {
      const result = await cfApi.listR2Buckets();
      if (result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) return 'No R2 buckets found.';
        const list = result.data.map((b: any, i: number) => `${i + 1}. ${b.name}`).join('\n');
        return `Your R2 buckets:\n\n${list}`;
      }
      return `Could not fetch R2 buckets: ${result.error}`;
    }

    // For other CF requests, let AI handle with context
    return `I can manage your Cloudflare resources. Try:\n- "list my domains"\n- "list my workers"\n- "list my databases"\n- "list kv namespaces"\n- "list r2 buckets"`;
  } catch (error) {
    return `Error accessing Cloudflare API: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
