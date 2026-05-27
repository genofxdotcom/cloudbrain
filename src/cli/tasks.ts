import chalk from 'chalk';
import { query } from '../db/connection';

const o = chalk.hex('#FF8C00');

export async function showTasks(): Promise<void> {
  console.log(o('  ┌─────────────────────────────────────────┐'));
  console.log(o('  │        SCHEDULED TASKS                  │'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  try {
    const rows = await query('SELECT * FROM scheduled_tasks ORDER BY created_at DESC');

    if (rows.length === 0) {
      console.log(chalk.gray('  No scheduled tasks yet.'));
      console.log(chalk.gray('  Create one: "send me news at 9am every day"\n'));
      return;
    }

    for (const task of rows) {
      const status = task.is_active ? chalk.green('●') : chalk.gray('○');
      console.log(`  ${status} ${o(task.task_name)}`);
      console.log(`    Cron: ${task.cron_expression}`);
      console.log(`    Action: ${task.action}`);
      console.log(`    Channel: ${task.channel}`);
      if (task.last_run) console.log(`    Last run: ${new Date(task.last_run).toLocaleString()}`);
      console.log('');
    }
  } catch {
    console.log(chalk.gray('  Database not available. Run "cloudbrain setup" first.\n'));
  }
}
