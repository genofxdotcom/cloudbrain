/**
 * Identity resolution — minimal by design.
 *
 * CloudBrain does NOT manage authentication. That's handled entirely by
 * whatever sits in front of the deployment (Cloudflare Access, Zero Trust,
 * a gateway, etc.). This module only maps the identity the proxy already
 * established onto a CloudBrain user row so data stays scoped per user.
 *
 * No cookies, no sessions, no tokens, no JWT verification — nothing to
 * manage, nothing to expire.
 */

import type { Env } from './env.js';

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: number;
}

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export { randomId };

/** The identity email as reported by the edge/proxy in front of the app. */
function identityEmail(req: Request): string | null {
  return (
    req.headers.get('cf-access-authenticated-user-email') ??
    req.headers.get('x-forwarded-email') ??
    req.headers.get('x-email')
  );
}

/**
 * Resolve (and auto-create) the CloudBrain user for this request.
 * Returns null only when no identity header is present — e.g. local dev
 * without a proxy — in which case the caller decides the fallback.
 */
export async function resolveUser(db: D1Database, req: Request): Promise<UserRow | null> {
  const email = identityEmail(req);
  if (!email) return null;

  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (existing) return existing;

  const isFirst = !(await db.prepare('SELECT id FROM users LIMIT 1').first());
  const id = randomId('usr');
  await db
    .prepare('INSERT INTO users (id, email, display_name, is_admin) VALUES (?, ?, ?, ?)')
    .bind(id, email, null, isFirst ? 1 : 0)
    .run();
  const created = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!created) throw new Error('Failed to provision the user row.');
  return created;
}

/**
 * Single-user fallback: when no identity header exists (local dev, or a
 * deployment without any proxy), all traffic maps to one shared user row.
 * Production deployments behind an identity proxy never hit this path.
 */
export async function resolveOrSharedUser(db: D1Database, req: Request): Promise<UserRow> {
  const user = await resolveUser(db, req);
  if (user) return user;
  return upsertSharedUser(db);
}

async function upsertSharedUser(db: D1Database): Promise<UserRow> {
  const email = 'local@cloudbrain';
  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (existing) return existing;
  const id = randomId('usr');
  await db
    .prepare('INSERT INTO users (id, email, display_name, is_admin) VALUES (?, ?, ?, ?)')
    .bind(id, email, 'Local user', 1)
    .run();
  const created = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!created) throw new Error('Failed to provision the shared local user row.');
  return created;
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}
