/**
 * Heartbeat Scheduler - Dynamic Cron Job Management
 * Create scheduled tasks at runtime using Cloudflare Cron Triggers API
 * "Give me news at 9am" → Automatically schedules and executes
 */

export interface ScheduledTask {
  id: string;
  userId: string;
  taskName: string;
  description?: string;
  taskExpression: string; // Natural language: "at 9am", "every hour", etc.
  cronExpression: string; // Parsed cron: "0 9 * * *"
  timezone?: string;
  action: string; // What to do when triggered: "send news", "run automation", etc.
  nextRun?: Date;
  lastRun?: Date;
  isActive: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CronScheduleRequest {
  taskId: string;
  cronExpression: string;
  workerName: string;
  metadata?: Record<string, any>;
}

export interface CronParseResult {
  minute: number | string;
  hour: number | string;
  dayOfMonth: number | string;
  month: number | string;
  dayOfWeek: number | string;
  isValid: boolean;
  description?: string;
}

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [${tag}] ${message}`, error || '');
  },
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] [WARN] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

/**
 * HeartbeatScheduler - Manage dynamic cron schedules
 */
export class HeartbeatScheduler {
  private kv: KVNamespace;
  private apiToken: string;
  private accountId: string;
  private workerName: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(kv: KVNamespace, apiToken: string, accountId: string, workerName: string) {
    this.kv = kv;
    this.apiToken = apiToken;
    this.accountId = accountId;
    this.workerName = workerName;
    logger.info('SCHEDULER', 'Heartbeat Scheduler initialized');
  }

  /**
   * Parse natural language time to cron expression
   */
  parseNaturalTime(input: string): { cron: string; description: string; isValid: boolean } {
    input = input.toLowerCase().trim();
    logger.debug('SCHEDULER', `Parsing natural time: ${input}`);

    // "at 9am" → "0 9 * * *"
    const timeMatch = input.match(/at\s+(\d{1,2})\s*(am|pm|:)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const period = timeMatch[2].toLowerCase();

      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      const cron = `0 ${hour} * * *`;
      return {
        cron,
        description: `Daily at ${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'} UTC`,
        isValid: true,
      };
    }

    // "every hour" → "0 * * * *"
    if (input.includes('every hour') || input.includes('hourly')) {
      return {
        cron: '0 * * * *',
        description: 'Every hour at the top of the hour',
        isValid: true,
      };
    }

    // "every 30 minutes" → "*/30 * * * *"
    const minMatch = input.match(/every\s+(\d+)\s+minutes?/i);
    if (minMatch) {
      const interval = parseInt(minMatch[1]);
      return {
        cron: `*/${interval} * * * *`,
        description: `Every ${interval} minutes`,
        isValid: true,
      };
    }

    // "daily" → "0 0 * * *"
    if (input.includes('daily')) {
      return {
        cron: '0 0 * * *',
        description: 'Every day at midnight UTC',
        isValid: true,
      };
    }

    // "every morning" → "0 6 * * *"
    if (input.includes('every morning') || input.includes('morning')) {
      return {
        cron: '0 6 * * *',
        description: 'Every morning at 6 AM UTC',
        isValid: true,
      };
    }

    // "every evening" → "0 18 * * *"
    if (input.includes('every evening') || input.includes('evening')) {
      return {
        cron: '0 18 * * *',
        description: 'Every evening at 6 PM UTC',
        isValid: true,
      };
    }

    // "every monday" → "0 0 * * 1"
    const dayMatch = input.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch) {
      const days: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };
      const day = days[dayMatch[1].toLowerCase()];
      return {
        cron: `0 0 * * ${day}`,
        description: `Every ${dayMatch[1]} at midnight UTC`,
        isValid: true,
      };
    }

    // "at 3pm every day" → "0 15 * * *"
    const dayMatch2 = input.match(/at\s+(\d{1,2})(am|pm)?\s+every\s+day/i);
    if (dayMatch2) {
      let hour = parseInt(dayMatch2[1]);
      const period = dayMatch2[2]?.toLowerCase() || 'am';

      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      return {
        cron: `0 ${hour} * * *`,
        description: `Every day at ${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'} UTC`,
        isValid: true,
      };
    }

    logger.warn('SCHEDULER', `Could not parse time expression: ${input}`);
    return {
      cron: '',
      description: 'Invalid time expression',
      isValid: false,
    };
  }

  /**
   * Create scheduled task - Generic for ANY automation
   */
  async createScheduledTask(
    userId: string,
    taskName: string,
    action: string,
    timeExpression: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; taskId?: string; error?: string; message?: string }> {
    try {
      logger.info('SCHEDULER', `Creating scheduled task`, { userId, taskName, action, timeExpression });

      // Parse natural language to cron
      const parsed = this.parseNaturalTime(timeExpression);
      if (!parsed.isValid) {
        logger.warn('SCHEDULER', `Invalid time expression: ${timeExpression}`);
        return {
          success: false,
          error: `Could not understand "${timeExpression}". Try: "at 9am", "every hour", "daily", "every morning"`,
        };
      }

      const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const task: ScheduledTask = {
        id: taskId,
        userId,
        taskName,
        description,
        taskExpression: timeExpression,
        cronExpression: parsed.cron,
        timezone: 'UTC',
        action,
        isActive: true,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store task in KV
      await this.kv.put(
        `scheduled_task:${taskId}`,
        JSON.stringify(task),
        { expirationTtl: 365 * 24 * 60 * 60 } // 1 year
      );

      // Also create user index
      const userKey = `user_tasks:${userId}`;
      const userTasks = await this.kv.get(userKey);
      const taskList = userTasks ? JSON.parse(userTasks) : [];
      taskList.push(taskId);
      await this.kv.put(userKey, JSON.stringify(taskList), {
        expirationTtl: 365 * 24 * 60 * 60,
      });

      logger.info('SCHEDULER', `Task created successfully`, { taskId, cron: parsed.cron });

      return {
        success: true,
        taskId,
        message: `✅ Scheduled: ${parsed.description}\n📌 Task: ${taskName}\n📌 Action: ${action}\n📌 Task ID: ${taskId}\n🔄 Status: Active\n\nHeartbeat will automatically execute this task at the scheduled time.`,
      };
    } catch (error) {
      logger.error('SCHEDULER', 'Error creating scheduled task', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create scheduled task',
      };
    }
  }

  /**
   * List user's scheduled tasks
   */
  async listUserTasks(userId: string): Promise<ScheduledTask[]> {
    try {
      logger.debug('SCHEDULER', `Listing tasks for user: ${userId}`);

      const userKey = `user_tasks:${userId}`;
      const userTasks = await this.kv.get(userKey);

      if (!userTasks) {
        return [];
      }

      const taskIds: string[] = JSON.parse(userTasks);
      const tasks: ScheduledTask[] = [];

      for (const taskId of taskIds) {
        const taskData = await this.kv.get(`scheduled_task:${taskId}`);
        if (taskData) {
          tasks.push(JSON.parse(taskData));
        }
      }

      logger.debug('SCHEDULER', `Found ${tasks.length} tasks for user`);
      return tasks;
    } catch (error) {
      logger.error('SCHEDULER', 'Error listing tasks', error);
      return [];
    }
  }

  /**
   * Delete scheduled task
   */
  async deleteTask(taskId: string, userId: string): Promise<{ success: boolean; message?: string }> {
    try {
      logger.info('SCHEDULER', `Deleting task: ${taskId}`);

      // Delete task
      await this.kv.delete(`scheduled_task:${taskId}`);

      // Remove from user index
      const userKey = `user_tasks:${userId}`;
      const userTasks = await this.kv.get(userKey);
      if (userTasks) {
        const taskList: string[] = JSON.parse(userTasks);
        const filtered = taskList.filter((id) => id !== taskId);
        if (filtered.length > 0) {
          await this.kv.put(userKey, JSON.stringify(filtered));
        } else {
          await this.kv.delete(userKey);
        }
      }

      logger.info('SCHEDULER', `Task deleted: ${taskId}`);
      return {
        success: true,
        message: `✅ Task ${taskId} deleted`,
      };
    } catch (error) {
      logger.error('SCHEDULER', 'Error deleting task', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete task',
      };
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    isActive: boolean
  ): Promise<{ success: boolean; message?: string }> {
    try {
      logger.info('SCHEDULER', `Updating task status: ${taskId}`, { isActive });

      const taskData = await this.kv.get(`scheduled_task:${taskId}`);
      if (!taskData) {
        return { success: false, message: 'Task not found' };
      }

      const task: ScheduledTask = JSON.parse(taskData);
      task.isActive = isActive;
      task.updatedAt = new Date();

      await this.kv.put(`scheduled_task:${taskId}`, JSON.stringify(task));

      logger.info('SCHEDULER', `Task status updated: ${taskId}`);
      return {
        success: true,
        message: `✅ Task ${isActive ? 'activated' : 'deactivated'}`,
      };
    } catch (error) {
      logger.error('SCHEDULER', 'Error updating task status', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update task',
      };
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<ScheduledTask | null> {
    try {
      const taskData = await this.kv.get(`scheduled_task:${taskId}`);
      if (!taskData) {
        return null;
      }
      return JSON.parse(taskData);
    } catch (error) {
      logger.error('SCHEDULER', `Error getting task: ${taskId}`, error);
      return null;
    }
  }

  /**
   * Format task for display
   */
  formatTaskForDisplay(task: ScheduledTask): string {
    let display = `📅 **${task.taskName}**\n`;
    display += `ID: \`${task.id}\`\n`;
    display += `Action: ${task.action}\n`;
    display += `Schedule: \`${task.cronExpression}\`\n`;
    display += `Expression: "${task.taskExpression}"\n`;
    display += `Status: ${task.isActive ? '✅ Active' : '⏸️ Inactive'}\n`;
    display += `Created: ${new Date(task.createdAt).toLocaleString()}\n`;

    if (task.description) {
      display += `Description: ${task.description}\n`;
    }

    if (task.lastRun) {
      display += `Last run: ${new Date(task.lastRun).toLocaleString()}\n`;
    }

    if (task.metadata && Object.keys(task.metadata).length > 0) {
      display += `\nMetadata:\n`;
      Object.entries(task.metadata).forEach(([key, value]) => {
        display += `• ${key}: ${value}\n`;
      });
    }

    return display;
  }

  /**
   * Format all tasks for display
   */
  formatTasksForDisplay(tasks: ScheduledTask[]): string {
    if (tasks.length === 0) {
      return '📭 No scheduled tasks yet\n\nTry: "Send me news at 9am every day" or "Run backup at midnight"';
    }

    let display = `📋 **Your Scheduled Tasks** (${tasks.length})\n\n`;

    tasks.forEach((task, i) => {
      display += `${i + 1}. **${task.taskName}** - ${task.cronExpression}\n`;
      display += `   Action: ${task.action}\n`;
      display += `   Status: ${task.isActive ? '✅' : '⏸️'}\n`;
    });

    display += `\n💡 Say "delete task {id}" to remove a task\n`;
    display += `💡 Say "pause task {id}" to disable it\n`;

    return display;
  }
}

/**
 * KVNamespace type definition (Cloudflare Workers API)
 */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: any): Promise<any>;
}
