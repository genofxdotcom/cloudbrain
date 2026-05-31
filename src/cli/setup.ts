import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { initDatabase } from '../db/connection';
import { setCredential, getAllCredentials, deleteCredential, getCredentialsByCategory } from '../db/credentials';
import { AIProviderManager, PROVIDER_TEMPLATES } from '../ai/providers';
import { log } from '../utils/logger';

const o = chalk.hex('#FF8C00'); // Orange shorthand

interface SetupAnswers {
  action: string;
}

export async function setupCommand(): Promise<void> {
  console.log(o('  ┌─────────────────────────────────────────┐'));
  console.log(o('  │        SETUP WIZARD                     │'));
  console.log(o('  │   Configure credentials & services      │'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  // Initialize embedded SQLite database (no server needed)
  const spinner = ora({ text: 'Initializing database...', color: 'yellow' }).start();
  try {
    await initDatabase();
    spinner.succeed(chalk.green('Database ready (SQLite, embedded)'));
  } catch (error: any) {
    spinner.fail(chalk.red(`Database initialization failed: ${error.message}`));
    return;
  }

  // Main setup loop
  let running = true;
  while (running) {
    const { action } = await inquirer.prompt<SetupAnswers>([
      {
        type: 'list',
        name: 'action',
        message: o('What would you like to configure?'),
        choices: [
          { name: `${o('🤖')}  AI providers & models`, value: 'ai' },
          { name: `${o('☁')}  Cloudflare credentials`, value: 'cloudflare' },
          { name: `${o('✈')}  Telegram bot`, value: 'telegram' },
          { name: `${o('🎮')}  Discord bot`, value: 'discord' },
          { name: `${o('💬')}  WhatsApp`, value: 'whatsapp' },
          new inquirer.Separator(),
          { name: `${chalk.cyan('📋')}  View configured credentials`, value: 'view' },
          { name: `${chalk.red('🗑')}   Remove a credential`, value: 'remove' },
          new inquirer.Separator(),
          { name: chalk.gray('  Done - exit setup'), value: 'exit' },
        ],
      },
    ]);

    switch (action) {
      case 'ai':
        await setupAIProvider();
        break;
      case 'cloudflare':
        await setupCloudflare();
        break;
      case 'telegram':
        await setupTelegram();
        break;
      case 'discord':
        await setupDiscord();
        break;
      case 'whatsapp':
        await setupWhatsApp();
        break;
      case 'view':
        await viewCredentials();
        break;
      case 'remove':
        await removeCredential();
        break;
      case 'exit':
        running = false;
        break;
    }
  }

  // Auto-provision Cloudflare infrastructure
  const { autoProvision } = await import('./auto-provision');
  await autoProvision();

  console.log(o('\n  ✓ Setup complete! Run ') + chalk.white('cloudbrain start') + o(' to launch.\n'));
}

async function setupAIProvider() {
  console.log(o('\n  🤖  AI Provider Configuration\n'));

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: o('Select an option:'),
      choices: [
        { name: `${o('⚡')} OpenAI (GPT-4o, GPT-3.5)`, value: 'openai' },
        { name: `${o('⚡')} Anthropic (Claude Sonnet, Haiku, Opus)`, value: 'anthropic' },
        { name: `${o('⚡')} Google Gemini (2.0 Flash, 1.5 Pro)`, value: 'gemini' },
        { name: `${o('⚡')} Groq (Llama 3.3, Mixtral — fast & free tier)`, value: 'groq' },
        { name: `${o('⚡')} Together AI (Llama, Mixtral)`, value: 'together' },
        { name: `${o('⚡')} OpenRouter (multi-provider gateway)`, value: 'openrouter' },
        { name: `${o('⚡')} Cloudflare Workers AI (uses CF credentials)`, value: 'cloudflare' },
        new inquirer.Separator(),
        { name: `${o('🔧')} Custom provider (any OpenAI-compatible API)`, value: 'custom' },
        { name: chalk.gray('  Back'), value: 'back' },
      ],
    },
  ]);

  if (choice === 'back') return;

  const providerManager = new AIProviderManager();
  await providerManager.loadProviders();

  if (choice === 'custom') {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Provider name:' },
      { type: 'input', name: 'baseUrl', message: 'Base URL (e.g. https://api.example.com/v1):' },
      { type: 'password', name: 'apiKey', message: 'API Key:', mask: '*' },
      { type: 'input', name: 'models', message: 'Models (comma-separated, e.g. gpt-4,gpt-3.5):' },
    ]);

    if (answers.name && answers.baseUrl && answers.apiKey) {
      const id = answers.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const models = answers.models.split(',').map((m: string) => m.trim()).filter((m: string) => m);
      await providerManager.addProvider(id, answers.name, answers.baseUrl, answers.apiKey, models);
      console.log(chalk.green(`\n  ✓ Custom provider "${answers.name}" added\n`));
    }
  } else if (choice === 'cloudflare') {
    // Cloudflare uses the existing CF_API_TOKEN
    const template = PROVIDER_TEMPLATES.cloudflare;
    const cfToken = await (await import('../db/credentials')).getCredential('CF_API_TOKEN');
    if (!cfToken) {
      console.log(chalk.yellow('\n  Cloudflare API token not set. Configure Cloudflare first.\n'));
      return;
    }
    await providerManager.addProvider('cloudflare', template.name, template.baseUrl, cfToken, template.models);
    console.log(chalk.green(`\n  ✓ Cloudflare Workers AI added (${template.models.length} models)\n`));
  } else {
    const template = PROVIDER_TEMPLATES[choice];
    if (!template) return;

    console.log(chalk.gray(`\n  ${template.name} — Available models: ${template.models.join(', ')}\n`));

    const answers = await inquirer.prompt([
      { type: 'password', name: 'apiKey', message: `${template.name} API Key:`, mask: '*' },
    ]);

    if (answers.apiKey) {
      await providerManager.addProvider(choice, template.name, template.baseUrl, answers.apiKey, template.models);
      console.log(chalk.green(`\n  ✓ ${template.name} added (${template.models.length} models)\n`));
      console.log(chalk.gray(`  Active model: ${template.models[0]}`));
      console.log(chalk.gray(`  Switch via Telegram: /models\n`));
    }
  }
}

async function setupCloudflare() {
  console.log(o('\n  ☁  Cloudflare Configuration\n'));
  console.log(chalk.gray('  Get your API token from: https://dash.cloudflare.com/profile/api-tokens'));
  console.log(chalk.gray('  Token needs: Workers, KV, D1, R2, Zones permissions\n'));

  const answers = await inquirer.prompt([
    { type: 'input', name: 'accountId', message: 'Account ID:' },
    { type: 'password', name: 'apiToken', message: 'API Token:', mask: '*' },
  ]);

  if (answers.accountId && answers.apiToken) {
    await setCredential('CF_ACCOUNT_ID', answers.accountId, 'cloudflare');
    await setCredential('CF_API_TOKEN', answers.apiToken, 'cloudflare');
    console.log(chalk.green('\n  ✓ Cloudflare credentials saved\n'));
  }
}

async function setupTelegram() {
  console.log(o('\n  ✈  Telegram Bot Configuration\n'));
  console.log(chalk.gray('  Get token from: @BotFather on Telegram'));
  console.log(chalk.gray('  Get your ID from: @userinfobot on Telegram\n'));

  const answers = await inquirer.prompt([
    { type: 'input', name: 'botToken', message: 'Bot Token:' },
    { type: 'input', name: 'ownerId', message: 'Your Telegram User ID:' },
  ]);

  if (answers.botToken && answers.ownerId) {
    await setCredential('TELEGRAM_BOT_TOKEN', answers.botToken, 'telegram');
    await setCredential('TELEGRAM_OWNER_ID', answers.ownerId, 'telegram');
    console.log(chalk.green('\n  ✓ Telegram credentials saved\n'));
  }
}

async function setupDiscord() {
  console.log(o('\n  🎮  Discord Bot Configuration\n'));
  console.log(chalk.gray('  Create app at: https://discord.com/developers/applications\n'));

  const answers = await inquirer.prompt([
    { type: 'input', name: 'botToken', message: 'Bot Token:' },
    { type: 'input', name: 'clientId', message: 'Client/Application ID:' },
  ]);

  if (answers.botToken && answers.clientId) {
    await setCredential('DISCORD_BOT_TOKEN', answers.botToken, 'discord');
    await setCredential('DISCORD_CLIENT_ID', answers.clientId, 'discord');
    console.log(chalk.green('\n  ✓ Discord credentials saved\n'));
  }
}

async function setupWhatsApp() {
  console.log(o('\n  💬  WhatsApp Configuration\n'));
  console.log(chalk.gray('  Set up at: https://developers.facebook.com/docs/whatsapp/cloud-api\n'));

  const answers = await inquirer.prompt([
    { type: 'input', name: 'phoneId', message: 'Phone Number ID:' },
    { type: 'input', name: 'accessToken', message: 'Access Token:' },
    { type: 'input', name: 'verifyToken', message: 'Verify Token (create any string):' },
  ]);

  if (answers.phoneId && answers.accessToken) {
    await setCredential('WHATSAPP_PHONE_NUMBER_ID', answers.phoneId, 'whatsapp');
    await setCredential('WHATSAPP_ACCESS_TOKEN', answers.accessToken, 'whatsapp');
    if (answers.verifyToken) await setCredential('WHATSAPP_VERIFY_TOKEN', answers.verifyToken, 'whatsapp');
    console.log(chalk.green('\n  ✓ WhatsApp credentials saved\n'));
  }
}

async function viewCredentials() {
  const grouped = await getCredentialsByCategory();

  console.log(o('\n  ┌─────────────────────────────────────────┐'));
  console.log(o('  │        CONFIGURED CREDENTIALS           │'));
  console.log(o('  └─────────────────────────────────────────┘\n'));

  if (Object.keys(grouped).length === 0) {
    console.log(chalk.gray('  No credentials configured yet.\n'));
    return;
  }

  for (const [category, creds] of Object.entries(grouped)) {
    console.log(o(`  ${category.toUpperCase()}`));
    for (const cred of creds) {
      const masked = cred.value.substring(0, 4) + '****' + cred.value.substring(cred.value.length - 4);
      console.log(chalk.gray(`    ${cred.key}: ${masked}`));
    }
    console.log('');
  }
}

async function removeCredential() {
  const all = await getAllCredentials();

  if (all.length === 0) {
    console.log(chalk.gray('\n  No credentials to remove.\n'));
    return;
  }

  const { key } = await inquirer.prompt([
    {
      type: 'list',
      name: 'key',
      message: chalk.red('Select credential to remove:'),
      choices: all.map(c => ({
        name: `${c.category} → ${c.key}`,
        value: c.key,
      })),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: `Delete ${key}?`, default: false },
  ]);

  if (confirm) {
    await deleteCredential(key);
    console.log(chalk.red(`\n  ✗ ${key} removed\n`));
  }
}

export async function manageChannels(): Promise<void> {
  console.log(o('  Channel Management\n'));
  const grouped = await getCredentialsByCategory();

  const channels = ['telegram', 'discord', 'whatsapp'];
  for (const ch of channels) {
    const configured = grouped[ch] ? chalk.green('✓ configured') : chalk.gray('✗ not set');
    console.log(`  ${o(ch.padEnd(12))} ${configured}`);
  }

  console.log(chalk.gray('\n  Use "cloudbrain setup" to add or modify channels.\n'));
}
