/**
 * API router — zero-dependency URL routing on top of the Worker fetch handler.
 * All routes require a Cloudflare Access identity (verified in index.ts);
 * every handler receives the resolved user in ctx.
 */

import type { Env } from './env.js';
import { IntegrationProvider } from '@cloudbrain/integrations';
import {
  availableModels,
  ModelGateway,
  DEFAULT_MODEL,
} from './models.js';
import { AgentOrchestrator, type RunParams } from './agent.js';
import { jsonError, randomId, type UserRow } from './auth.js';
import { RealtimeHub } from './realtime.js';
import {
  chatSendSchema,
  connectApiKeySchema,
  memoryAddSchema,
  redactToJson,
  scheduleCreateSchema,
} from '@cloudbrain/shared';

export { RealtimeHub };

interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  user: UserRow;
  waitUntil: (promise: Promise<unknown>) => void;
}

type Handler = (ctx: Ctx, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  segments: string[]; // :name = dynamic
  handler: Handler;
}

class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({
      method,
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
  }

  async handle(
    req: Request,
    env: Env,
    user: UserRow,
    execCtx?: { waitUntil: (p: Promise<unknown>) => void }
  ): Promise<Response | null> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return null;
    const pathSegs = url.pathname.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      if (route.segments.length !== pathSegs.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i]!;
        const actual = pathSegs[i]!;
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(actual);
        else if (seg !== actual) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      return route.handler(
        { req, env, url, user, waitUntil: execCtx?.waitUntil ?? (() => undefined) },
        params
      );
    }
    return jsonError(404, 'Not found.');
  }
}

export const router = new Router();
export type { Ctx };

// ── helpers ────────────────────────────────────────────────────────────────
async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    const message = err instanceof Error ? err.message : 'Internal error';
    return jsonError(500, message);
  }
}

function publishEvent(env: Env, userId: string, event: Record<string, unknown>): Promise<void> {
  const stub = env.REALTIME.get(env.REALTIME.idFromName(userId));
  return stub
    .fetch('https://realtime/publish', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'content-type': 'application/json' },
    })
    .then(() => undefined)
    .catch(() => undefined);
}

function integrationProvider(env: Env): IntegrationProvider {
  return new IntegrationProvider({ COMPOSIO_API_KEY: env.COMPOSIO_API_KEY });
}

function orchestrator(env: Env): AgentOrchestrator {
  return new AgentOrchestrator(env, new ModelGateway(env), integrationProvider(env));
}

// ═════════════════════════════ IDENTITY ═══════════════════════════════════
router.add('GET', '/api/auth/me', async (ctx) =>
  guard(async () => {
    return Response.json({
      user: { id: ctx.user.id, email: ctx.user.email, displayName: ctx.user.display_name, isAdmin: !!ctx.user.is_admin },
      provider: 'cloudflare-access',
    });
  })
);

// ═════════════════════════════ CHAT ═══════════════════════════════════════
router.add('GET', '/api/conversations', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      'SELECT id, title, project_id, pinned, updated_at FROM conversations WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC LIMIT 100'
    )
      .bind(ctx.user.id)
      .all<{ id: string; title: string; project_id: string | null; pinned: number; updated_at: string }>();
    return Response.json({
      conversations: rows.results.map((r) => ({
        id: r.id,
        title: r.title,
        projectId: r.project_id,
        pinned: !!r.pinned,
        updatedAt: r.updated_at,
      })),
    });
  })
);

router.add('POST', '/api/conversations', async (ctx) =>
  guard(async () => {
    const id = randomId('cnv');
    await ctx.env.DB.prepare('INSERT INTO conversations (id, user_id) VALUES (?, ?)').bind(id, ctx.user.id).run();
    return Response.json({ id }, { status: 201 });
  })
);

router.add('GET', '/api/conversations/:id/messages', async (ctx, p) =>
  guard(async () => {
    const conv = await ctx.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .bind(p['id'], ctx.user.id)
      .first();
    if (!conv) return jsonError(404, 'Conversation not found.');
    const rows = await ctx.env.DB.prepare(
      'SELECT id, conversation_id, role, content, model, activity, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at LIMIT 500'
    )
      .bind(p['id'])
      .all<{ id: string; conversation_id: string; role: string; content: string; model: string | null; activity: string | null; created_at: string }>();
    return Response.json({
      messages: rows.results.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        role: r.role,
        content: r.content,
        model: r.model ?? undefined,
        activity: r.activity ? JSON.parse(r.activity) : null,
        createdAt: r.created_at,
      })),
    });
  })
);

router.add('POST', '/api/chat', async (ctx) =>
  guard(async () => {
    const body = chatSendSchema.parse(await readJson(ctx.req));
    const userId = ctx.user.id;

    // Resolve or create conversation.
    let conversationId = body.conversationId;
    if (conversationId) {
      const owned = await ctx.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
        .bind(conversationId, userId)
        .first();
      if (!owned) return jsonError(404, 'Conversation not found.');
    } else {
      conversationId = randomId('cnv');
      const title = body.message.slice(0, 60) + (body.message.length > 60 ? '…' : '');
      await ctx.env.DB.prepare('INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)')
        .bind(conversationId, userId, title)
        .run();
    }

    // Persist user message.
    await ctx.env.DB.prepare(
      'INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)'
    )
      .bind(randomId('msg'), conversationId, 'user', body.message)
      .run();
    await ctx.env.DB.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?")
      .bind(conversationId)
      .run();

    // Gather context inputs.
    const history = await ctx.env.DB.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 18'
    )
      .bind(conversationId)
      .all<{ role: string; content: string }>();
    const memories = await ctx.env.DB.prepare(
      'SELECT content, confidence FROM memories WHERE user_id = ? ORDER BY confidence DESC, created_at DESC LIMIT 5'
    )
      .bind(userId)
      .all<{ content: string; confidence: number }>();

    let projectInstructions: string | null = null;
    if (body.projectId) {
      const proj = await ctx.env.DB.prepare('SELECT instructions FROM projects WHERE id = ? AND user_id = ?')
        .bind(body.projectId, userId)
        .first<{ instructions: string | null }>();
      projectInstructions = proj?.instructions ?? null;
    }

    // Connected toolkits summary (Layer H) — only when Composio is configured.
    const integration = integrationProvider(ctx.env);
    let connectedToolkits: RunParams['connectedToolkits'] = [];
    if (integration.isConfigured) {
      try {
        const accounts = await integration.listConnectedAccounts(userId);
        connectedToolkits = accounts
          .filter((a) => a.status === 'CONNECTED')
          .slice(0, 8)
          .map((a) => ({ slug: a.toolkitSlug, name: a.toolkitSlug, status: a.status, sampleActions: [] }));
      } catch {
        // non-fatal
      }
    }

    const run = orchestrator(ctx.env);

    const execPromise = run
      .run({
        userId,
        conversationId,
        mode: body.mode,
        model: body.model ?? DEFAULT_MODEL,
        userMessage: body.message,
        projectId: body.projectId ?? null,
        history: history.results.reverse().map((h) => ({ role: h.role as 'user' | 'assistant' | 'tool' | 'system', content: h.content })),
        memories: memories.results,
        projectInstructions,
        connectedToolkits,
        publish: (event) => publishEvent(ctx.env, userId, event),
      })
      .then(async (result) => {
        // Persist the assistant message.
        await ctx.env.DB.prepare(
          'INSERT INTO messages (id, conversation_id, role, content, model, activity) VALUES (?, ?, ?, ?, ?, ?)'
        )
          .bind(
            result.messageId,
            conversationId,
            'assistant',
            result.text,
            body.model ?? DEFAULT_MODEL,
            JSON.stringify(result.activity)
          )
          .run();
        await ctx.env.DB.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?")
          .bind(conversationId)
          .run();
      })
      .catch(async (err: unknown) => {
        await publishEvent(ctx.env, userId, {
          type: 'error',
          conversationId,
          message: err instanceof Error ? err.message : 'Agent execution failed.',
        });
      });

    // Keep the Worker alive until the agent finishes (waitUntil contract).
    ctx.waitUntil(execPromise);

    return Response.json({ conversationId, accepted: true });
  })
);

// ═════════════════════════════ MODELS ═════════════════════════════════════
router.add('GET', '/api/models', async (ctx) =>
  guard(async () => Response.json({ models: availableModels(ctx.env), default: DEFAULT_MODEL }))
);

// ═════════════════════════════ INTEGRATIONS ═══════════════════════════════
router.add('GET', '/api/integrations/status', async (ctx) =>
  guard(async () => {
    const integration = integrationProvider(ctx.env);
    return Response.json({
      configured: integration.isConfigured,
      ...(integration.isConfigured ? await integration.healthCheck() : {}),
    });
  })
);

router.add('GET', '/api/integrations/applications', async (ctx) =>
  guard(async () => {
    const integration = integrationProvider(ctx.env);
    if (!integration.isConfigured) return jsonError(409, 'Composio is not configured on this deployment.');
    const category = ctx.url.searchParams.get('category') ?? undefined;
    const q = ctx.url.searchParams.get('q');
    const apps = q ? await integration.searchApplications(q) : await integration.listApplications(category);

    // Merge connection state for this user.
    const accounts = await integration.listConnectedAccounts(ctx.user.id).catch(() => []);
    for (const app of apps) {
      const mine = accounts.filter((a) => a.toolkitSlug === app.slug);
      app.connectedAccountCount = mine.length;
      app.connectionStatus =
        mine.find((a) => a.status === 'CONNECTED')?.status ??
        mine[0]?.status ??
        'NOT_CONNECTED';
    }
    return Response.json({ applications: apps });
  })
);

router.add('GET', '/api/integrations/applications/:slug', async (ctx, p) =>
  guard(async () => {
    const integration = integrationProvider(ctx.env);
    if (!integration.isConfigured) return jsonError(409, 'Composio is not configured on this deployment.');
    const app = await integration.getApplication(p['slug']!);
    const accounts = await integration
      .listConnectedAccountsForToolkit(ctx.user.id, p['slug']!)
      .catch(() => []);
    app.connectedAccountCount = accounts.length;
    app.connectionStatus = accounts.find((a) => a.status === 'CONNECTED')?.status ?? accounts[0]?.status ?? 'NOT_CONNECTED';
    let flow = null;
    try {
      flow = await integration.getConnectionFlow(p['slug']!);
    } catch (err) {
      flow = null;
      void err;
    }
    const actions = await integration.listActions(p['slug']!, 40).catch(() => []);
    return Response.json({ application: app, flow, accounts, actions });
  })
);

router.add('POST', '/api/integrations/applications/:slug/connect', async (ctx, p) =>
  guard(async () => {
    const integration = integrationProvider(ctx.env);
    if (!integration.isConfigured) return jsonError(409, 'Composio is not configured on this deployment.');
    const slug = p['slug']!;

    // Determine the auth flow for this toolkit.
    const flow = await integration.getConnectionFlow(slug);

    if (!flow.requiresUserInput) {
      // OAuth / no-input flows: initiate and return redirect URL.
      const origin = ctx.url.origin;
      const res = await startOauthConnect(ctx.env, ctx.user.id, slug, `${origin}/integrations/callback`);
      return Response.json(res);
    }

    // Credential flows: validate body.
    const body = connectApiKeySchema.parse(await readJson(ctx.req));
    if (!body.authConfigId) return jsonError(400, 'authConfigId is required for credential connections.');
    const res = await integration.startConnection({
      cloudbrainUserId: ctx.user.id,
      toolkitSlug: slug,
      authConfigId: body.authConfigId,
      fields: body.fields,
    });
    return Response.json(res);
  })
);

async function startOauthConnect(
  env: Env,
  userId: string,
  toolkitSlug: string,
  callbackUrl: string
): Promise<{ redirectUrl?: string; connectedAccount?: unknown; status: string }> {
  const integration = new IntegrationProvider({ COMPOSIO_API_KEY: env.COMPOSIO_API_KEY });
  // Find (or rely on Composio to auto-create) the auth config via dashboard; use first usable.
  const flow = await integration.getConnectionFlow(toolkitSlug);
  void flow;
  // We need an authConfigId — fetch configs directly through the provider API.
  const client = integration as unknown as {
    requireClient: () => { listAuthConfigs: (slug: string) => Promise<{ items: { id: string }[] }> };
  };
  const configs = await client.requireClient().listAuthConfigs(toolkitSlug);
  const authConfigId = configs.items[0]?.id;
  if (!authConfigId) {
    return { status: 'ERROR' };
  }
  const res = await integration.startConnection({
    cloudbrainUserId: userId,
    toolkitSlug,
    authConfigId,
    callbackUrl,
  });
  return res as { redirectUrl?: string; connectedAccount?: unknown; status: string };
}

router.add('GET', '/api/integrations/accounts', async (ctx) =>
  guard(async () => {
    const integration = integrationProvider(ctx.env);
    if (!integration.isConfigured) return jsonError(409, 'Composio is not configured on this deployment.');
    const accounts = await integration.listConnectedAccounts(ctx.user.id);
    return Response.json({ accounts });
  })
);

router.add('DELETE', '/api/integrations/accounts/:id', async (ctx, p) =>
  guard(async () => {
    const integration = integrationProvider(ctx.env);
    await integration.disconnect(ctx.user.id, p['id']!);
    return new Response(null, { status: 204 });
  })
);

router.add('GET', '/api/integrations/activity', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      `SELECT id, toolkit_slug, tool_slug, status, input_summary, output_summary, error, duration_ms, created_at
       FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`
    )
      .bind(ctx.user.id)
      .all();
    return Response.json({ activity: rows.results });
  })
);

// ═════════════════════════════ APPROVALS ══════════════════════════════════
router.add('GET', '/api/approvals/pending', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      `SELECT id, task_id, tool_id, summary, resource, consequence, account_label, created_at
       FROM approvals WHERE user_id = ? AND decision = 'pending' ORDER BY created_at DESC`
    )
      .bind(ctx.user.id)
      .all();
    return Response.json({ approvals: rows.results });
  })
);

router.add('POST', '/api/approvals/:id/decide', async (ctx, p) =>
  guard(async () => {
    const body = await readJson<{ decision?: string }>(ctx.req);
    const decision = body.decision;
    if (decision !== 'approve_once' && decision !== 'always' && decision !== 'deny') {
      return jsonError(400, 'decision must be approve_once | always | deny');
    }
    const mapped =
      decision === 'approve_once' ? 'approved_once' : decision === 'always' ? 'always_allowed' : 'denied';
    const res = await ctx.env.DB.prepare(
      `UPDATE approvals SET decision = ?, decided_at = datetime('now')
       WHERE id = ? AND user_id = ? AND decision = 'pending'`
    )
      .bind(mapped, p['id'], ctx.user.id)
      .run();
    if (!res.meta.changes) return jsonError(404, 'Approval not found or already decided.');
    return Response.json({ ok: true, decision: mapped });
  })
);

// ═════════════════════════════ TASKS ══════════════════════════════════════
router.add('GET', '/api/tasks', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      `SELECT id, title, status, mode, assigned_agent, conversation_id, created_at, updated_at
       FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
    )
      .bind(ctx.user.id)
      .all();
    return Response.json({ tasks: rows.results });
  })
);

// ═════════════════════════════ SCHEDULES ══════════════════════════════════
router.add('GET', '/api/schedules', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      `SELECT id, name, cron, timezone, prompt, mode, enabled, last_run_at, next_run_at, created_at
       FROM schedules WHERE user_id = ? ORDER BY created_at DESC`
    )
      .bind(ctx.user.id)
      .all();
    return Response.json({
      schedules: (rows.results as Record<string, unknown>[]).map((r) => ({
        ...r,
        enabled: !!r['enabled'],
      })),
    });
  })
);

router.add('POST', '/api/schedules', async (ctx) =>
  guard(async () => {
    const body = scheduleCreateSchema.parse(await readJson(ctx.req));
    if (!isValidCron(body.cron)) return jsonError(400, 'Invalid cron expression (5 fields expected).');
    const id = randomId('sch');
    await ctx.env.DB.prepare(
      `INSERT INTO schedules (id, user_id, name, cron, timezone, prompt, mode, enabled, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        ctx.user.id,
        body.name,
        body.cron,
        body.timezone,
        body.prompt,
        body.mode,
        body.enabled ? 1 : 0,
        nextCronRun(body.cron)
      )
      .run();
    return Response.json({ id }, { status: 201 });
  })
);

router.add('PATCH', '/api/schedules/:id', async (ctx, p) =>
  guard(async () => {
    const body = await readJson<{ enabled?: boolean }>(ctx.req);
    if (typeof body.enabled !== 'boolean') return jsonError(400, 'enabled (boolean) required.');
    await ctx.env.DB.prepare('UPDATE schedules SET enabled = ? WHERE id = ? AND user_id = ?')
      .bind(body.enabled ? 1 : 0, p['id'], ctx.user.id)
      .run();
    return Response.json({ ok: true });
  })
);

router.add('DELETE', '/api/schedules/:id', async (ctx, p) =>
  guard(async () => {
    await ctx.env.DB.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?')
      .bind(p['id'], ctx.user.id)
      .run();
    return new Response(null, { status: 204 });
  })
);

// ═════════════════════════════ MEMORY ═════════════════════════════════════
router.add('GET', '/api/memory', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      `SELECT id, kind, content, source, confidence, last_used_at, created_at
       FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`
    )
      .bind(ctx.user.id)
      .all();
    return Response.json({ memories: rows.results });
  })
);

router.add('POST', '/api/memory', async (ctx) =>
  guard(async () => {
    const body = memoryAddSchema.parse(await readJson(ctx.req));
    const id = randomId('mem');
    await ctx.env.DB.prepare(
      'INSERT INTO memories (id, user_id, project_id, kind, content, source) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, ctx.user.id, body.projectId ?? null, body.kind, body.content, 'user')
      .run();
    return Response.json({ id }, { status: 201 });
  })
);

router.add('DELETE', '/api/memory/:id', async (ctx, p) =>
  guard(async () => {
    await ctx.env.DB.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?')
      .bind(p['id'], ctx.user.id)
      .run();
    return new Response(null, { status: 204 });
  })
);

// ═════════════════════════════ REALTIME WS ════════════════════════════════
router.add('GET', '/api/realtime', async (ctx) =>
  guard(async () => {
    // Validate session, then hand the socket to the user's RealtimeHub DO.
    const stub = ctx.env.REALTIME.get(ctx.env.REALTIME.idFromName(ctx.user.id));
    const url = new URL(ctx.url);
    url.pathname = '/connect';
    return stub.fetch(new Request(url, { headers: ctx.req.headers }));
  })
);

// ═════════════════════════════ AUDIT (redacted) ═══════════════════════════
router.add('GET', '/api/audit', async (ctx) =>
  guard(async () => {
    const rows = await ctx.env.DB.prepare(
      'SELECT id, kind, summary, detail, task_id, created_at FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'
    )
      .bind(ctx.user.id)
      .all();
    return Response.json({ audit: rows.results });
  })
);

export function recordAudit(
  db: D1Database,
  userId: string | null,
  kind: string,
  summary: string,
  detail?: unknown
): Promise<void> {
  return db
    .prepare('INSERT INTO audit_log (id, user_id, kind, summary, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(randomId('aud'), userId, kind, summary, detail ? redactToJson(detail) : null)
    .run()
    .then(() => undefined)
    .catch(() => undefined);
}

// ── cron helpers ───────────────────────────────────────────────────────────
export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldRe = /^(\*|\d+|\*\/\d+|\d+-\d+)(,\d+)*$/;
  return parts.every((p) => fieldRe.test(p) || p === '*');
}

export function nextCronRun(expr: string): string | null {
  if (!isValidCron(expr)) return null;
  // Conservative estimate for display: +5 min. The scheduler computes precise
  // times at trigger time (see scheduler.ts).
  const d = new Date(Date.now() + 5 * 60_000);
  return d.toISOString();
}
