import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_FILE = path.join(os.homedir(), '.cloudbrain', 'cloudbrain.log');

export async function streamLogs(lines: number = 50, follow?: boolean): Promise<void> {
  if (!fs.existsSync(LOG_FILE)) {
    console.log(chalk.gray('  No log file yet. Start the agent with "cloudbrain start" first.\n'));
    return;
  }

  // Read last N lines
  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  const allLines = content.split('\n').filter(l => l.trim());
  const lastLines = allLines.slice(-lines);

  for (const line of lastLines) {
    console.log(`  ${line}`);
  }

  if (follow) {
    console.log(chalk.gray('\n  --- Following log output (Ctrl+C to stop) ---\n'));
    let lastSize = fs.statSync(LOG_FILE).size;

    const interval = setInterval(() => {
      try {
        const stat = fs.statSync(LOG_FILE);
        if (stat.size > lastSize) {
          const fd = fs.openSync(LOG_FILE, 'r');
          const buf = Buffer.alloc(stat.size - lastSize);
          fs.readSync(fd, buf, 0, buf.length, lastSize);
          fs.closeSync(fd);
          const newContent = buf.toString('utf-8');
          process.stdout.write(`  ${newContent.replace(/\n/g, '\n  ')}`);
          lastSize = stat.size;
        }
      } catch { /* file may be rotated */ }
    }, 500);

    process.on('SIGINT', () => {
      clearInterval(interval);
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {});
  }

  console.log('');
}
