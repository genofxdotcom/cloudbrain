#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { BANNER, VERSION } from '../utils/constants';
import { setupCommand } from './setup';
import { shellCommand } from './shell';
import { statusCommand } from './status';

const program = new Command();

program
  .name('cloudbrain')
  .description(chalk.hex('#FF8C00')('Multi-agent AI system powered by Cloudflare'))
  .version(VERSION)
  .hook('preAction', () => {
    console.log(BANNER);
    console.log(chalk.hex('#FF8C00')(`  v${VERSION}`) + chalk.gray(' | VPS-hosted AI Agent | Wrangler-powered\n'));
  });

program
  .command('setup')
  .description('Interactive credential setup wizard')
  .action(setupCommand);

program
  .command('status')
  .description('Show system status, connections, and active tasks')
  .action(statusCommand);

program
  .command('shell')
  .alias('sh')
  .description('Open interactive CloudBrain shell')
  .action(shellCommand);

program
  .command('start')
  .description('Start CloudBrain agent (daemon mode)')
  .action(async () => {
    const { startAgent } = await import('../index');
    await startAgent();
  });

program
  .command('logs')
  .description('Stream real-time logs')
  .option('-n, --lines <number>', 'Number of recent lines', '50')
  .action(async (opts) => {
    console.log(chalk.hex('#FF8C00')('  Streaming logs... (Ctrl+C to stop)\n'));
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
  .command('deploy <name>')
  .description('Deploy a worker to Cloudflare')
  .action(async (name) => {
    const { deployWorker } = await import('./deploy');
    await deployWorker(name);
  });

// Default: if no command, open shell
program.action(shellCommand);

program.parse(process.argv);
