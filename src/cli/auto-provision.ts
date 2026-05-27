import chalk from 'chalk';
import ora from 'ora';
import { query } from '../db/connection';
import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';
import { spawn } from 'child_process';

const o = chalk.hex('#FF8C00');

interface ProvisionResult {
  success: boolean;
  resourceId?: string;
  error?: string;
}

/**
 * Auto-provision CloudBrain infrastructure on Cloudflare
 * Called after user completes `cloudbrain setup`
 */
export async function autoProvision(): Promise<void> {
  console.log(o('\n  ┌─────────────────────────────────────────┐'));
  console.log(o('  │   AUTO-PROVISIONING INFRASTRUCTURE      │'));
  console.log(o('  │   Creating CloudBrain resources on CF   │'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  const accountId = await getCredential('CF_ACCOUNT_ID');
  const apiToken = await getCredential('CF_API_TOKEN');

  if (!accountId || !apiToken) {
    console.log(chalk.yellow('  Skipping: Cloudflare credentials not configured.\n'));
    return;
  }

  // Check if already provisioned
  const existing = await getSystemConfig('cf_d1_database_id');
  if (existing) {
    console.log(chalk.gray(`  Already provisioned (D1: ${existing.substring(0, 8)}...). Skipping.\n`));
    return;
  }

  // 1. Create D1 Database
  const d1Spinner = ora({ text: '  Creating D1 database: cloudbrain_data...', color: 'yellow' }).start();
  const d1Result = await runWrangler(['d1', 'create', 'cloudbrain_data'], apiToken, accountId);

  if (d1Result.success && d1Result.resourceId) {
    d1Spinner.succeed(chalk.green(`  D1 database created: ${d1Result.resourceId.substring(0, 8)}...`));
    await setSystemConfig('cf_d1_database_id', d1Result.resourceId, 'CloudBrain D1 database ID');
    await setSystemConfig('cf_d1_database_name', 'cloudbrain_data', 'CloudBrain D1 database name');
  } else if (d1Result.error?.includes('already exists')) {
    d1Spinner.info(chalk.gray('  D1 database already exists, reusing.'));
    // Try to find existing
    const listResult = await runWranglerRaw(['d1', 'list'], apiToken, accountId);
    const match = listResult.match(/cloudbrain_data\s+│\s+([a-f0-9-]+)/);
    if (match) {
      await setSystemConfig('cf_d1_database_id', match[1], 'CloudBrain D1 database ID');
      await setSystemConfig('cf_d1_database_name', 'cloudbrain_data', 'CloudBrain D1 database name');
    }
  } else {
    d1Spinner.fail(chalk.red(`  D1 creation failed: ${d1Result.error}`));
  }

  // 2. Verify Workers AI access (it's auto-available, just confirm account has it)
  const aiSpinner = ora({ text: '  Verifying Workers AI access...', color: 'yellow' }).start();
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );
    if (response.ok) {
      aiSpinner.succeed(chalk.green('  Workers AI: accessible'));
      await setSystemConfig('cf_ai_enabled', 'true', 'Workers AI available');
    } else {
      aiSpinner.warn(chalk.yellow('  Workers AI: may not be enabled on your plan'));
      await setSystemConfig('cf_ai_enabled', 'false', 'Workers AI not confirmed');
    }
  } catch {
    aiSpinner.warn(chalk.yellow('  Workers AI: could not verify (network issue)'));
  }

  console.log(o('\n  ✓ Infrastructure provisioning complete.\n'));
  console.log(chalk.gray('  Resources stored in local MySQL. Agent will use these automatically.'));
  console.log(chalk.gray('  Other resources (KV, R2, Workers) created on-demand when you ask.\n'));
}

/**
 * Run a wrangler command and extract resource ID from output
 */
async function runWrangler(args: string[], apiToken: string, accountId: string): Promise<ProvisionResult> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['wrangler', ...args], {
      env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        // Try to extract UUID from output
        const idMatch = stdout.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
        resolve({ success: true, resourceId: idMatch ? idMatch[1] : undefined });
      } else {
        resolve({ success: false, error: stderr.trim() || stdout.trim() });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function runWranglerRaw(args: string[], apiToken: string, accountId: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['wrangler', ...args], {
      env: { ...process.env, CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId },
      shell: true,
    });
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('close', () => resolve(stdout));
    proc.on('error', () => resolve(''));
  });
}

// System config helpers
async function setSystemConfig(key: string, value: string, description?: string): Promise<void> {
  await query(
    'INSERT INTO system_config (`key`, `value`, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?, description = ?',
    [key, value, description || '', value, description || '']
  );
}

async function getSystemConfig(key: string): Promise<string | null> {
  const rows = await query('SELECT `value` FROM system_config WHERE `key` = ?', [key]);
  return rows.length > 0 ? rows[0].value : null;
}
