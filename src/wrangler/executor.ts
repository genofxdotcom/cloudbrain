import { log } from '../utils/logger';
import { getCredential } from '../db/credentials';

export interface WranglerResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

const CF_API = 'https://api.cloudflare.com/client/v4';

/**
 * CloudflareExecutor - Direct Cloudflare REST API client
 * No wrangler CLI dependency, no Node.js 22 requirement
 * Works on any Node.js 18+ with native fetch
 */
export class WranglerExecutor {
  private accountId: string = '';
  private apiToken: string = '';
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.accountId = (await getCredential('CF_ACCOUNT_ID')) || '';
    this.apiToken = (await getCredential('CF_API_TOKEN')) || '';
    this.initialized = true;
  }

  private async api(method: string, path: string, body?: any): Promise<WranglerResult> {
    await this.init();
    if (!this.apiToken) {
      return { success: false, error: 'Cloudflare API token not configured. Run "cloudbrain setup"', exitCode: -1 };
    }

    try {
      const url = path.startsWith('http') ? path : `${CF_API}${path}`;
      const opts: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      };
      if (body) opts.body = JSON.stringify(body);

      const response = await fetch(url, opts);
      const data: any = await response.json();

      if (data.success) {
        const output = data.result
          ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2))
          : 'Done.';
        return { success: true, output, exitCode: 0 };
      }

      const errMsg = data.errors?.map((e: any) => e.message).join(', ') || 'API error';
      return { success: false, error: errMsg, exitCode: 1 };
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }

  private get(path: string) { return this.api('GET', path); }
  private post(path: string, body?: any) { return this.api('POST', path, body); }
  private put(path: string, body?: any) { return this.api('PUT', path, body); }
  private del(path: string) { return this.api('DELETE', path); }

  /**
   * Execute a named command (for backward compat with planner)
   */
  async execute(command: string, args: string[] = [], cwd?: string): Promise<WranglerResult> {
    await this.init();
    if (!this.apiToken) {
      return { success: false, error: 'Cloudflare API token not configured. Run "cloudbrain setup"', exitCode: -1 };
    }
    // Fallback: try to map command to API call
    log.info('CF', `Executing: ${command} ${args.join(' ')}`);
    return { success: false, error: `Direct command "${command}" not mapped. Use specific methods instead.`, exitCode: 1 };
  }

  // ===== WORKERS =====

  async listWorkers(): Promise<WranglerResult> {
    log.info('CF', 'Listing Workers scripts');
    const result = await this.get(`/accounts/${this.accountId}/workers/scripts`);
    if (result.success && result.output) {
      try {
        const scripts = JSON.parse(result.output);
        if (Array.isArray(scripts)) {
          const formatted = scripts.map((s: any) =>
            `• ${s.id} (modified: ${new Date(s.modified_on).toLocaleDateString()})`
          ).join('\n');
          return { ...result, output: formatted || 'No workers found.' };
        }
      } catch {}
    }
    return result;
  }

  async deployWorker(scriptPath: string, name?: string): Promise<WranglerResult> {
    // For deploy, we'd need to read the script file and upload via API
    // This requires multipart form upload
    log.info('CF', `Deploying worker: ${name || 'unnamed'}`);

    if (!name) return { success: false, error: 'Worker name is required for deploy.', exitCode: 1 };

    try {
      const fs = require('fs');
      const path = require('path');
      let scriptContent: string;

      // Try to find the script
      const possiblePaths = [
        path.resolve(scriptPath, 'index.js'),
        path.resolve(scriptPath, 'src/index.js'),
        path.resolve(scriptPath, `${name}.js`),
        scriptPath,
      ];

      let foundPath = '';
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) { foundPath = p; break; }
      }

      if (!foundPath) {
        return { success: false, error: `No script found at ${scriptPath}`, exitCode: 1 };
      }

      scriptContent = fs.readFileSync(foundPath, 'utf-8');

      // Upload via Workers API (simple script upload)
      const response = await fetch(
        `${CF_API}/accounts/${this.accountId}/workers/scripts/${name}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/javascript',
          },
          body: scriptContent,
        }
      );

      const data: any = await response.json();
      if (data.success) {
        log.success('CF', `Worker "${name}" deployed`);
        return { success: true, output: `Worker "${name}" deployed successfully.`, exitCode: 0 };
      }
      return { success: false, error: data.errors?.[0]?.message || 'Deploy failed', exitCode: 1 };
    } catch (error: any) {
      return { success: false, error: `Deploy error: ${error.message}`, exitCode: 1 };
    }
  }

  async deleteWorker(name: string): Promise<WranglerResult> {
    log.info('CF', `Deleting worker: ${name}`);
    return this.del(`/accounts/${this.accountId}/workers/scripts/${name}`);
  }

  async tailWorker(name: string): Promise<WranglerResult> {
    return { success: false, error: 'Tail requires WebSocket connection. Use Cloudflare dashboard for real-time logs.', exitCode: 1 };
  }

  // ===== KV =====

  async listKVNamespaces(): Promise<WranglerResult> {
    log.info('CF', 'Listing KV namespaces');
    const result = await this.get(`/accounts/${this.accountId}/storage/kv/namespaces`);
    if (result.success && result.output) {
      try {
        const namespaces = JSON.parse(result.output);
        if (Array.isArray(namespaces)) {
          const formatted = namespaces.map((ns: any) =>
            `• ${ns.title} (ID: ${ns.id})`
          ).join('\n');
          return { ...result, output: formatted || 'No KV namespaces found.' };
        }
      } catch {}
    }
    return result;
  }

  async createKVNamespace(title: string): Promise<WranglerResult> {
    log.info('CF', `Creating KV namespace: ${title}`);
    return this.post(`/accounts/${this.accountId}/storage/kv/namespaces`, { title });
  }

  async kvPut(namespaceId: string, key: string, value: string): Promise<WranglerResult> {
    log.info('CF', `KV put: ${key} in ${namespaceId}`);
    const response = await fetch(
      `${CF_API}/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
        body: value,
      }
    );
    const data: any = await response.json();
    return data.success
      ? { success: true, output: `Stored "${key}"`, exitCode: 0 }
      : { success: false, error: data.errors?.[0]?.message || 'KV put failed', exitCode: 1 };
  }

  async kvGet(namespaceId: string, key: string): Promise<WranglerResult> {
    log.info('CF', `KV get: ${key} from ${namespaceId}`);
    try {
      const response = await fetch(
        `${CF_API}/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`,
        { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
      );
      if (!response.ok) return { success: false, error: `Key "${key}" not found`, exitCode: 1 };
      const value = await response.text();
      return { success: true, output: value, exitCode: 0 };
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }

  async kvList(namespaceId: string): Promise<WranglerResult> {
    log.info('CF', `KV list keys in ${namespaceId}`);
    const result = await this.get(`/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/keys`);
    if (result.success && result.output) {
      try {
        const keys = JSON.parse(result.output);
        if (Array.isArray(keys)) {
          const formatted = keys.map((k: any) => `• ${k.name}`).join('\n');
          return { ...result, output: formatted || 'No keys.' };
        }
      } catch {}
    }
    return result;
  }

  async kvDelete(namespaceId: string, key: string): Promise<WranglerResult> {
    log.info('CF', `KV delete: ${key} from ${namespaceId}`);
    return this.del(`/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`);
  }

  // ===== D1 =====

  async listD1Databases(): Promise<WranglerResult> {
    log.info('CF', 'Listing D1 databases');
    const result = await this.get(`/accounts/${this.accountId}/d1/database`);
    if (result.success && result.output) {
      try {
        const dbs = JSON.parse(result.output);
        if (Array.isArray(dbs)) {
          const formatted = dbs.map((d: any) =>
            `• ${d.name} (ID: ${d.uuid}, size: ${d.file_size || 'unknown'})`
          ).join('\n');
          return { ...result, output: formatted || 'No D1 databases found.' };
        }
      } catch {}
    }
    return result;
  }

  async createD1Database(name: string): Promise<WranglerResult> {
    log.info('CF', `Creating D1 database: ${name}`);
    return this.post(`/accounts/${this.accountId}/d1/database`, { name });
  }

  async d1Execute(dbName: string, sql: string): Promise<WranglerResult> {
    log.info('CF', `D1 execute on ${dbName}: ${sql.substring(0, 50)}`);
    // First get the database ID
    const listResult = await this.get(`/accounts/${this.accountId}/d1/database`);
    if (!listResult.success) return listResult;

    try {
      const dbs = JSON.parse(listResult.output || '[]');
      const db = dbs.find((d: any) => d.name === dbName);
      if (!db) return { success: false, error: `Database "${dbName}" not found`, exitCode: 1 };

      const result = await this.post(`/accounts/${this.accountId}/d1/database/${db.uuid}/query`, { sql });
      return result;
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }

  // ===== R2 =====

  async listR2Buckets(): Promise<WranglerResult> {
    log.info('CF', 'Listing R2 buckets');
    const result = await this.get(`/accounts/${this.accountId}/r2/buckets`);
    if (result.success && result.output) {
      try {
        const data = JSON.parse(result.output);
        const buckets = data.buckets || data;
        if (Array.isArray(buckets)) {
          const formatted = buckets.map((b: any) =>
            `• ${b.name} (created: ${new Date(b.creation_date).toLocaleDateString()})`
          ).join('\n');
          return { ...result, output: formatted || 'No R2 buckets found.' };
        }
      } catch {}
    }
    return result;
  }

  async createR2Bucket(name: string): Promise<WranglerResult> {
    log.info('CF', `Creating R2 bucket: ${name}`);
    return this.post(`/accounts/${this.accountId}/r2/buckets`, { name });
  }

  async r2Upload(bucket: string, key: string, filePath: string): Promise<WranglerResult> {
    log.info('CF', `R2 upload: ${key} to ${bucket}`);
    try {
      const fs = require('fs');
      const fileContent = fs.readFileSync(filePath);
      const response = await fetch(
        `${CF_API}/accounts/${this.accountId}/r2/buckets/${bucket}/objects/${key}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/octet-stream',
          },
          body: fileContent,
        }
      );
      const data: any = await response.json();
      return data.success
        ? { success: true, output: `Uploaded "${key}" to ${bucket}`, exitCode: 0 }
        : { success: false, error: data.errors?.[0]?.message || 'Upload failed', exitCode: 1 };
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }

  async r2Download(bucket: string, key: string, outputPath: string): Promise<WranglerResult> {
    log.info('CF', `R2 download: ${key} from ${bucket}`);
    try {
      const fs = require('fs');
      const response = await fetch(
        `${CF_API}/accounts/${this.accountId}/r2/buckets/${bucket}/objects/${key}`,
        { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
      );
      if (!response.ok) return { success: false, error: `Object "${key}" not found`, exitCode: 1 };
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      return { success: true, output: `Downloaded "${key}" to ${outputPath}`, exitCode: 0 };
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }

  async r2Delete(bucket: string, key: string): Promise<WranglerResult> {
    log.info('CF', `R2 delete: ${key} from ${bucket}`);
    return this.del(`/accounts/${this.accountId}/r2/buckets/${bucket}/objects/${key}`);
  }

  async r2ListObjects(bucket: string): Promise<WranglerResult> {
    log.info('CF', `R2 list objects in ${bucket}`);
    const result = await this.get(`/accounts/${this.accountId}/r2/buckets/${bucket}/objects`);
    if (result.success && result.output) {
      try {
        const data = JSON.parse(result.output);
        const objects = data.objects || data;
        if (Array.isArray(objects)) {
          const formatted = objects.map((o: any) =>
            `• ${o.key} (${o.size ? (o.size / 1024).toFixed(1) + ' KB' : 'unknown size'})`
          ).join('\n');
          return { ...result, output: formatted || 'No objects in bucket.' };
        }
      } catch {}
    }
    return result;
  }

  // ===== ZONES / DOMAINS =====

  async listZones(): Promise<WranglerResult> {
    log.info('CF', 'Listing zones/domains');
    const result = await this.get('/zones');
    if (result.success && result.output) {
      try {
        const zones = JSON.parse(result.output);
        if (Array.isArray(zones)) {
          const formatted = zones.map((z: any) =>
            `• ${z.name} (${z.status}, plan: ${z.plan?.name || 'unknown'})`
          ).join('\n');
          return { ...result, output: formatted || 'No zones found.' };
        }
      } catch {}
    }
    return result;
  }

  // ===== CRON TRIGGERS =====

  async getCronTriggers(workerName: string): Promise<WranglerResult> {
    return this.get(`/accounts/${this.accountId}/workers/scripts/${workerName}/schedules`);
  }

  async setCronTriggers(workerName: string, crons: string[]): Promise<WranglerResult> {
    await this.init();
    const body = crons.map(c => ({ cron: c }));
    return this.put(`/accounts/${this.accountId}/workers/scripts/${workerName}/schedules`, body);
  }
}
