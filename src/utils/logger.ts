import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function timestamp(): string {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

export const log = {
  debug: (tag: string, msg: string, data?: any) => {
    if (currentLevel <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[${timestamp()}] [DBG] [${tag}] ${msg}`), data || '');
    }
  },
  info: (tag: string, msg: string, data?: any) => {
    if (currentLevel <= LogLevel.INFO) {
      console.log(chalk.hex('#FF8C00')(`[${timestamp()}]`) + chalk.white(` [${tag}] ${msg}`), data || '');
    }
  },
  warn: (tag: string, msg: string, data?: any) => {
    if (currentLevel <= LogLevel.WARN) {
      console.log(chalk.yellow(`[${timestamp()}] [WRN] [${tag}] ${msg}`), data || '');
    }
  },
  error: (tag: string, msg: string, data?: any) => {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(chalk.red(`[${timestamp()}] [ERR] [${tag}] ${msg}`), data || '');
    }
  },
  success: (tag: string, msg: string) => {
    console.log(chalk.green(`[${timestamp()}] [OK]  [${tag}] ${msg}`));
  },
};
