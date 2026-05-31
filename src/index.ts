import dotenv from 'dotenv';
dotenv.config();

import { initDatabase } from './db/connection';
import { ChannelManager } from './channels/manager';
import { WranglerExecutor } from './wrangler/executor';
import { PlannerAgent } from './agents/planner';
import { ExecutorAgent } from './agents/executor';
import { SkillRegistry } from './agents/skills';
import { WorkersAI } from './ai/worker-ai';
import { WebSearch } from './search/web';
import { HeartbeatScheduler } from './scheduler/cron';
import { ContextManager } from './context/manager';
import { IncomingMessage } from './channels/base';
import { PermissionManager } from './agents/permissions';
import { log } from './utils/logger';
import { BANNER, VERSION } from './utils/constants';
import chalk from 'chalk';

/**
 * CloudBrain 2.0 - Main Agent Process
 */
export async function startAgent(): Promise<void> {
  console.log(BANNER);
  console.log(chalk.hex('#FF8C00')(`  v${VERSION}`) + chalk.gray(' | Starting agent...\n'));

  // 1. Database (embedded SQLite - no external server needed)
  await initDatabase();

  // 2. Core services
  const wrangler = new WranglerExecutor();
  const ai = new WorkersAI();
  await ai.init();
  const search = new WebSearch();
  const context = new ContextManager();
  const channels = new ChannelManager();
  await channels.initialize();

  // Give Telegram access to provider manager for /models and /provider commands
  const { TelegramChannel } = await import('./channels/telegram');
  const telegramCh = channels.getChannel('telegram');
  if (telegramCh && telegramCh instanceof TelegramChannel) {
    telegramCh.setProviderManager(ai.getProviderManager());
  }

  // 3. Scheduler
  const scheduler = new HeartbeatScheduler(channels);
  scheduler.setExecutor(async (action, userId, channel) => {
    // When a scheduled task fires, route it through the AI
    return ai.chat(`Execute this scheduled task: ${action}`);
  });
  await scheduler.loadFromDB();

  // 4. Multi-agent skill system
  const skills = new SkillRegistry(wrangler, search, scheduler);
  const planner = new PlannerAgent();
  const executor = new ExecutorAgent(skills, channels);
  const permissions = new PermissionManager(channels);

  // Wire up executor handlers
  executor.setAIHandler(async (prompt, sys) => {
    return ai.chat(prompt, sys);
  });
  executor.setSearchHandler((q) => search.search(q));
  executor.setScheduleHandler(async (userId, channel, params) => {
    const cronExpr = scheduler.parseTime(params.timeExpression);
    if (!cronExpr) return `Could not parse time: "${params.timeExpression}". Try "at 9am", "every hour", "daily".`;
    return scheduler.create(userId, channel, params.taskName, params.action, cronExpr);
  });

  // 5. Start channels
  const active = await channels.startAll();

  // 6. Message handler - the brain
  channels.onMessage(async (message: IncomingMessage) => {
    log.info('MSG', `[${message.channel}] ${message.userId}: ${message.text.substring(0, 60)}`);

    try {
      // Check if this is a pending approval response
      const wasApproval = await permissions.handleApprovalResponse(message.userId, message.text);
      if (wasApproval) return; // Consumed by permission system

      // Store user message in context (also triggers auto-learning)
      await context.addMessage(message.userId, message.channel, 'user', message.text);

      // Build context for AI (memories, facts, history)
      const userContext = await context.buildContext(message.userId, message.channel);

      // Set up AI handler with user context for this message
      executor.setAIHandler(async (prompt, sys) => {
        const systemWithContext = [
          sys || 'You are CloudBrain, a powerful AI assistant. Be direct and action-oriented. Execute tasks, don\'t just talk about them.',
          '',
          userContext,
        ].join('\n');
        return ai.chat(prompt, systemWithContext);
      });

      // Plan the execution
      const plan = planner.createPlan(message);

      // Check permissions for destructive operations
      for (const task of plan.tasks) {
        if (permissions.isDestructive(task.params?.command || task.action)) {
          const approved = await permissions.checkPermission({
            userId: message.userId,
            channel: message.channel,
            operation: task.params?.command || task.action,
            description: `"${task.action}" — this may modify or delete resources.`,
          });
          if (!approved) {
            await channels.send(message.channel, message.userId, 'Skipped.');
            return;
          }
        }
      }

      // Execute plan
      const response = await executor.executePlan(plan, message);

      // Send final response
      if (response) {
        await channels.send(message.channel, message.userId, response);
      }

      // Store assistant response in context
      if (response) await context.addMessage(message.userId, message.channel, 'assistant', response);

    } catch (error: any) {
      log.error('AGENT', `Processing error: ${error.message}`);
      await channels.send(message.channel, message.userId, `Something went wrong: ${error.message}`);
    }
  });

  // 7. Graceful shutdown
  process.on('SIGINT', async () => {
    log.info('AGENT', 'Shutting down...');
    scheduler.stopAll();
    await channels.stopAll();
    process.exit(0);
  });

  log.success('AGENT', `CloudBrain 2.0 running | Channels: ${active.join(', ') || 'none (use "cloudbrain setup")'}`);
  log.info('AGENT', 'Waiting for messages... (Ctrl+C to stop)');
}

// If run directly (not imported by CLI)
if (require.main === module) {
  startAgent().catch((err) => {
    log.error('FATAL', err.message);
    process.exit(1);
  });
}
