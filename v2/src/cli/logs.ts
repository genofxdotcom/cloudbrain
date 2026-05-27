import chalk from 'chalk';
import { query } from '../db/connection';

export async function streamLogs(lines: number = 50): Promise<void> {
  try {
    const rows = await query(
      'SELECT * FROM task_log ORDER BY created_at DESC LIMIT ?',
      [lines]
    );

    if (rows.length === 0) {
      console.log(chalk.gray('  No logs yet.\n'));
      return;
    }

    for (const row of rows.reverse()) {
      const status = row.status === 'success' ? chalk.green('✓') :
                     row.status === 'failed' ? chalk.red('✗') :
                     chalk.yellow('●');
      const time = new Date(row.created_at).toLocaleTimeString();
      console.log(`  ${chalk.gray(time)} ${status} ${row.action} ${row.duration_ms ? chalk.gray(`(${row.duration_ms}ms)`) : ''}`);
    }
    console.log('');
  } catch {
    console.log(chalk.gray('  Database not available. Run "cloudbrain setup" first.\n'));
  }
}
