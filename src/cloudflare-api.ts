import { CloudBrainEnv } from './types';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const DEFAULT_D1_DATABASE_NAME = 'cloudbrain';
const DEFAULT_KV_NAMESPACE_TITLE = 'cloudbrain-runtime';
const DEFAULT_R2_BUCKET_NAME = 'cloudbrain-files';

interface CloudflareApiResponse<T> {
  success: boolean;
  errors?: Array<{ message: string }>;
  result?: T;
}

interface ResourceManifest {
  d1DatabaseId: string;
  kvNamespaceId: string;
  r2BucketName: string;
}

let cachedManifest: { accountId: string; manifest: ResourceManifest } | null = null;
let manifestPromise: Promise<ResourceManifest> | null = null;

/**
 * Get Cloudflare credentials from KV
 * These are required for the AI agent to manage Cloudflare resources
 */
async function getCloudflareCredentials(env: CloudBrainEnv): Promise<{ apiToken: string; accountId: string }> {
  try {
    const apiToken = await env.SECRETS.get('CLOUDFLARE_API_TOKEN');
    const accountId = await env.SECRETS.get('CLOUDFLARE_ACCOUNT_ID');

    if (!apiToken || !accountId) {
      throw new Error('Cloudflare credentials not found in KV');
    }

    return { apiToken, accountId };
  } catch (error) {
    throw new Error(`Failed to get Cloudflare credentials: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function cloudflareRequest<T>(
  env: CloudBrainEnv,
  apiToken: string,
  accountId: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const rawBody = await response.text();
  let payload: CloudflareApiResponse<T> | null = null;

  try {
    payload = rawBody ? (JSON.parse(rawBody) as CloudflareApiResponse<T>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || (payload && payload.success === false)) {
    const errorMessage = payload?.errors?.[0]?.message || rawBody || `Cloudflare API request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return (payload?.result as T) ?? (JSON.parse(rawBody || '{}') as T);
}

async function listD1Databases(env: CloudBrainEnv, apiToken: string, accountId: string): Promise<Array<{ uuid: string; name: string }>> {
  return await cloudflareRequest<Array<{ uuid: string; name: string }>>(
    env,
    apiToken,
    accountId,
    `/accounts/${accountId}/d1/database`
  );
}

async function createD1Database(env: CloudBrainEnv, apiToken: string, accountId: string, name: string): Promise<string> {
  const result = await cloudflareRequest<{ uuid: string }>(env, apiToken, accountId, `/accounts/${accountId}/d1/database`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  if (!result?.uuid) {
    throw new Error('D1 database creation did not return an ID');
  }

  return result.uuid;
}

async function listKVNamespaces(env: CloudBrainEnv, apiToken: string, accountId: string): Promise<Array<{ id: string; title: string }>> {
  return await cloudflareRequest<Array<{ id: string; title: string }>>(
    env,
    apiToken,
    accountId,
    `/accounts/${accountId}/storage/kv/namespaces`
  );
}

async function createKVNamespace(env: CloudBrainEnv, apiToken: string, accountId: string, title: string): Promise<string> {
  const result = await cloudflareRequest<{ id: string }>(env, apiToken, accountId, `/accounts/${accountId}/storage/kv/namespaces`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  if (!result?.id) {
    throw new Error('KV namespace creation did not return an ID');
  }

  return result.id;
}

async function listR2Buckets(env: CloudBrainEnv, apiToken: string, accountId: string): Promise<Array<{ name: string }>> {
  return await cloudflareRequest<Array<{ name: string }>>(
    env,
    apiToken,
    accountId,
    `/accounts/${accountId}/r2/buckets`
  );
}

async function createR2Bucket(env: CloudBrainEnv, apiToken: string, accountId: string, name: string): Promise<string> {
  const result = await cloudflareRequest<{ name: string }>(env, apiToken, accountId, `/accounts/${accountId}/r2/buckets`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  if (!result?.name) {
    throw new Error('R2 bucket creation did not return a bucket name');
  }

  return result.name;
}

async function bootstrapManifest(env: CloudBrainEnv, apiToken: string, accountId: string): Promise<ResourceManifest> {
  const [d1Databases, kvNamespaces, r2Buckets] = await Promise.all([
    listD1Databases(env, apiToken, accountId),
    listKVNamespaces(env, apiToken, accountId),
    listR2Buckets(env, apiToken, accountId),
  ]);

  const existingD1 = d1Databases.find((database) => database.name === DEFAULT_D1_DATABASE_NAME);
  const existingKv = kvNamespaces.find((namespace) => namespace.title === DEFAULT_KV_NAMESPACE_TITLE);
  const existingBucket = r2Buckets.find((bucket) => bucket.name === DEFAULT_R2_BUCKET_NAME);

  const d1DatabaseId = existingD1?.uuid || (await createD1Database(env, apiToken, accountId, DEFAULT_D1_DATABASE_NAME));
  const kvNamespaceId = existingKv?.id || (await createKVNamespace(env, apiToken, accountId, DEFAULT_KV_NAMESPACE_TITLE));
  const r2BucketName = existingBucket?.name || (await createR2Bucket(env, apiToken, accountId, DEFAULT_R2_BUCKET_NAME));

  return { d1DatabaseId, kvNamespaceId, r2BucketName };
}

export async function ensureCloudBrainResources(env: CloudBrainEnv): Promise<ResourceManifest> {
  const { apiToken, accountId } = await getCloudflareCredentials(env);

  if (cachedManifest && cachedManifest.accountId === accountId) {
    return cachedManifest.manifest;
  }

  if (!manifestPromise) {
    manifestPromise = bootstrapManifest(env, apiToken, accountId);
  }

  const manifest = await manifestPromise;
  cachedManifest = { accountId, manifest };
  return manifest;
}

export async function getD1DatabaseId(env: CloudBrainEnv): Promise<string> {
  const manifest = await ensureCloudBrainResources(env);
  return manifest.d1DatabaseId;
}

export async function getKVNamespaceId(env: CloudBrainEnv): Promise<string> {
  const manifest = await ensureCloudBrainResources(env);
  return manifest.kvNamespaceId;
}

export async function getR2BucketName(env: CloudBrainEnv): Promise<string> {
  const manifest = await ensureCloudBrainResources(env);
  return manifest.r2BucketName;
}

export async function executeD1Query<T = Record<string, unknown>>(
  env: CloudBrainEnv,
  sql: string,
  params: Array<string | number | boolean | null> = []
): Promise<T[]> {
  const { apiToken, accountId } = await getCloudflareCredentials(env);
  const databaseId = await getD1DatabaseId(env);
  const result = await cloudflareRequest<{ results?: T[] }>(
    env,
    apiToken,
    accountId,
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      body: JSON.stringify({ sql, params }),
    }
  );

  return result.results || [];
}

export async function getKVValue(env: CloudBrainEnv, key: string): Promise<string | null> {
  const { apiToken, accountId } = await getCloudflareCredentials(env);
  const namespaceId = await getKVNamespaceId(env);
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`KV read failed (${response.status})`);
  }

  return await response.text();
}

export async function putKVValue(env: CloudBrainEnv, key: string, value: string): Promise<void> {
  const { apiToken, accountId } = await getCloudflareCredentials(env);
  const namespaceId = await getKVNamespaceId(env);
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: value,
    }
  );

  if (!response.ok) {
    throw new Error(`KV write failed (${response.status})`);
  }
}

export async function deleteKVValue(env: CloudBrainEnv, key: string): Promise<void> {
  const { apiToken, accountId } = await getCloudflareCredentials(env);
  const namespaceId = await getKVNamespaceId(env);
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`KV delete failed (${response.status})`);
  }
}