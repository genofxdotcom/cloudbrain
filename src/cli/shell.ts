import chalk from 'chalk';
import readline from 'readline';
import { BANNER } from '../utils/constants';

const o = chalk.hex('#FF8C00');

export async function shellCommand(): Promise<void> {
  console.log(o('  ┌─────────────────────────────────────────┐'));
  console.log(o('  │        INTERACTIVE SHELL                │'));
  console.log(o('  │   Type commands or chat naturally       │'));
  console.log(o('  │   Type "help" for commands, "exit" to quit│'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: o('  cloudbrain > '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input === 'exit' || input === 'quit') {
      console.log(chalk.gray('\n  Goodbye!\n'));
      rl.close();
      process.exit(0);
    }

    if (input === 'help') {
      printHelp();
      rl.prompt();
      return;
    }

    // Process command
    try {
      const response = await processShellInput(input);
      console.log(`\n  ${response}\n`);
    } catch (error: any) {
      console.log(chalk.red(`\n  Error: ${error.message}\n`));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

function printHelp() {
  console.log(o('\n  ┌─ COMMANDS ────────────────────────────────┐'));
  console.log(`  ${o('status')}          Show system status`);
  console.log(`  ${o('workers')}         List deployed workers`);
  console.log(`  ${o('domains')}         List domains`);
  console.log(`  ${o('kv')}              List KV namespaces`);
  console.log(`  ${o('databases')}       List D1 databases`);
  console.log(`  ${o('r2')}              List R2 buckets`);
  console.log(`  ${o('deploy <name>')}   Deploy a worker`);
  console.log(`  ${o('tasks')}           Show scheduled tasks`);
  console.log(`  ${o('search <query>')} Search the web`);
  console.log(`  ${o('logs')}            Show recent logs`);
  console.log(`  ${o('help')}            Show this help`);
  console.log(`  ${o('exit')}            Exit shell`);
  console.log(o('  └─────────────────────────────────────────────┘'));
  console.log(chalk.gray('\n  Or just type naturally - I understand plain language.\n'));
}

async function processShellInput(input: string): Promise<string> {
  const lower = input.toLowerCase();

  if (lower === 'status') {
    return 'System status: Use "cloudbrain status" for full report';
  }
  if (lower === 'workers' || lower === 'list workers') {
    return 'Fetching workers... (wrangler integration)';
  }
  if (lower === 'domains' || lower === 'list domains') {
    return 'Fetching domains... (wrangler integration)';
  }
  if (lower === 'kv' || lower === 'list kv') {
    return 'Fetching KV namespaces... (wrangler integration)';
  }
  if (lower === 'databases' || lower === 'list databases') {
    return 'Fetching D1 databases... (wrangler integration)';
  }
  if (lower === 'r2' || lower === 'list r2') {
    return 'Fetching R2 buckets... (wrangler integration)';
  }
  if (lower === 'tasks' || lower === 'list tasks') {
    return 'No scheduled tasks yet. Set one up with natural language!';
  }
  if (lower.startsWith('search ')) {
    const query = input.substring(7);
    return `Searching for: "${query}"... (web search integration)`;
  }

  // Default: treat as natural language
  return `Processing: "${input}" (AI agent integration)`;
}
