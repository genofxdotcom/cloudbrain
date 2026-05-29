import chalk from 'chalk';
import { getDaemonInfo } from './daemon';

const o = chalk.hex('#FF8C00');

export async function statusCommand(): Promise<void> {
  console.log(o('  ┌─────────────────────────────────────────┐'));
  console.log(o('  │        SYSTEM STATUS                    │'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  const daemon = getDaemonInfo();

  const daemonStatus = daemon.running
    ? chalk.green(`● Running (PID: ${daemon.pid})`)
    : chalk.red('○ Stopped');

  console.log(`  ${o('Daemon')}        ${daemonStatus}`);
  console.log(`  ${o('Log file')}      ${chalk.gray(daemon.logFile)}`);
  console.log(`  ${o('Database')}      ${chalk.green('● Embedded SQLite')}`);
  console.log(`  ${o('Search')}        ${chalk.green('● Built-in (DuckDuckGo)')}`);
  console.log('');

  if (!daemon.running) {
    console.log(chalk.gray('  Run "cloudbrain start" to launch the agent daemon.'));
  } else {
    console.log(chalk.gray('  Run "cloudbrain stop" to stop, "cloudbrain logs -f" to watch output.'));
  }
  console.log('');
}
