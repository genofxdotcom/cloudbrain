import { query } from './connection';
import { log } from '../utils/logger';

/**
 * Credential storage in MySQL
 * Categories: cloudflare, telegram, discord, whatsapp, search, general
 */

export async function setCredential(key: string, value: string, category: string = 'general'): Promise<void> {
  await query(
    'INSERT INTO credentials (`key`, `value`, category) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = ?, category = ?',
    [key, value, category, value, category]
  );
  log.info('CREDS', `Credential set: ${key} (${category})`);
}

export async function getCredential(key: string): Promise<string | null> {
  const rows = await query('SELECT `value` FROM credentials WHERE `key` = ?', [key]);
  return rows.length > 0 ? rows[0].value : null;
}

export async function getAllCredentials(category?: string): Promise<Array<{ key: string; value: string; category: string }>> {
  if (category) {
    return await query('SELECT `key`, `value`, category FROM credentials WHERE category = ?', [category]);
  }
  return await query('SELECT `key`, `value`, category FROM credentials');
}

export async function deleteCredential(key: string): Promise<boolean> {
  const result = await query('DELETE FROM credentials WHERE `key` = ?', [key]);
  return result.affectedRows > 0;
}

export async function getCredentialsByCategory(): Promise<Record<string, Array<{ key: string; value: string }>>> {
  const all = await getAllCredentials();
  const grouped: Record<string, Array<{ key: string; value: string }>> = {};
  for (const cred of all) {
    if (!grouped[cred.category]) grouped[cred.category] = [];
    grouped[cred.category].push({ key: cred.key, value: cred.value });
  }
  return grouped;
}

/**
 * Get Cloudflare credentials
 */
export async function getCloudflareCredentials(): Promise<{ accountId: string; apiToken: string } | null> {
  const accountId = await getCredential('CF_ACCOUNT_ID');
  const apiToken = await getCredential('CF_API_TOKEN');
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

/**
 * Get Telegram credentials
 */
export async function getTelegramCredentials(): Promise<{ botToken: string; ownerId: string } | null> {
  const botToken = await getCredential('TELEGRAM_BOT_TOKEN');
  const ownerId = await getCredential('TELEGRAM_OWNER_ID');
  if (!botToken || !ownerId) return null;
  return { botToken, ownerId };
}
