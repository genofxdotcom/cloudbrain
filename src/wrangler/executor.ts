import { spawn } from 'child_process';
import { log } from '../utils/logger';
import { getCredential } from '../db/credentials';

export interface WranglerResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

/**
 * WranglerExecutor - Runs wrangler commands with stored credentials
 * This is the core that gives CloudBrain full Cloudflare access
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

  /**
   * Execute any wrangler command
   */
  async execute(command: string, args: string[] = [], cwd?: string): Promise<WranglerResult> {
    await this.init();

    if (!this.apiToken) {
      return { success: false, error: 'Cloudflare API token not configured. Run "cloudbrain setup"', exitCode: -1 };
    }

    const fullArgs = [command, ...args];
    log.info('WRANGLER', `Executing: wrangler ${fullArgs.join(' ')}`);

    return new Promise((resolve) => {
      const env = {
        ...process.env,
        CLOUDFLARE_API_TOKEN: this.apiToken,
        CLOUDFLARE_ACCOUNT_ID: this.accountId,
      };

      const proc = spawn('npx', ['wrangler', ...fullArgs], {
        cwd: cwd || process.cwd(),
        env,
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const exitCode = code || 0;
        const success = exitCode === 0;

        if (success) {
          log.success('WRANGLER', `Command completed: wrangler ${command}`);
        } else {
          log.error('WRANGLER', `Command failed: wrangler ${command}`, stderr);
        }

        resolve({
          success,
          output: stdout.trim(),
          error: stderr.trim() || undefined,
          exitCode,
        });
      });

      proc.on('error', (error) => {
        log.error('WRANGLER', `Spawn error: ${error.message}`);
        resolve({
          success: false,
          error: `Failed to run wrangler: ${error.message}`,
          exitCode: -1,
        });
      });
    });
  }

  // ===== HIGH-LEVEL CLOUDFLARE OPERATIONS =====

  async listWorkers(): Promise<WranglerResult> {
    return this.execute('deployments', ['list']);
  }

  async deployWorker(scriptPath: string, name?: string): Promise<WranglerResult> {
    const args = name ? ['--name', name] : [];
    return this.execute('deploy', args, scriptPath);
  }

  async deleteWorker(name: string): Promise<WranglerResult> {
    return this.execute('delete', [name, '--force']);
  }

  async tailWorker(name: string): Promise<WranglerResult> {
    return this.execute('tail', [name, '--format', 'json']);
  }

  // KV
  async listKVNamespaces(): Promise<WranglerResult> {
    return this.execute('kv:namespace', ['list']);
  }

  async createKVNamespace(title: string): Promise<WranglerResult> {
    return this.execute('kv:namespace', ['create', title]);
  }

  async kvPut(namespaceId: string, key: string, value: string): Promise<WranglerResult> {
    return this.execute('kv:key', ['put', '--namespace-id', namespaceId, key, value]);
  }

  async kvGet(namespaceId: string, key: string): Promise<WranglerResult> {
    return this.execute('kv:key', ['get', '--namespace-id', namespaceId, key]);
  }

  async kvList(namespaceId: string): Promise<WranglerResult> {
    return this.execute('kv:key', ['list', '--namespace-id', namespaceId]);
  }

  async kvDelete(namespaceId: string, key: string): Promise<WranglerResult> {
    return this.execute('kv:key', ['delete', '--namespace-id', namespaceId, key]);
  }

  // D1
  async listD1Databases(): Promise<WranglerResult> {
    return this.execute('d1', ['list']);
  }

  async createD1Database(name: string): Promise<WranglerResult> {
    return this.execute('d1', ['create', name]);
  }

  async d1Execute(dbName: string, sql: string): Promise<WranglerResult> {
    return this.execute('d1', ['execute', dbName, '--command', sql]);
  }

  // R2
  async listR2Buckets(): Promise<WranglerResult> {
    return this.execute('r2', ['bucket', 'list']);
  }

  async createR2Bucket(name: string): Promise<WranglerResult> {
    return this.execute('r2', ['bucket', 'create', name]);
  }

  async r2Upload(bucket: string, key: string, filePath: string): Promise<WranglerResult> {
    return this.execute('r2', ['object', 'put', `${bucket}/${key}`, '--file', filePath]);
  }

  async r2Download(bucket: string, key: string, outputPath: string): Promise<WranglerResult> {
    return this.execute('r2', ['object', 'get', `${bucket}/${key}`, '--file', outputPath]);
  }

  async r2Delete(bucket: string, key: string): Promise<WranglerResult> {
    return this.execute('r2', ['object', 'delete', `${bucket}/${key}`]);
  }

  async r2ListObjects(bucket: string): Promise<WranglerResult> {
    return this.execute('r2', ['object', 'list', bucket]);
  }

  // Domains / Zones (via Cloudflare API directly since wrangler doesn't manage zones)
  async listZones(): Promise<WranglerResult> {
    // Wrangler doesn't have zone listing - use API via curl
    const result = await this.executeRawApi('/zones');
    return result;
  }

  // Cron triggers
  async getCronTriggers(workerName: string): Promise<WranglerResult> {
    return this.executeRawApi(`/accounts/${this.accountId}/workers/scripts/${workerName}/schedules`);
  }

  async setCronTriggers(workerName: string, crons: string[]): Promise<WranglerResult> {
    await this.init();
    const body = crons.map(c => ({ cron: c }));
    return this.executeRawApiPost(
      `/accounts/${this.accountId}/workers/scripts/${workerName}/schedules`,
      body
    );
  }

  // Direct API calls for things wrangler doesn't cover
  private async executeRawApi(path: string): Promise<WranglerResult> {
    await this.init();
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (response.ok) {
        return { success: true, output: JSON.stringify(data.result, null, 2), exitCode: 0 };
      }
      return { success: false, error: data.errors?.[0]?.message || 'API error', exitCode: 1 };
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }

  private async executeRawApiPost(path: string, body: any): Promise<WranglerResult> {
    await this.init();
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.ok) {
        return { success: true, output: JSON.stringify(data.result, null, 2), exitCode: 0 };
      }
      return { success: false, error: data.errors?.[0]?.message || 'API error', exitCode: 1 };
    } catch (error: any) {
      return { success: false, error: error.message, exitCode: 1 };
    }
  }
}
