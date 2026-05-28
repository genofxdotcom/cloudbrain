import { log } from '../utils/logger';
import { IncomingMessage } from '../channels/base';

export interface TaskPlan {
  id: string;
  originalRequest: string;
  tasks: SubTask[];
  isMultiStep: boolean;
  estimatedDuration?: number;
}

export interface SubTask {
  id: string;
  action: string;
  type: 'wrangler' | 'ai' | 'search' | 'schedule' | 'memory' | 'media' | 'chat';
  params: Record<string, any>;
  dependsOn?: string; // ID of task this depends on
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: string;
  error?: string;
}

/**
 * Planner Agent - Decomposes user requests into executable subtasks
 */
export class PlannerAgent {

  /**
   * Analyze user message and create an execution plan
   */
  createPlan(message: IncomingMessage): TaskPlan {
    const text = message.text.toLowerCase();
    const planId = `plan_${Date.now()}`;
    const tasks: SubTask[] = [];

    log.info('PLANNER', `Planning for: "${message.text.substring(0, 60)}..."`);

    // Detect multiple actions (multi-step)
    const steps = this.detectSteps(text, message.text);

    for (const step of steps) {
      tasks.push(step);
    }

    const plan: TaskPlan = {
      id: planId,
      originalRequest: message.text,
      tasks,
      isMultiStep: tasks.length > 1,
    };

    log.info('PLANNER', `Plan created: ${tasks.length} task(s), multi-step: ${plan.isMultiStep}`);
    return plan;
  }

  private detectSteps(lower: string, original: string): SubTask[] {
    const tasks: SubTask[] = [];
    const taskId = () => `t_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // ===== MULTI-STEP DETECTION (check first, before single-intent) =====
    // Check for "then", "and also", "after that" patterns
    const parts = original.split(/\s+(?:then|and then|after that|also|next)\s+/i);
    if (parts.length > 1) {
      for (let i = 0; i < parts.length; i++) {
        const partLower = parts[i].toLowerCase();
        const subTasks = this.detectSteps(partLower, parts[i]);
        for (const t of subTasks) {
          if (i > 0) t.dependsOn = tasks[tasks.length - 1]?.id;
          tasks.push(t);
        }
      }
      return tasks;
    }

    // ===== WRANGLER / CLOUDFLARE OPERATIONS =====
    if (this.matchesCF(lower)) {
      tasks.push({ id: taskId(), action: original, type: 'wrangler', params: this.parseCFParams(lower, original), status: 'pending' });
      return tasks;
    }

    // ===== IMAGE GENERATION =====
    if (this.matchesImage(lower)) {
      tasks.push({ id: taskId(), action: original, type: 'ai', params: { operation: 'generate_image', prompt: this.extractPrompt(lower, original) }, status: 'pending' });
      return tasks;
    }

    // ===== WEB SEARCH =====
    if (this.matchesSearch(lower)) {
      tasks.push({ id: taskId(), action: original, type: 'search', params: { query: this.extractSearchQuery(lower, original) }, status: 'pending' });
      return tasks;
    }

    // ===== SCHEDULING =====
    if (this.matchesSchedule(lower, original)) {
      tasks.push({ id: taskId(), action: original, type: 'schedule', params: this.parseScheduleParams(lower, original), status: 'pending' });
      return tasks;
    }

    // ===== MEMORY =====
    if (this.matchesMemory(lower)) {
      tasks.push({ id: taskId(), action: original, type: 'memory', params: { operation: 'recall' }, status: 'pending' });
      return tasks;
    }

    // ===== MEDIA =====
    if (this.matchesMedia(lower)) {
      tasks.push({ id: taskId(), action: original, type: 'media', params: { operation: this.parseMediaOp(lower) }, status: 'pending' });
      return tasks;
    }

    // ===== DEFAULT: CHAT =====
    tasks.push({ id: taskId(), action: original, type: 'chat', params: { message: original }, status: 'pending' });
    return tasks;
  }

  // Intent matchers (require full phrases, not single keywords)
  private matchesCF(text: string): boolean {
    const phrases = ['list workers', 'list domains', 'list kv', 'list databases', 'list buckets',
      'show workers', 'show domains', 'my workers', 'my domains', 'my databases',
      'create worker', 'create domain', 'create kv', 'create database', 'create bucket',
      'deploy worker', 'delete worker', 'deploy', 'kv put', 'kv get', 'kv delete',
      'r2 upload', 'r2 download', 'r2 list', 'r2 delete',
      'add dns', 'dns records', 'cron trigger', 'tail worker', 'worker logs'];
    return phrases.some(p => text.includes(p));
  }

  private matchesImage(text: string): boolean {
    const phrases = ['generate image', 'generate an image', 'create image', 'create an image', 'make image', 'draw a', 'draw me'];
    return phrases.some(p => text.includes(p));
  }

  private matchesSearch(text: string): boolean {
    const phrases = ['search for', 'search about', 'look up', 'find me', 'find out', 'google', 'search the web', 'latest news'];
    return phrases.some(p => text.includes(p));
  }

  private matchesSchedule(lower: string, original: string): boolean {
    const timePattern = /\b(at\s+\d{1,2}\s*(am|pm))\b/i;
    const recurPattern = /\b(every\s+(hour|day|morning|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s+minutes?))\b/i;
    const hasTime = timePattern.test(original) || recurPattern.test(original) || /\b(daily|hourly)\b/i.test(original);
    const hasAction = /\b(send|give|get|remind|run|do|check|fetch|news|report|backup|update|alert|notify)\b/i.test(original);
    return hasTime && original.split(/\s+/).length >= 4 && hasAction;
  }

  private matchesMemory(text: string): boolean {
    const phrases = ['what did i tell you', 'what did i say', 'recall my', 'my memories', 'remember what', 'what do you remember'];
    return phrases.some(p => text.includes(p));
  }

  private matchesMedia(text: string): boolean {
    const phrases = ['upload file', 'download file', 'send me the file', 'store this file', 'list files', 'delete file', 'show files'];
    return phrases.some(p => text.includes(p));
  }

  // Parameter extractors
  private parseCFParams(lower: string, original: string): Record<string, any> {
    if (lower.includes('list workers') || lower.includes('my workers') || lower.includes('show workers')) return { command: 'list_workers' };
    if (lower.includes('list domains') || lower.includes('my domains') || lower.includes('show domains')) return { command: 'list_zones' };
    if (lower.includes('list kv') || lower.includes('kv namespaces')) return { command: 'list_kv' };
    if (lower.includes('list databases') || lower.includes('my databases')) return { command: 'list_d1' };
    if (lower.includes('list buckets') || lower.includes('r2 list')) return { command: 'list_r2' };
    if (lower.includes('deploy')) return { command: 'deploy', name: this.extractName(original, 'deploy') };
    if (lower.includes('create kv')) return { command: 'create_kv', name: this.extractName(original, 'create kv') };
    if (lower.includes('create database')) return { command: 'create_d1', name: this.extractName(original, 'create database') };
    if (lower.includes('create bucket')) return { command: 'create_r2', name: this.extractName(original, 'create bucket') };
    if (lower.includes('delete worker')) return { command: 'delete_worker', name: this.extractName(original, 'delete worker') };
    return { command: 'unknown', raw: original };
  }

  private extractPrompt(lower: string, original: string): string {
    const prefixes = ['generate image of', 'generate an image of', 'create image of', 'create an image of', 'make image of', 'draw a', 'draw me'];
    for (const p of prefixes) {
      const idx = lower.indexOf(p);
      if (idx !== -1) return original.substring(idx + p.length).trim();
    }
    return original;
  }

  private extractSearchQuery(lower: string, original: string): string {
    const prefixes = ['search for', 'search about', 'look up', 'find me', 'find out about', 'google', 'search the web for'];
    for (const p of prefixes) {
      const idx = lower.indexOf(p);
      if (idx !== -1) return original.substring(idx + p.length).trim();
    }
    return original;
  }

  private parseScheduleParams(lower: string, original: string): Record<string, any> {
    const timePatterns = [/at\s+\d{1,2}\s*(am|pm)/i, /every\s+(hour|day|morning|evening|\w+)/i, /\bdaily\b/i, /\bhourly\b/i];
    let timeExpr = '';
    for (const p of timePatterns) { const m = original.match(p); if (m) { timeExpr = m[0]; break; } }
    const action = original.replace(new RegExp(timeExpr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
    return { timeExpression: timeExpr, action, taskName: action.substring(0, 50) };
  }

  private parseMediaOp(text: string): string {
    if (text.includes('upload')) return 'upload';
    if (text.includes('download') || text.includes('send me')) return 'download';
    if (text.includes('delete')) return 'delete';
    if (text.includes('list') || text.includes('show files')) return 'list';
    return 'unknown';
  }

  private extractName(text: string, after: string): string {
    const idx = text.toLowerCase().indexOf(after);
    if (idx === -1) return '';
    const rest = text.substring(idx + after.length).trim();
    // Take first word or quoted string
    const quoted = rest.match(/["']([^"']+)["']/);
    if (quoted) return quoted[1];
    return rest.split(/\s+/)[0] || '';
  }
}
