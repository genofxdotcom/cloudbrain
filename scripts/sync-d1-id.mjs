#!/usr/bin/env node
/**
 * Syncs D1_DATABASE_ID (env) into wrangler.jsonc.
 *
 * Why: CloudBrain is open-source, so the D1 database_id can't be committed.
 * The D1 *binding* is kept (no Account ID / API token needed); only the id is
 * injected at build time from an environment variable.
 *
 * Behavior:
 *   - Reads `database_id` currently in wrangler.jsonc.
 *   - If D1_DATABASE_ID is set  → write it in (idempotent).
 *   - If not set and id is already a real id → keep it (CI/CD with a committed
 *     private value or prior sync keeps working untouched).
 *   - If not set and id is the placeholder → leave the placeholder. `wrangler
 *     deploy` will fail fast with a clear message (see checkD1Id in scripts/check-d1-id.mjs).
 *
 * Never writes anything when nothing changes. Safe on every build.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = 'wrangler.jsonc';
const PLACEHOLDER = 'REPLACE_WITH_D1_DATABASE_ID';

const raw = readFileSync(CONFIG, 'utf8');
const match = raw.match(/"database_id"\s*:\s*"([^"]*)"/);
if (!match) {
  console.error('✗ wrangler.jsonc has no database_id field.');
  process.exit(1);
}

const envId = process.env.D1_DATABASE_ID?.trim();
const current = match[1];

if (!envId) {
  if (current === PLACEHOLDER) {
    console.log('• D1_DATABASE_ID not set and wrangler.jsonc still has the placeholder.');
    console.log('  Set it before deploying:  D1_DATABASE_ID=<id> npm run deploy');
    console.log('  (or run `npx wrangler d1 create cloudbrain` and copy the id)');
  } else {
    console.log(`✓ D1 database_id already set (${current.slice(0, 8)}…) — nothing to do.`);
  }
  process.exit(0);
}

if (envId === current) {
  console.log(`✓ D1 database_id already synced (${envId.slice(0, 8)}…).`);
  process.exit(0);
}

const next = raw.replace(/"database_id"\s*:\s*"[^"]*"/, `"database_id": "${envId}"`);
writeFileSync(CONFIG, next, 'utf8');
console.log(`✓ Synced D1 database_id into wrangler.jsonc (${envId.slice(0, 8)}…).`);
