import chalk from 'chalk';
import ora from 'ora';

const o = chalk.hex('#FF8C00');

export async function deployWorker(name: string): Promise<void> {
  console.log(o(`  Deploying worker: ${name}\n`));

  const spinner = ora({ text: 'Running wrangler deploy...', color: 'yellow' }).start();

  try {
    const { WranglerExecutor } = await import('../wrangler/executor');
    const wrangler = new WranglerExecutor();
    const result = await wrangler.execute('deploy', [name]);

    if (result.success) {
      spinner.succeed(chalk.green(`Worker "${name}" deployed successfully`));
      if (result.output) console.log(chalk.gray(`\n  ${result.output}\n`));
    } else {
      spinner.fail(chalk.red(`Deploy failed: ${result.error}`));
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Deploy error: ${error.message}`));
  }
}
