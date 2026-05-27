import cron from 'node-cron';
import { query } from '../db/connection';
import { log } from '../utils/logger';
import { ChannelManager } from '../channels/manager';

/**
 * Heartbeat Scheduler - Persistent cron jobs stored in MySQL
 */
export class HeartbeatScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private channels: ChannelManager;
  private taskExecutor: ((action: string, userId: string, channel: string) => Promise<string>) | null = null;

  constructor(channels: ChannelManager) {
    this.channels = channels;
  }

  setExecutor(executor: (action: string, userId: string, channel: string) => Promise<string>) {
    this.taskExecutor = executor;
  }

  /**
   * Load all active tasks from DB and schedule them
   */
  async loadFromDB(): Promise<void> {
    const rows = await query('SELECT * FROM scheduled_tasks WHERE is_active = TRUE');
    for (const row of rows) {
      this.scheduleTask(row);
    }
    log.info('SCHEDULER', `Loaded ${rows.length} scheduled tasks`);
  }

  /**
   * Create a new scheduled task
   */
  async create(userId: string, channel: string, taskName: string, action: string, cronExpr: string): Promise<string> {
    if (!cron.validate(cronExpr)) {
      return `Invalid cron expression: ${cronExpr}`;
    }

    const id = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await query(
      'INSERT INTO scheduled_tasks (id, user_id, task_name, action, cron_expression, channel) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, taskName, action, cronExpr, channel]
    );

    const task = { id, user_id: userId, task_name: taskName, action, cron_expression: cronExpr, channel };
    this.scheduleTask(task);

    log.success('SCHEDULER', `Task created: ${taskName} (${cronExpr})`);
    return `Scheduled "${taskName}" with cron ${cronExpr}. Task ID: ${id}`;
  }

  /**
   * Parse natural language time to cron
   */
  parseTime(input: string): string | null {
    input = input.toLowerCase().trim();

    const timeMatch = input.match(/at\s+(\d{1,2})\s*(am|pm)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      if (timeMatch[2] === 'pm' && hour !== 12) hour += 12;
      if (timeMatch[2] === 'am' && hour === 12) hour = 0;
      return `0 ${hour} * * *`;
    }

    if (input.includes('every hour') || input.includes('hourly')) return '0 * * * *';
    if (input.includes('every morning')) return '0 6 * * *';
    if (input.includes('every evening')) return '0 18 * * *';
    if (input.includes('daily')) return '0 0 * * *';

    const minMatch = input.match(/every\s+(\d+)\s+minutes?/i);
    if (minMatch) return `*/${minMatch[1]} * * * *`;

    const dayMatch = input.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch) {
      const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      return `0 0 * * ${days[dayMatch[1].toLowerCase()]}`;
    }

    return null;
  }

  /**
   * Delete a task
   */
  async delete(taskId: string): Promise<boolean> {
    const job = this.jobs.get(taskId);
    if (job) { job.stop(); this.jobs.delete(taskId); }
    const result = await query('DELETE FROM scheduled_tasks WHERE id = ?', [taskId]);
    return result.affectedRows > 0;
  }

  /**
   * List user's tasks
   */
  async listUserTasks(userId: string): Promise<any[]> {
    return query('SELECT * FROM scheduled_tasks WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }

  private scheduleTask(task: any) {
    const job = cron.schedule(task.cron_expression, async () => {
      log.info('SCHEDULER', `Executing: ${task.task_name}`);
      try {
        let result = 'Task executed.';
        if (this.taskExecutor) {
          result = await this.taskExecutor(task.action, task.user_id, task.channel);
        }
        await this.channels.send(task.channel, task.user_id, result);
        await query('UPDATE scheduled_tasks SET last_run = NOW() WHERE id = ?', [task.id]);
      } catch (error: any) {
        log.error('SCHEDULER', `Task ${task.id} failed: ${error.message}`);
      }
    });

    this.jobs.set(task.id, job);
  }

  stopAll() {
    for (const [, job] of this.jobs) job.stop();
    this.jobs.clear();
  }
}
