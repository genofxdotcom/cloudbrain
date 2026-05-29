import { SubTask, TaskPlan } from './planner';
import { SkillRegistry } from './skills';
import { ChannelManager } from '../channels/manager';
import { IncomingMessage } from '../channels/base';
import { log } from '../utils/logger';
import { query } from '../db/connection';

/**
 * Executor Agent - Dispatches subtasks to specialized skill agents
 * Action-oriented: executes tasks, doesn't just talk about them
 */
export class ExecutorAgent {
  private skills: SkillRegistry;
  private channels: ChannelManager;
  private aiHandler: ((prompt: string, systemPrompt?: string) => Promise<string>) | null = null;
  private searchHandler: ((query: string) => Promise<string>) | null = null;
  private scheduleHandler: ((userId: string, channel: string, params: any) => Promise<string>) | null = null;

  constructor(skills: SkillRegistry, channels: ChannelManager) {
    this.skills = skills;
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
            `Step ${i + 1}/${plan.tasks.length} done.`
          );
        }
      } catch (error: any) {
        task.status = 'failed';
        task.error = error.message;
        results.push(`Error: ${error.message}`);
        log.error('EXECUTOR', `Task failed: ${task.action}`, error);
      }
    }

    return results.join('\n\n');
  }

  /**
   * Execute a single subtask by dispatching to the appropriate skill agent
   */
  private async executeSubTask(task: SubTask, message: IncomingMessage): Promise<string> {
    switch (task.type) {
      case 'deploy':
      case 'wrangler':
        return this.executeDeployTask(task);
      case 'code':
        return this.executeCodeTask(task, message);
      case 'file':
        return this.executeFileTask(task);
      case 'ai':
        return this.executeAITask(task);
      case 'search':
        return this.executeSearchTask(task);
      case 'schedule':
        return this.executeScheduleTask(task, message);
      case 'memory':
        return this.executeMemoryTask(task, message);
      case 'media':
        return this.executeMediaTask(task);
      case 'chat':
        return this.executeChatTask(task, message);
      default:
        return `Unknown task type: ${task.type}`;
    }
  }

  private async executeDeployTask(task: SubTask): Promise<string> {
    const { command, name } = task.params;

    switch (command) {
      case 'list_workers': {
        const r = await this.skills.deployer.listWorkers();
        return r.output;
      }
      case 'list_zones': {
        const r = await this.skills.deployer.listWorkers(); // zones via wrangler
        return r.output;
      }
      case 'list_kv': {
        const r = await this.skills.deployer.manageKV('list');
        return r.output;
      }
      case 'list_d1': {
        const r = await this.skills.deployer.manageD1('list');
        return r.output;
      }
      case 'list_r2': {
        const r = await this.skills.deployer.manageR2('list_buckets');
        return r.output;
      }
      case 'create_kv': {
        const r = await this.skills.deployer.manageKV('create', name);
        return r.output;
      }
      case 'create_d1': {
        const r = await this.skills.deployer.manageD1('create', name);
        return r.output;
      }
      case 'create_r2': {
        const r = await this.skills.deployer.manageR2('create_bucket', name);
        return r.output;
      }
      case 'delete_worker': {
        const r = await this.skills.deployer.deleteWorker(name);
        return r.output;
      }
      case 'deploy': {
        const r = await this.skills.deployer.deployWorker(name);
        return r.output;
      }
      default: {
        const r = await this.skills.coder.runCommand(`npx wrangler ${command} ${name || ''}`);
        return r.output;
      }
    }
  }

  private async executeCodeTask(task: SubTask, message: IncomingMessage): Promise<string> {
    const { operation, command, description } = task.params;

    if (operation === 'run' && command) {
      const r = await this.skills.coder.runCommand(command);
      return r.success ? r.output : `Command failed: ${r.output}`;
    }

    if (operation === 'write' && this.aiHandler) {
      // Ask AI to generate code, then write it
      const codePrompt = `Write the code for: ${description}\n\nRespond with ONLY the code, no explanations. If it needs a filename, put it as a comment on the first line.`;
      const code = await this.aiHandler(codePrompt, 'You are a code generator. Output only code.');
      
      // Try to extract filename from AI response or use a default
      const filenameMatch = code.match(/^(?:\/\/|#)\s*(?:filename|file):\s*(.+)/i);
      const filename = filenameMatch ? filenameMatch[1].trim() : 'output.js';
      
      const r = await this.skills.coder.writeFile(filename, code);
      return r.success ? `Code written to ${filename}:\n\n${code.substring(0, 500)}` : r.output;
    }

    return 'Could not determine what code to write. Be more specific.';
  }

  private async executeFileTask(task: SubTask): Promise<string> {
    const { operation, path: filePath, content } = task.params;

    switch (operation) {
      case 'create': {
        const r = await this.skills.fileManager.create(filePath, content || '');
        return r.output;
      }
      case 'read': {
        const r = await this.skills.fileManager.read(filePath);
        return r.output;
      }
      case 'list': {
        const r = await this.skills.fileManager.list();
        return r.output || 'No files in workspace.';
      }
      case 'delete': {
        const r = await this.skills.fileManager.delete(filePath);
        return r.output;
      }
      case 'move': {
        const r = await this.skills.fileManager.move(task.params.from, task.params.to);
        return r.output;
      }
      default:
        return `Unknown file operation: ${operation}`;
    }
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
    const r = await this.skills.searcher.webSearch(task.params.query);
    return r.output;
  }

  private async executeScheduleTask(task: SubTask, message: IncomingMessage): Promise<string> {
    const r = await this.skills.scheduler.createTask(
      message.userId, message.channel,
      task.params.taskName || task.params.action,
      task.params.action,
      task.params.timeExpression
    );
    return r.output;
  }

  private async executeMemoryTask(task: SubTask, message: IncomingMessage): Promise<string> {
    const rows = await query(
      'SELECT content FROM memories WHERE user_id = ? ORDER BY importance DESC, created_at DESC LIMIT 10',
      [message.userId]
    );
    if (rows.length === 0) return "I don't have any saved memories yet.";
    return 'Here\'s what I remember:\n' + rows.map((r: any, i: number) => `${i + 1}. ${r.content}`).join('\n');
  }

  private async executeMediaTask(task: SubTask): Promise<string> {
    const { operation } = task.params;
    switch (operation) {
      case 'list': {
        const r = await this.skills.deployer.manageR2('list_objects', 'cloudbrain-media');
        return r.success ? r.output : 'No media files.';
      }
      case 'upload': return 'Send me the file and I\'ll upload it.';
      case 'download': return 'Which file would you like?';
      default: return `Media operation: ${operation}`;
    }
  }

  private async executeChatTask(task: SubTask, message: IncomingMessage): Promise<string> {
    if (!this.aiHandler) return 'AI not available.';
    // Action-oriented: if the message seems like a request, try to act on it
    const actionPrompt = `User says: "${task.params.message}"\n\nRespond directly. If they're asking you to DO something, describe what you're doing and the result. Be concise and action-oriented. Don't say "I can help with that" — just DO it.`;
    return this.aiHandler(actionPrompt);
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
