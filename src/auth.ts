/**
 * Cloudflare Access authentication.
 *
 * CloudBrain does NOT implement its own login. Identity comes from
 * Cloudflare Access (Zero Trust): Access sits in front of the Worker,
 * authenticates the user, and injects the signed `Cf-Access-Jwt-Assertion`
 * header on every request. This module verifies that JWT against the team's
 * JWKS and maps it to a CloudBrain user row (auto-provisioned on first hit).
 *
 * Setup (see README):
 *   1. Zero Trust → Applications: self-hosted app covering your domain
 *   2. Zero Trust → Settings → Authentication: get your team domain
 *   3. Optional secrets: CF_ACCESS_JWKS_URL + CF_ACCESS_AUD
 *      (auto-discovered from the team domain when omitted)
 */

import type { Env } from './env.js';

const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
const CACHE_TTL_MS = 10 * 60_000;

interface AccessClaims {
  iss: string; // https://<team>.cloudflareaccess.com
  aud: string[] | string;
  email?: string;
  name?: string;
  exp: number;
}

interface JwkEntry {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

function teamDomainFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atobUrl(token.split('.')[1] ?? '')) as { iss?: string };
    if (!payload.iss) return null;
    return new URL(payload.iss).hostname.replace(/\.cloudflareaccess\.com$/, '');
  } catch {
    return null;
  }
}

function atobUrl(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

function b64UrlToBytes(s: string): Uint8Array {
  const bin = atobUrl(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function jwksUrlFor(env: Env, token: string): string | null {
  if (env.CF_ACCESS_JWKS_URL) return env.CF_ACCESS_JWKS_URL;
  const team = teamDomainFromToken(token);
  return team ? `https://${team}.cloudflareaccess.com/cdn-cgi/access/certs` : null;
}

async function loadJwks(url: string): Promise<Map<string, CryptoKey>> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < CACHE_TTL_MS && jwksCache.keys.size > 0) {
    return jwksCache.keys;
  }
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch Access JWKS (HTTP ${res.status})`);
  const data = (await res.json()) as { keys: JwkEntry[] };
  const keys = new Map<string, CryptoKey>();
  for (const k of data.keys ?? []) {
    if (k.kty !== 'RSA' || !k.n || !k.e) continue;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: k.n, e: k.e, alg: k.alg ?? 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(k.kid, key);
    } catch {
      // skip unusable keys
    }
  }
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyAccessJwt(token: string, env: Env): Promise<AccessClaims | null> {
  const pieces = token.split('.');
  if (pieces.length !== 3) return null;
  let header: { kid?: string; alg?: string };
  let claims: AccessClaims;
  try {
    header = JSON.parse(atobUrl(pieces[0]!)) as { kid?: string; alg?: string };
    claims = JSON.parse(atobUrl(pieces[1]!)) as AccessClaims;
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  const jwksUrl = jwksUrlFor(env, token);
  if (!jwksUrl) return null;

  let keys: Map<string, CryptoKey>;
  try {
    keys = await loadJwks(jwksUrl);
  } catch {
    return null;
  }
  const key = keys.get(header.kid);
  if (!key) return null;

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64UrlToBytes(pieces[2]!),
    new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`)
  );
  if (!ok) return null;

  // Expiry + issuer checks
  if (claims.exp * 1000 < Date.now()) return null;
  try {
    const issuerHost = new URL(claims.iss).hostname;
    if (!issuerHost.endsWith('.cloudflareaccess.com')) return null;
  } catch {
    return null;
  }

  // Audience check when configured
  if (env.CF_ACCESS_AUD) {
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes(env.CF_ACCESS_AUD)) return null;
  }

  return claims;
}

function accessIdentityHeaders(req: Request): { email: string | null; jwt: string | null } {
  const jwt =
    req.headers.get(ACCESS_JWT_HEADER) ??
    // SPA fetches may not forward the header; Access also sets this cookie.
    readCookie(req.headers.get('cookie'), 'CF_Authorization');
  const email = req.headers.get('cf-access-authenticated-user-email');
  return { email, jwt };
}

function readCookie(cookie: string | null, name: string): string | null {
  if (!cookie) return null;
  const m = cookie.match(new RegExp(`${name}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  expires_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_admin: number;
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

/**
 * Resolve the authenticated CloudBrain user from Cloudflare Access.
 * Verifies the Access JWT cryptographically when present and auto-provisions
 * the user row on first visit. Returns null when unauthenticated.
 */
export async function resolveAccessUser(db: D1Database, env: Env, req: Request): Promise<UserRow | null> {
  const { email, jwt } = accessIdentityHeaders(req);

  if (jwt) {
    const claims = await verifyAccessJwt(jwt, env);
    if (!claims) return null;
    const verifiedEmail = claims.email ?? email;
    if (!verifiedEmail) return null;
    return upsertAccessUser(db, verifiedEmail, claims.name ?? null);
  }

  // Strict mode: when Access secrets are configured, a verifiable JWT is required.
  if (env.CF_ACCESS_AUD || env.CF_ACCESS_JWKS_URL) return null;

  // Dev fallback: trust Access's signed-in email header only when no verification
  // secrets are configured (i.e. Access is expected to have validated upstream).
  if (email) return upsertAccessUser(db, email, null);
  return null;
}

export async function upsertAccessUser(db: D1Database, email: string, displayName: string | null): Promise<UserRow | null> {
  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (existing) return existing;

  const isFirst = !(await db.prepare('SELECT id FROM users LIMIT 1').first());
  const id = randomId('usr');
  await db
    .prepare('INSERT INTO users (id, email, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, 'access', displayName, isFirst ? 1 : 0)
    .run();
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function unauthorized(): Response {
  return new Response(
    'CloudBrain requires Cloudflare Access. Open this app through your Access-protected domain.',
    { status: 401, headers: { 'content-type': 'text/plain' } }
  );
}
