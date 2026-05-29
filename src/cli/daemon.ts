import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const o = chalk.hex('#FF8C00');
const CLOUDBRAIN_DIR = path.join(os.homedir(), '.cloudbrain');
const PID_FILE = path.join(CLOUDBRAIN_DIR, 'cloudbrain.pid');
const LOG_FILE = path.join(CLOUDBRAIN_DIR, 'cloudbrain.log');

function ensureDir() {
  if (!fs.existsSync(CLOUDBRAIN_DIR)) {
    fs.mkdirSync(CLOUDBRAIN_DIR, { recursive: true });
  }
}

/**
 * Start CloudBrain as a background daemon that survives terminal close
 */
export async function startDaemon(): Promise<void> {
  ensureDir();

  // Check if already running
  if (isRunning()) {
    const pid = fs.readFileSync(PID_FILE, 'utf-8').trim();
    console.log(o(`  CloudBrain is already running (PID: ${pid})`));
    console.log(chalk.gray(`  Use "cloudbrain stop" to stop it, or "cloudbrain restart" to restart.`));
    return;
  }

  // Find the entry point
  const entryPoint = path.resolve(__dirname, '../index.js');
  if (!fs.existsSync(entryPoint)) {
    console.log(chalk.red('  Error: dist/index.js not found. Run "npm run build" first.'));
    return;
  }

  // Open log file for stdout/stderr
  const logFd = fs.openSync(LOG_FILE, 'a');

  // Spawn detached process
  const child = spawn(process.execPath, [entryPoint], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, CLOUDBRAIN_DAEMON: '1' },
    cwd: process.cwd(),
  });

  // Write PID
  if (child.pid) {
    fs.writeFileSync(PID_FILE, child.pid.toString());
    child.unref(); // Allow parent to exit

    console.log(o('  ┌─────────────────────────────────────────┐'));
    console.log(o('  │   CloudBrain daemon started             │'));
    console.log(o('  └─────────────────────────────────────────┘\n'));
    console.log(`  ${o('PID:')}      ${child.pid}`);
    console.log(`  ${o('Log:')}      ${LOG_FILE}`);
    console.log(`  ${o('DB:')}       ${path.join(CLOUDBRAIN_DIR, 'cloudbrain.db')}`);
    console.log('');
    console.log(chalk.gray('  The agent will run in the background until the machine shuts down.'));
    console.log(chalk.gray('  Use "cloudbrain stop" to stop, "cloudbrain logs" to view output.'));
    console.log(chalk.gray('  Use "cloudbrain status" to check if it\'s alive.\n'));
  } else {
    console.log(chalk.red('  Failed to start daemon.'));
  }

  fs.closeSync(logFd);
}

/**
 * Stop the running daemon
 */
export async function stopDaemon(): Promise<void> {
  if (!isRunning()) {
    console.log(chalk.gray('  CloudBrain is not running.'));
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());

  try {
    process.kill(pid, 'SIGINT'); // Graceful shutdown
    console.log(o(`  CloudBrain stopped (PID: ${pid})`));

    // Wait a moment then clean up
    await new Promise(r => setTimeout(r, 1000));
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      // Process already dead
      console.log(chalk.gray('  CloudBrain was not running (stale PID file removed).'));
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } else {
      console.log(chalk.red(`  Failed to stop: ${err.message}`));
    }
  }
}

/**
 * Restart the daemon
 */
export async function restartDaemon(): Promise<void> {
  await stopDaemon();
  await new Promise(r => setTimeout(r, 500));
  await startDaemon();
}

/**
 * Check if daemon is running
 */
export function isRunning(): boolean {
  if (!fs.existsSync(PID_FILE)) return false;

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  try {
    process.kill(pid, 0); // Signal 0 = just check if alive
    return true;
  } catch {
    // Process doesn't exist, clean up stale PID
    fs.unlinkSync(PID_FILE);
    return false;
  }
}

/**
 * Get daemon info
 */
export function getDaemonInfo(): { running: boolean; pid?: number; logFile: string; uptime?: string } {
  const running = isRunning();
  const info: any = { running, logFile: LOG_FILE };

  if (running) {
    info.pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  }

  return info;
}
