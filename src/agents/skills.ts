import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { log } from '../utils/logger';
import { WranglerExecutor } from '../wrangler/executor';
import { WebSearch } from '../search/web';
import { query } from '../db/connection';

/**
 * Skill Agent base - each specialized agent has a skill set
 */
export interface SkillResult {
  success: boolean;
  output: string;
  artifacts?: string[]; // file paths, URLs, etc.
}

/**
 * CoderAgent - writes code locally, manages files
 */
export class CoderAgent {
  private workDir: string;

  constructor() {
    this.workDir = path.join(os.homedir(), '.cloudbrain', 'workspace');
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
  }

  async writeFile(filePath: string, content: string): Promise<SkillResult> {
    try {
      const fullPath = path.resolve(this.workDir, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content);
      log.success('CODER', `Written: ${fullPath}`);
      return { success: true, output: `File written: ${fullPath}`, artifacts: [fullPath] };
    } catch (err: any) {
      return { success: false, output: `Failed to write file: ${err.message}` };
    }
  }

  async readFile(filePath: string): Promise<SkillResult> {
    try {
      const fullPath = path.resolve(this.workDir, filePath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, output: `File not found: ${fullPath}` };
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      return { success: true, output: content, artifacts: [fullPath] };
    } catch (err: any) {
      return { success: false, output: `Failed to read: ${err.message}` };
    }
  }

  async runCommand(command: string, cwd?: string): Promise<SkillResult> {
    return new Promise((resolve) => {
      const workingDir = cwd ? path.resolve(this.workDir, cwd) : this.workDir;
      const proc = spawn('bash', ['-c', command], {
        cwd: workingDir,
        env: process.env,
        timeout: 30000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        const success = code === 0;
        log.info('CODER', `Command ${success ? 'succeeded' : 'failed'}: ${command.substring(0, 60)}`);
        resolve({
          success,
          output: stdout.trim() || stderr.trim() || (success ? 'Done.' : 'Command failed.'),
        });
      });

      proc.on('error', (err) => {
        resolve({ success: false, output: `Exec error: ${err.message}` });
      });
    });
  }

  async listFiles(dir?: string): Promise<SkillResult> {
    const targetDir = dir ? path.resolve(this.workDir, dir) : this.workDir;
    try {
      if (!fs.existsSync(targetDir)) {
        return { success: false, output: `Directory not found: ${targetDir}` };
      }
      const files = fs.readdirSync(targetDir, { recursive: true }) as string[];
      return { success: true, output: files.join('\n'), artifacts: files.map(f => path.join(targetDir, f)) };
    } catch (err: any) {
      return { success: false, output: `List error: ${err.message}` };
    }
  }

  getWorkDir(): string {
    return this.workDir;
  }
}

/**
 * DeployerAgent - deploys to Cloudflare (Workers, Pages, etc.)
 */
export class DeployerAgent {
  private wrangler: WranglerExecutor;
  private coder: CoderAgent;

  constructor(wrangler: WranglerExecutor, coder: CoderAgent) {
    this.wrangler = wrangler;
    this.coder = coder;
  }

  async deployWorker(name: string, code?: string): Promise<SkillResult> {
    // If code is provided, write it first
    if (code) {
      const projectDir = path.join(name);
      await this.coder.writeFile(`${projectDir}/index.js`, code);
      await this.coder.writeFile(`${projectDir}/wrangler.toml`, `name = "${name}"\nmain = "index.js"\ncompatibility_date = "2024-01-01"\n`);
    }

    const result = await this.wrangler.deployWorker(this.coder.getWorkDir(), name);
    return {
      success: result.success,
      output: result.success ? `Worker "${name}" deployed.\n${result.output}` : `Deploy failed: ${result.error}`,
    };
  }

  async listWorkers(): Promise<SkillResult> {
    const result = await this.wrangler.listWorkers();
    return { success: result.success, output: result.output || result.error || 'No output' };
  }

  async deleteWorker(name: string): Promise<SkillResult> {
    const result = await this.wrangler.deleteWorker(name);
    return { success: result.success, output: result.success ? `Worker "${name}" deleted.` : `Failed: ${result.error}` };
  }

  async manageKV(operation: string, namespace?: string, key?: string, value?: string): Promise<SkillResult> {
    let result;
    switch (operation) {
      case 'list': result = await this.wrangler.listKVNamespaces(); break;
      case 'create': result = await this.wrangler.createKVNamespace(namespace!); break;
      case 'put': result = await this.wrangler.kvPut(namespace!, key!, value!); break;
      case 'get': result = await this.wrangler.kvGet(namespace!, key!); break;
      case 'delete': result = await this.wrangler.kvDelete(namespace!, key!); break;
      default: return { success: false, output: `Unknown KV operation: ${operation}` };
    }
    return { success: result.success, output: result.output || result.error || 'Done' };
  }

  async manageR2(operation: string, bucket?: string, key?: string, filePath?: string): Promise<SkillResult> {
    let result;
    switch (operation) {
      case 'list_buckets': result = await this.wrangler.listR2Buckets(); break;
      case 'create_bucket': result = await this.wrangler.createR2Bucket(bucket!); break;
      case 'list_objects': result = await this.wrangler.r2ListObjects(bucket!); break;
      case 'upload': result = await this.wrangler.r2Upload(bucket!, key!, filePath!); break;
      case 'download': result = await this.wrangler.r2Download(bucket!, key!, filePath!); break;
      case 'delete': result = await this.wrangler.r2Delete(bucket!, key!); break;
      default: return { success: false, output: `Unknown R2 operation: ${operation}` };
    }
    return { success: result.success, output: result.output || result.error || 'Done' };
  }

  async manageD1(operation: string, dbName?: string, sql?: string): Promise<SkillResult> {
    let result;
    switch (operation) {
      case 'list': result = await this.wrangler.listD1Databases(); break;
      case 'create': result = await this.wrangler.createD1Database(dbName!); break;
      case 'execute': result = await this.wrangler.d1Execute(dbName!, sql!); break;
      default: return { success: false, output: `Unknown D1 operation: ${operation}` };
    }
    return { success: result.success, output: result.output || result.error || 'Done' };
  }
}

/**
 * SearcherAgent - searches the web and local files
 */
export class SearcherAgent {
  private search: WebSearch;
  private coder: CoderAgent;

  constructor(search: WebSearch, coder: CoderAgent) {
    this.search = search;
    this.coder = coder;
  }

  async webSearch(query: string): Promise<SkillResult> {
    const result = await this.search.search(query);
    return { success: true, output: result };
  }

  async localSearch(pattern: string, dir?: string): Promise<SkillResult> {
    const result = await this.coder.runCommand(`grep -rl "${pattern}" . 2>/dev/null | head -20`, dir);
    return result;
  }
}

/**
 * SchedulerAgent - manages cron tasks and recurring automations
 */
export class SchedulerAgent {
  private scheduler: any; // HeartbeatScheduler instance

  constructor(scheduler: any) {
    this.scheduler = scheduler;
  }

  async createTask(userId: string, channel: string, name: string, action: string, timeExpr: string): Promise<SkillResult> {
    const cronExpr = this.scheduler.parseTime(timeExpr);
    if (!cronExpr) {
      return { success: false, output: `Could not parse time: "${timeExpr}". Try "at 9am", "every hour", "daily", "every 5 minutes".` };
    }
    const result = await this.scheduler.create(userId, channel, name, action, cronExpr);
    return { success: true, output: result };
  }

  async listTasks(userId: string): Promise<SkillResult> {
    const tasks = await this.scheduler.listUserTasks(userId);
    if (tasks.length === 0) return { success: true, output: 'No scheduled tasks.' };
    const output = tasks.map((t: any) =>
      `${t.is_active ? '●' : '○'} ${t.task_name} (${t.cron_expression}) → ${t.action}`
    ).join('\n');
    return { success: true, output };
  }

  async deleteTask(taskId: string): Promise<SkillResult> {
    const deleted = await this.scheduler.delete(taskId);
    return { success: deleted, output: deleted ? 'Task deleted.' : 'Task not found.' };
  }
}

/**
 * FileManagerAgent - manages local filesystem operations
 */
export class FileManagerAgent {
  private coder: CoderAgent;

  constructor(coder: CoderAgent) {
    this.coder = coder;
  }

  async create(filePath: string, content: string): Promise<SkillResult> {
    return this.coder.writeFile(filePath, content);
  }

  async read(filePath: string): Promise<SkillResult> {
    return this.coder.readFile(filePath);
  }

  async list(dir?: string): Promise<SkillResult> {
    return this.coder.listFiles(dir);
  }

  async delete(filePath: string): Promise<SkillResult> {
    try {
      const fullPath = path.resolve(this.coder.getWorkDir(), filePath);
      if (!fs.existsSync(fullPath)) return { success: false, output: 'File not found.' };
      fs.unlinkSync(fullPath);
      return { success: true, output: `Deleted: ${fullPath}` };
    } catch (err: any) {
      return { success: false, output: `Delete failed: ${err.message}` };
    }
  }

  async move(from: string, to: string): Promise<SkillResult> {
    try {
      const fromPath = path.resolve(this.coder.getWorkDir(), from);
      const toPath = path.resolve(this.coder.getWorkDir(), to);
      fs.renameSync(fromPath, toPath);
      return { success: true, output: `Moved: ${from} → ${to}` };
    } catch (err: any) {
      return { success: false, output: `Move failed: ${err.message}` };
    }
  }
}

/**
 * SkillRegistry - central registry of all agents and their capabilities
 */
export class SkillRegistry {
  coder: CoderAgent;
  deployer: DeployerAgent;
  searcher: SearcherAgent;
  scheduler: SchedulerAgent;
  fileManager: FileManagerAgent;

  constructor(wrangler: WranglerExecutor, search: WebSearch, heartbeat: any) {
    this.coder = new CoderAgent();
    this.deployer = new DeployerAgent(wrangler, this.coder);
    this.searcher = new SearcherAgent(search, this.coder);
    this.scheduler = new SchedulerAgent(heartbeat);
    this.fileManager = new FileManagerAgent(this.coder);
  }

  /**
   * Get agent description for the AI planner
   */
  describeAgents(): string {
    return [
      'Available specialized agents:',
      '1. CODER - Writes code, runs commands, manages local workspace at ~/.cloudbrain/workspace/',
      '2. DEPLOYER - Deploys to Cloudflare (Workers, KV, D1, R2, DNS)',
      '3. SEARCHER - Searches the web (DuckDuckGo) or local files',
      '4. SCHEDULER - Creates/manages recurring tasks (cron-based)',
      '5. FILE_MANAGER - Creates, reads, deletes, moves local files',
    ].join('\n');
  }
}
