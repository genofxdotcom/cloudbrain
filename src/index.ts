/**
 * CloudBrain V3 — Worker entrypoint.
 *
 * Serves:
 *   /api/*       → router (chat, integrations, tasks, schedules, memory…)
 *   /            → SPA assets (from web/dist via the ASSETS binding)
 *   /ws upgrade  → per-user RealtimeHub Durable Object
 *   scheduled()  → dynamic schedule fan-out (single * * * * * cron trigger)
 *
 * Authentication is handled by whatever sits in front of the deployment
 * (e.g. Cloudflare Access). This Worker trusts the identity header and
 * scopes all data per resolved user.
 */

import type { Env } from './env.js';
import { router } from './router.js';
import { RealtimeHub } from './realtime.js';
import { resolveOrSharedUser } from './auth.js';
import { runDueSchedules } from './scheduler.js';

export { RealtimeHub };
export { AgentOrchestrator } from './agent.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── WebSocket upgrade → user-scoped RealtimeHub ────────────────────────
    if (url.pathname === '/ws' || url.pathname === '/api/realtime') {
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const user = await resolveOrSharedUser(env.DB, request);
      const stub = env.REALTIME.get(env.REALTIME.idFromName(user.id));
      const connectUrl = new URL('https://realtime.internal/connect');
      return stub.fetch(new Request(connectUrl, { headers: request.headers }));
    }

    // ── API routes ─────────────────────────────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      const user = await resolveOrSharedUser(env.DB, request);
      const apiResponse = await router.handle(request, env, user, ctx);
      return withSecurityHeaders(apiResponse ?? new Response('Not found.', { status: 404 }));
    }

    // ── SPA (assets binding handles files + html fallback) ────────────────
    return env.ASSETS.fetch(request);
  },

  /**
   * Dynamic schedules via a single static cron trigger: every minute we load
   * enabled schedules from D1, fire the ones whose cron matches, and record
   * run history.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDueSchedules(env));
  },
} satisfies ExportedHandler<Env>;

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('referrer-policy', 'same-origin');
  return out;
}
