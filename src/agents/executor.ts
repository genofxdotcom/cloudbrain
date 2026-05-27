import { SubTask, TaskPlan } from './planner';
import { WranglerExecutor } from '../wrangler/executor';
import { ChannelManager } from '../channels/manager';
import { IncomingMessage } from '../channels/base';
import { log } from '../utils/logger';
import { query } from '../db/connection';

/**
 * Executor Agent - Executes subtasks and reports progress
 */
export class ExecutorAgent {
  private wrangler: WranglerExecutor;
  private channels: ChannelManager;
  private aiHandler: ((prompt: string, systemPrompt?: string) => Promise<string>) | null = null;
  private searchHandler: ((query: string) => Promise<string>) | null = null;
  private scheduleHandler: ((userId: string, channel: string, params: any) => Promise<string>) | null = null;

  constructor(wrangler: WranglerExecutor, channels: ChannelManager) {
    this.wrangler = wrangler;
    this.channels = channels;
  }

  setAIHandler(handler: (prompt: string, systemPrompt?: string) => Promise<string>) {
    this.aiHandler = handler;
  }

  setSearchHandler(handler: (query: string) => Promise<string>) {
    this.searchHandler = handler;
  }

  setScheduleHandler(handler: (userId: string, channel: string, params: any) => Promise<string>) {
    this.scheduleHandler = handler;
  }

  /**
   * Execute a full plan, reporting progress for multi-step tasks
   */
  async executePlan(plan: TaskPlan, message: IncomingMessage): Promise<string> {
    const results: string[] = [];

    // For multi-step: send progress update
    if (plan.isMultiStep) {
      await this.channels.send(message.channel, message.userId,
        `Working on ${plan.tasks.length} steps...`
      );
    }

    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];

      // Check dependency
      if (task.dependsOn) {
        const dep = plan.tasks.find(t => t.id === task.dependsOn);
        if (dep && dep.status === 'failed') {
          task.status = 'failed';
          task.error = 'Dependency failed';
          continue;
        }
      }

      task.status = 'running';
      const startTime = Date.now();

      try {
        const result = await this.executeSubTask(task, message);
        task.status = 'done';
        task.result = result;
        results.push(result);

        // Log execution
        await this.logExecution(task, message, Date.now() - startTime);

        // Multi-step progress
        if (plan.isMultiStep && i < plan.tasks.length - 1) {
          await this.channels.send(message.channel, message.userId,
            `Step ${i + 1}/${plan.tasks.length} done. ${result.substring(0, 100)}`
          );
        }
      } catch (error: any) {
        task.status = 'failed';
        task.error = error.message;
        results.push(`Error: ${error.message}`);
        log.error('EXECUTOR', `Task failed: ${task.action}`, error);
      }
    }

    // Combine results into one response
    return results.join('\n\n');
  }

  /**
   * Execute a single subtask
   */
  private async executeSubTask(task: SubTask, message: IncomingMessage): Promise<string> {
    switch (task.type) {
      case 'wrangler':
        return this.executeWranglerTask(task);
      case 'ai':
        return this.executeAITask(task);
      case 'search':
        return this.executeSearchTask(task);
      case 'schedule':
        return this.executeScheduleTask(task, message);
      case 'memory':
        return this.executeMemoryTask(task, message);
      case 'media':
        return this.executeMediaTask(task, message);
      case 'chat':
        return this.executeChatTask(task);
      default:
        return `Unknown task type: ${task.type}`;
    }
  }

  private async executeWranglerTask(task: SubTask): Promise<string> {
    const { command, name } = task.params;
    let result;

    switch (command) {
      case 'list_workers': result = await this.wrangler.listWorkers(); break;
      case 'list_zones': result = await this.wrangler.listZones(); break;
      case 'list_kv': result = await this.wrangler.listKVNamespaces(); break;
      case 'list_d1': result = await this.wrangler.listD1Databases(); break;
      case 'list_r2': result = await this.wrangler.listR2Buckets(); break;
      case 'create_kv': result = await this.wrangler.createKVNamespace(name); break;
      case 'create_d1': result = await this.wrangler.createD1Database(name); break;
      case 'create_r2': result = await this.wrangler.createR2Bucket(name); break;
      case 'delete_worker': result = await this.wrangler.deleteWorker(name); break;
      default: result = await this.wrangler.execute(command, name ? [name] : []);
    }

    if (result.success) return result.output || 'Done.';
    return `Failed: ${result.error || 'Unknown error'}`;
  }

  private async executeAITask(task: SubTask): Promise<string> {
    if (!this.aiHandler) return 'AI not available.';
    const { operation, prompt } = task.params;
    if (operation === 'generate_image') {
      return this.aiHandler(`Generate image: ${prompt}`, 'You are an image generation assistant.');
    }
    return this.aiHandler(prompt);
  }

  private async executeSearchTask(task: SubTask): Promise<string> {
    if (!this.searchHandler) return 'Search not available.';
    return this.searchHandler(task.params.query);
  }

  private async executeScheduleTask(task: SubTask, message: IncomingMessage): Promise<string> {
    if (!this.scheduleHandler) return 'Scheduler not available.';
    return this.scheduleHandler(message.userId, message.channel, task.params);
  }

  private async executeMemoryTask(task: SubTask, message: IncomingMessage): Promise<string> {
    const rows = await query(
      'SELECT content FROM memories WHERE user_id = ? ORDER BY importance DESC, created_at DESC LIMIT 5',
      [message.userId]
    );
    if (rows.length === 0) return "I don't have any saved memories yet.";
    return rows.map((r: any, i: number) => `${i + 1}. ${r.content.substring(0, 120)}`).join('\n');
  }

  private async executeMediaTask(task: SubTask, message: IncomingMessage): Promise<string> {
    const { operation } = task.params;
    switch (operation) {
      case 'list': {
        const result = await this.wrangler.r2ListObjects('cloudbrain-media');
        return result.success ? (result.output || 'No files.') : `Failed: ${result.error}`;
      }
      case 'upload': return 'Send me the file and I\'ll upload it to R2.';
      case 'download': return 'Which file would you like me to send?';
      default: return `Media operation: ${operation}`;
    }
  }

  private async executeChatTask(task: SubTask): Promise<string> {
    if (!this.aiHandler) return 'AI not available.';
    return this.aiHandler(task.params.message);
  }

  private async logExecution(task: SubTask, message: IncomingMessage, duration: number) {
    try {
      await query(
        'INSERT INTO task_log (task_id, user_id, action, status, result, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
        [task.id, message.userId, task.action.substring(0, 200), task.status, task.result?.substring(0, 500), duration]
      );
    } catch {}
  }
}
