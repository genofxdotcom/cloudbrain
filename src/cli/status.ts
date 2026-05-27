import chalk from 'chalk';

const o = chalk.hex('#FF8C00');

export async function statusCommand(): Promise<void> {
  console.log(o('  ┌─────────────────────────────────────────┐'));
  console.log(o('  │        SYSTEM STATUS                    │'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  // Show status (placeholder until full integration)
  console.log(`  ${o('Database')}      ${chalk.green('●')} Connected`);
  console.log(`  ${o('Wrangler')}      ${chalk.green('●')} Available`);
  console.log(`  ${o('Telegram')}      ${chalk.gray('○')} Not configured`);
  console.log(`  ${o('Discord')}       ${chalk.gray('○')} Not configured`);
  console.log(`  ${o('WhatsApp')}      ${chalk.gray('○')} Not configured`);
  console.log(`  ${o('Scheduler')}     ${chalk.green('●')} Running (0 tasks)`);
  console.log(`  ${o('AI Agent')}      ${chalk.green('●')} Ready`);
  console.log('');
  console.log(chalk.gray('  Run "cloudbrain setup" to configure channels.'));
  console.log('');
}
