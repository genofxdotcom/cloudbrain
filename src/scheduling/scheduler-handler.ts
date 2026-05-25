/**
 * Scheduler Handler - Process scheduled tasks and deliver results
 * Generic handler for ANY type of scheduled automation
 * Works with Heartbeat Scheduler to execute tasks at specified times
 */

import { HeartbeatScheduler, ScheduledTask } from './heartbeat-scheduler';
import { ChannelManager } from '../channels/manager';

export interface ScheduledTaskExecution {
  taskId: string;
  userId: string;
  taskType: string;
  executedAt: Date;
  success: boolean;
  result?: string;
  error?: string;
  durationMs?: number;
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
 * SchedulerHandler - Execute scheduled tasks
 */
export class SchedulerHandler {
  private scheduler: HeartbeatScheduler;
  private channelManager: ChannelManager;
  private kv: KVNamespace;

  constructor(scheduler: HeartbeatScheduler, channelManager: ChannelManager, kv: KVNamespace) {
    this.scheduler = scheduler;
    this.channelManager = channelManager;
    this.kv = kv;
    logger.info('HANDLER', 'Scheduler Handler initialized');
  }

  /**
   * Execute a scheduled task
   */
  async executeTask(task: ScheduledTask): Promise<ScheduledTaskExecution> {
    const startTime = Date.now();
    const execution: ScheduledTaskExecution = {
      taskId: task.id,
      userId: task.userId,
      taskType: task.taskName,
      executedAt: new Date(),
      success: false,
    };

    try {
      logger.info('HANDLER', `Executing task: ${task.id}`, { name: task.taskName, action: task.action });

      let result: string = '';

      // Generic execution - AI will handle the action
      result = await this.executeGenericTask(task);

      // Send result to user
      if (result && task.metadata.userId) {
        await this.deliverResult(task, result);
      }

      execution.success = true;
      execution.result = result;
      execution.durationMs = Date.now() - startTime;

      logger.info('HANDLER', `Task executed successfully: ${task.id}`, { duration: execution.durationMs });

      // Update task's last run time
      task.lastRun = new Date();
      await this.kv.put(`scheduled_task:${task.id}`, JSON.stringify(task));

      return execution;
    } catch (error) {
      execution.success = false;
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      execution.durationMs = Date.now() - startTime;

      logger.error('HANDLER', `Task execution failed: ${task.id}`, error);

      return execution;
    }
  }

  /**
   * Execute generic task - AI handles the action
   */
  private async executeGenericTask(task: ScheduledTask): Promise<string> {
    logger.debug('HANDLER', 'Executing generic task', { action: task.action });

    // Task execution message to be sent to AI or handled by system
    let result = `⚡ **HEARTBEAT ACTIVATED**\n`;
    result += `Task: ${task.taskName}\n`;
    result += `Action: ${task.action}\n`;
    result += `Executed: ${new Date().toLocaleString()} UTC\n\n`;

    // Store task execution data in metadata for reference
    if (task.metadata.customAction) {
      result += `${task.metadata.customAction}\n`;
    } else {
      // AI will handle this - return action for AI to process
      result += `Please execute: ${task.action}\n`;
      
      if (task.metadata.searchQuery) {
        result += `Search: ${task.metadata.searchQuery}\n`;
      }
      if (task.metadata.automationScript) {
        result += `Script: ${task.metadata.automationScript}\n`;
      }
    }

    return result;
  }

  /**
   * Deliver result to user
   */
  private async deliverResult(task: ScheduledTask, result: string): Promise<boolean> {
    try {
      logger.debug('HANDLER', 'Delivering result to user', { userId: task.userId });

      const userId = task.metadata.userId;
      const channelType = task.metadata.channelType || 'telegram';

      const success = await this.channelManager.sendMessage(channelType, userId, result);

      if (success) {
        logger.info('HANDLER', 'Result delivered successfully', { userId });
      } else {
        logger.warn('HANDLER', 'Failed to deliver result', { userId });
      }

      return success;
    } catch (error) {
      logger.error('HANDLER', 'Error delivering result', error);
      return false;
    }
  }

  /**
   * Get execution history for task
   */
  async getExecutionHistory(taskId: string, limit: number = 10): Promise<ScheduledTaskExecution[]> {
    try {
      const key = `execution_history:${taskId}`;
      const history = await this.kv.get(key);

      if (!history) {
        return [];
      }

      const executions: ScheduledTaskExecution[] = JSON.parse(history);
      return executions.slice(-limit);
    } catch (error) {
      logger.error('HANDLER', 'Error getting execution history', error);
      return [];
    }
  }

  /**
   * Log execution
   */
  async logExecution(execution: ScheduledTaskExecution): Promise<void> {
    try {
      const key = `execution_history:${execution.taskId}`;
      const history = await this.kv.get(key);

      let executions: ScheduledTaskExecution[] = history ? JSON.parse(history) : [];
      executions.push(execution);

      // Keep only last 50 executions
      if (executions.length > 50) {
        executions = executions.slice(-50);
      }

      await this.kv.put(key, JSON.stringify(executions), {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
      });
    } catch (error) {
      logger.error('HANDLER', 'Error logging execution', error);
    }
  }

  /**
   * Format execution for display
   */
  formatExecutionForDisplay(execution: ScheduledTaskExecution): string {
    let display = `⚡ **TASK EXECUTED**\n`;
    display += `ID: \`${execution.taskId}\`\n`;
    display += `Type: ${execution.taskType}\n`;
    display += `Status: ${execution.success ? '✅ Success' : '❌ Failed'}\n`;
    display += `Duration: ${execution.durationMs}ms\n`;

    if (execution.error) {
      display += `Error: ${execution.error}\n`;
    }

    if (execution.result) {
      display += `\n${execution.result}`;
    }

    return display;
  }
}

/**
 * KVNamespace type definition
 */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: any): Promise<void>;
  delete(key: string): Promise<void>;
}
