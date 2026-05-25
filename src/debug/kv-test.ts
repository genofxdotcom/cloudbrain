/**
 * KV Access Debug Utilities
 * 
 * Use these to test and verify KV credential access
 */

import { Env } from '../types';

const logger = {
  info: (message: string) => console.log(`[KV-TEST] ✓ ${message}`),
  error: (message: string) => console.error(`[KV-TEST] ✗ ${message}`),
  warn: (message: string) => console.warn(`[KV-TEST] ⚠ ${message}`),
};

export const CREDENTIAL_KEYS = [
  'SECRET_TELEGRAM_API_TOKEN',
  'TELEGRAM_OWNER_ID',
  'DISCORD_BOT_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_PUBLIC_KEY',
  'DISCORD_WEBHOOK_URL',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
];

/**
 * Test if KV binding exists and is accessible
 */
export async function testKVBinding(env: Env): Promise<boolean> {
  try {
    if (!env.SECRETS) {
      logger.error('SECRETS binding not found in env');
      return false;
    }

    // Try a simple test operation
    const testKey = '__kv_test_access__';
    const testValue = 'test-value';

    // Try to write
    await env.SECRETS.put(testKey, testValue);
    logger.info('KV write test successful');

    // Try to read
    const retrieved = await env.SECRETS.get(testKey);
    if (retrieved !== testValue) {
      logger.error(`KV read test failed: expected "${testValue}", got "${retrieved}"`);
      return false;
    }
    logger.info('KV read test successful');

    // Clean up
    await env.SECRETS.delete(testKey);
    logger.info('KV delete test successful');

    return true;
  } catch (error) {
    logger.error(`KV binding test failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Test if D1 binding exists and is accessible
 */
export async function testD1Binding(env: Env): Promise<boolean> {
  try {
    if (!env.DB) {
      logger.error('DB binding not found in env');
      return false;
    }

    // Try a simple query
    const result = await env.DB.prepare('SELECT 1').first();
    if (result === null) {
      logger.error('D1 query returned null');
      return false;
    }

    logger.info('D1 binding test successful');
    return true;
  } catch (error) {
    logger.error(`D1 binding test failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Test if AI binding exists and is accessible
 */
export async function testAIBinding(env: Env): Promise<boolean> {
  try {
    if (!env.AI) {
      logger.error('AI binding not found in env');
      return false;
    }

    // The AI binding exists if we can access it
    logger.info('AI binding test successful');
    return true;
  } catch (error) {
    logger.error(`AI binding test failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * List all credentials stored in KV
 */
export async function listStoredCredentials(env: Env): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  try {
    for (const key of CREDENTIAL_KEYS) {
      const value = await env.SECRETS.get(key);
      results[key] = !!value;
      if (value) {
        logger.info(`${key} - FOUND`);
      } else {
        logger.warn(`${key} - NOT FOUND`);
      }
    }
  } catch (error) {
    logger.error(`Failed to list credentials: ${error instanceof Error ? error.message : String(error)}`);
  }

  return results;
}

/**
 * Verify specific credential exists and has correct format
 */
export async function validateCredential(
  env: Env,
  key: string,
  validator?: (value: string) => boolean
): Promise<{ exists: boolean; valid: boolean; message: string }> {
  try {
    const value = await env.SECRETS.get(key);

    if (!value) {
      return {
        exists: false,
        valid: false,
        message: `Credential "${key}" not found in KV`,
      };
    }

    if (validator && !validator(value)) {
      return {
        exists: true,
        valid: false,
        message: `Credential "${key}" exists but failed validation`,
      };
    }

    return {
      exists: true,
      valid: true,
      message: `Credential "${key}" is valid`,
    };
  } catch (error) {
    return {
      exists: false,
      valid: false,
      message: `Error checking "${key}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate Telegram credentials
 */
export async function validateTelegramCredentials(env: Env): Promise<{
  token: { exists: boolean; valid: boolean };
  ownerId: { exists: boolean; valid: boolean };
  ready: boolean;
}> {
  const token = await validateCredential(env, 'SECRET_TELEGRAM_API_TOKEN', (value) => {
    // Telegram token format: 123456789:ABCdefGHI...
    return /^\d+:[a-zA-Z0-9_-]+$/.test(value);
  });

  const ownerId = await validateCredential(env, 'TELEGRAM_OWNER_ID', (value) => {
    // Owner ID should be a number
    return /^\d+$/.test(value);
  });

  return {
    token: { exists: token.exists, valid: token.valid },
    ownerId: { exists: ownerId.exists, valid: ownerId.valid },
    ready: token.exists && token.valid && ownerId.exists && ownerId.valid,
  };
}

/**
 * Run all diagnostics
 */
export async function runAllDiagnostics(env: Env): Promise<{
  kv: boolean;
  d1: boolean;
  ai: boolean;
  credentials: Record<string, boolean>;
  telegram: { ready: boolean; issues: string[] };
}> {
  logger.info('Starting KV diagnostics...');

  const kvTest = await testKVBinding(env);
  const d1Test = await testD1Binding(env);
  const aiTest = await testAIBinding(env);
  const credentials = await listStoredCredentials(env);
  const telegram = await validateTelegramCredentials(env);

  const issues: string[] = [];

  if (!kvTest) issues.push('KV binding not accessible');
  if (!d1Test) issues.push('D1 binding not accessible');
  if (!aiTest) issues.push('AI binding not accessible');
  if (!telegram.token.exists) issues.push('Telegram token not in KV');
  if (telegram.token.exists && !telegram.token.valid) issues.push('Telegram token has invalid format');
  if (!telegram.ownerId.exists) issues.push('Telegram owner ID not in KV');
  if (telegram.ownerId.exists && !telegram.ownerId.valid) issues.push('Telegram owner ID has invalid format');

  if (issues.length === 0) {
    logger.info('All diagnostics passed! ✓');
  } else {
    logger.warn(`Found ${issues.length} issue(s)`);
    issues.forEach((issue) => logger.warn(`  - ${issue}`));
  }

  return {
    kv: kvTest,
    d1: d1Test,
    ai: aiTest,
    credentials,
    telegram: { ready: telegram.ready, issues },
  };
}

/**
 * Generate diagnostic report as JSON
 */
export async function generateDiagnosticReport(env: Env): Promise<string> {
  const diagnostics = await runAllDiagnostics(env);

  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      bindings: {
        kv: diagnostics.kv ? '✓ OK' : '✗ FAILED',
        d1: diagnostics.d1 ? '✓ OK' : '✗ FAILED',
        ai: diagnostics.ai ? '✓ OK' : '✗ FAILED',
      },
      credentials: {
        total: Object.keys(diagnostics.credentials).length,
        stored: Object.values(diagnostics.credentials).filter(Boolean).length,
        summary: diagnostics.credentials,
      },
      telegram: {
        ready: diagnostics.telegram.ready ? '✓ Ready' : '✗ Not Ready',
        issues: diagnostics.telegram.issues,
      },
      summary: {
        allBindingsOK: diagnostics.kv && diagnostics.d1 && diagnostics.ai,
        telegramReady: diagnostics.telegram.ready,
        issueCount: diagnostics.telegram.issues.length,
      },
    },
    null,
    2
  );
}
