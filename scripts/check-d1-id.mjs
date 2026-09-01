#!/usr/bin/env node
/**
 * Predeploy guard: fails with an actionable message when the D1 placeholder
 * is still in wrangler.jsonc, instead of letting `wrangler deploy` fail with
 * an opaque API error.
 */

import { readFileSync } from 'node:fs';

const raw = readFileSync('wrangler.jsonc', 'utf8');
const match = raw.match(/"database_id"\s*:\s*"([^"]*)"/);

if (!match || match[1] === 'REPLACE_WITH_D1_DATABASE_ID') {
  console.error(
    [
      '',
      '✗ D1 database_id is not configured.',
      '',
      '  CloudBrain is open-source, so the database id is injected from an env var.',
      '  1. Create the database (once):  npx wrangler d1 create cloudbrain',
      '  2. Sync it into the config:     D1_DATABASE_ID=<id> npm run deploy',
      '     (or export D1_DATABASE_ID in CI)',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.log(`✓ D1 database_id configured (${match[1].slice(0, 8)}…).`);
