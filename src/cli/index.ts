#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { BANNER, VERSION } from '../utils/constants';

const o = chalk.hex('#FF8C00');
const program = new Command();

program
  .name('cloudbrain')
  .description(o('Multi-agent AI system powered by Cloudflare'))
  .version(VERSION)
  .hook('preAction', () => {
    console.log(BANNER);
    console.log(o(`  v${VERSION}`) + chalk.gray(' | VPS-hosted AI Agent | Wrangler-powered\n'));
  });

program
  .command('setup')
  .description('Interactive credential & infrastructure setup')
  .action(async () => {
    const { setupCommand } = await import('./setup');
    await setupCommand();
  });

program
  .command('start')
  .description('Start CloudBrain agent daemon')
  .action(async () => {
    const { startAgent } = await import('../index');
    await startAgent();
  });

program
  .command('status')
  .description('Show system status')
  .action(async () => {
    const { statusCommand } = await import('./status');
    await statusCommand();
  });

program
  .command('shell')
  .alias('sh')
  .description('Open interactive shell')
  .action(async () => {
    const { shellCommand } = await import('./shell');
    await shellCommand();
  });

program
  .command('logs')
  .description('Stream recent logs')
  .option('-n, --lines <number>', 'Lines to show', '50')
  .action(async (opts) => {
    const { streamLogs } = await import('./logs');
    await streamLogs(parseInt(opts.lines));
  });

program
  .command('channels')
  .description('Manage communication channels')
  .action(async () => {
    const { manageChannels } = await import('./setup');
    await manageChannels();
  });

program
  .command('tasks')
  .description('Show scheduled heartbeat tasks')
  .action(async () => {
    const { showTasks } = await import('./tasks');
    await showTasks();
  });

program
  .command('deploy [name]')
  .description('Deploy a worker')
  .action(async (name) => {
    const { deployWorker } = await import('./deploy');
    await deployWorker(name || 'cloudbrain');
  });

// No command = open shell
if (process.argv.length <= 2) {
  console.log(BANNER);
  console.log(o(`  v${VERSION}`) + chalk.gray(' | VPS-hosted AI Agent | Wrangler-powered\n'));
  import('./shell').then(m => m.shellCommand());
} else {
  program.parse(process.argv);
}
