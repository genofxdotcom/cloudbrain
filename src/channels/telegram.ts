import TelegramBot from 'node-telegram-bot-api';
import { BaseChannel, IncomingMessage } from './base';
import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';
import { AIProviderManager, PROVIDER_TEMPLATES } from '../ai/providers';

export class TelegramChannel extends BaseChannel {
  name = 'telegram';
  private bot: TelegramBot | null = null;
  private ownerId: string = '';
  private providerManager: AIProviderManager | null = null;

  setProviderManager(manager: AIProviderManager) {
    this.providerManager = manager;
  }

  async isConfigured(): Promise<boolean> {
    const token = await getCredential('TELEGRAM_BOT_TOKEN');
    const owner = await getCredential('TELEGRAM_OWNER_ID');
    return !!(token && owner);
  }

  async start(): Promise<void> {
    const token = await getCredential('TELEGRAM_BOT_TOKEN');
    this.ownerId = (await getCredential('TELEGRAM_OWNER_ID')) || '';

    if (!token || !this.ownerId) {
      log.warn('TELEGRAM', 'Not configured, skipping');
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });

    // Handle callback queries (inline keyboard button presses)
    this.bot.on('callback_query', async (query) => {
      if (!this.bot || !query.data) return;
      const userId = query.from.id.toString();
      if (userId !== this.ownerId) return;

      await this.handleCallbackQuery(query);
    });

    this.bot.on('message', (msg) => {
      const userId = msg.from?.id.toString() || '';
      if (userId !== this.ownerId) return;

      const text = msg.text || '';

      // Handle commands internally
      if (text.startsWith('/models')) {
        this.handleModelsCommand(msg);
        return;
      }
      if (text.startsWith('/provider')) {
        this.handleProviderCommand(msg, text);
        return;
      }

      const incoming: IncomingMessage = {
        id: msg.message_id.toString(),
        userId,
        channel: 'telegram',
        text,
        timestamp: msg.date * 1000,
      };

      if (msg.photo) { incoming.hasMedia = true; incoming.mediaType = 'photo'; }
      else if (msg.voice || msg.audio) { incoming.hasMedia = true; incoming.mediaType = 'audio'; }
      else if (msg.video) { incoming.hasMedia = true; incoming.mediaType = 'video'; }
      else if (msg.document) { incoming.hasMedia = true; incoming.mediaType = 'document'; }

      if (this.messageHandler) this.messageHandler(incoming);
    });

    log.success('TELEGRAM', 'Bot started (polling mode)');
  }

  /**
   * /models - Show providers with buttons, click to see models
   */
  private async handleModelsCommand(msg: TelegramBot.Message) {
    if (!this.bot || !this.providerManager) return;
    const chatId = msg.chat.id;

    const providers = this.providerManager.getAllProviders();
    const active = this.providerManager.getActiveProvider();
    const activeModel = this.providerManager.getActiveModel();

    if (providers.length === 0) {
      await this.bot.sendMessage(chatId,
        '🤖 *No AI providers configured*\n\nUse `/provider <name> <apikey> <baseurl>` to add one.\n\nOr run `cloudbrain setup` on the server.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Status message
    let statusText = '🤖 *AI Providers*\n\n';
    statusText += `Active: *${active?.name || 'none'}*\n`;
    statusText += `Model: \`${activeModel || 'none'}\`\n\n`;
    statusText += 'Select a provider to see its models:';

    // Create provider buttons
    const buttons = providers.map(p => ([{
      text: `${p.isActive ? '✅' : '⚪'} ${p.name}`,
      callback_data: `provider_models:${p.id}`,
    }]));

    // Add "Add Provider" button
    buttons.push([{ text: '➕ Add New Provider', callback_data: 'add_provider' }]);

    await this.bot.sendMessage(chatId, statusText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  /**
   * /provider <name> <apikey> <baseurl> - Add a provider
   * /provider <name> <apikey> - Add a pre-made provider (auto baseurl)
   */
  private async handleProviderCommand(msg: TelegramBot.Message, text: string) {
    if (!this.bot || !this.providerManager) return;
    const chatId = msg.chat.id;

    const parts = text.replace('/provider', '').trim().split(/\s+/);

    if (parts.length < 2 || !parts[0]) {
      // Show help + pre-made provider buttons
      let helpText = '🔧 *Add AI Provider*\n\n';
      helpText += '`/provider <name> <apikey>` — Add a known provider\n';
      helpText += '`/provider <name> <apikey> <baseurl>` — Custom provider\n\n';
      helpText += 'Or tap a provider below:';

      const buttons = Object.entries(PROVIDER_TEMPLATES).map(([id, tmpl]) => ([{
        text: `⚡ ${tmpl.name}`,
        callback_data: `setup_provider:${id}`,
      }]));
      buttons.push([{ text: '🔧 Custom (OpenAI-compatible)', callback_data: 'setup_provider:custom' }]);

      await this.bot.sendMessage(chatId, helpText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    const [name, apiKey, baseUrl] = parts;
    const nameLower = name.toLowerCase();

    // Check if it's a known provider
    const template = PROVIDER_TEMPLATES[nameLower];
    if (template && apiKey) {
      await this.providerManager.addProvider(nameLower, template.name, template.baseUrl, apiKey, template.models);
      await this.bot.sendMessage(chatId,
        `✅ *${template.name}* added!\n\nModels: ${template.models.slice(0, 3).map(m => `\`${m}\``).join(', ')}...\n\nUse /models to switch.`,
        { parse_mode: 'Markdown' }
      );
    } else if (apiKey && baseUrl) {
      // Custom provider
      const id = nameLower.replace(/[^a-z0-9]/g, '_');
      await this.providerManager.addProvider(id, name, baseUrl, apiKey, ['default']);
      await this.bot.sendMessage(chatId,
        `✅ Custom provider *${name}* added!\n\nBase URL: \`${baseUrl}\`\nUse /models to manage.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await this.bot.sendMessage(chatId,
        '❌ Invalid format.\n\nUsage:\n`/provider openai sk-xxx`\n`/provider custom sk-xxx https://api.example.com/v1`',
        { parse_mode: 'Markdown' }
      );
    }
  }

  /**
   * Handle inline keyboard button presses
   */
  private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
    if (!this.bot || !this.providerManager || !query.data || !query.message) return;
    const chatId = query.message.chat.id;
    const data = query.data;

    // Acknowledge the button press
    await this.bot.answerCallbackQuery(query.id);

    // Provider models list
    if (data.startsWith('provider_models:')) {
      const providerId = data.replace('provider_models:', '');
      const providers = this.providerManager.getAllProviders();
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;

      const activeModel = this.providerManager.getActiveModel();
      let text = `🤖 *${provider.name}* models:\n\n`;

      const buttons = provider.models.map(model => ([{
        text: `${model === activeModel ? '✅' : '⚪'} ${model}`,
        callback_data: `switch_model:${providerId}:${model}`,
      }]));

      // Add "Switch to this provider" button if not active
      if (!provider.isActive) {
        buttons.push([{ text: `🔄 Switch to ${provider.name}`, callback_data: `switch_provider:${providerId}` }]);
      }

      // Add "Remove" button
      buttons.push([{ text: `🗑 Remove ${provider.name}`, callback_data: `remove_provider:${providerId}` }]);
      buttons.push([{ text: '← Back to providers', callback_data: 'back_providers' }]);

      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // Switch model
    if (data.startsWith('switch_model:')) {
      const [, providerId, model] = data.split(':');
      // First switch provider if needed
      const provider = this.providerManager.getAllProviders().find(p => p.id === providerId);
      if (provider && !provider.isActive) {
        await this.providerManager.switchProvider(providerId);
      }
      await this.providerManager.switchModel(model);
      await this.bot.answerCallbackQuery(query.id, { text: `Switched to ${model}` });

      // Refresh the model list
      const fakeQuery = { ...query, data: `provider_models:${providerId}` };
      await this.handleCallbackQuery(fakeQuery);
    }

    // Switch provider
    if (data.startsWith('switch_provider:')) {
      const providerId = data.replace('switch_provider:', '');
      await this.providerManager.switchProvider(providerId);
      const provider = this.providerManager.getAllProviders().find(p => p.id === providerId);
      await this.bot.sendMessage(chatId,
        `✅ Switched to *${provider?.name}*\nModel: \`${this.providerManager.getActiveModel()}\``,
        { parse_mode: 'Markdown' }
      );
    }

    // Remove provider
    if (data.startsWith('remove_provider:')) {
      const providerId = data.replace('remove_provider:', '');
      const provider = this.providerManager.getAllProviders().find(p => p.id === providerId);
      await this.providerManager.removeProvider(providerId);
      await this.bot.editMessageText(`🗑 *${provider?.name}* removed.`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
      });
    }

    // Back to providers list
    if (data === 'back_providers') {
      const providers = this.providerManager.getAllProviders();
      const active = this.providerManager.getActiveProvider();
      const activeModel = this.providerManager.getActiveModel();

      let statusText = '🤖 *AI Providers*\n\n';
      statusText += `Active: *${active?.name || 'none'}*\n`;
      statusText += `Model: \`${activeModel || 'none'}\`\n\n`;
      statusText += 'Select a provider to see its models:';

      const buttons = providers.map(p => ([{
        text: `${p.isActive ? '✅' : '⚪'} ${p.name}`,
        callback_data: `provider_models:${p.id}`,
      }]));
      buttons.push([{ text: '➕ Add New Provider', callback_data: 'add_provider' }]);

      await this.bot.editMessageText(statusText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // Add provider (show template list)
    if (data === 'add_provider') {
      let text = '➕ *Add AI Provider*\n\nSelect a provider or use:\n`/provider <name> <apikey>`';
      const buttons = Object.entries(PROVIDER_TEMPLATES).map(([id, tmpl]) => ([{
        text: `⚡ ${tmpl.name}`,
        callback_data: `setup_provider:${id}`,
      }]));
      buttons.push([{ text: '← Back', callback_data: 'back_providers' }]);

      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      });
    }

    // Setup provider instructions
    if (data.startsWith('setup_provider:')) {
      const templateId = data.replace('setup_provider:', '');
      const template = PROVIDER_TEMPLATES[templateId];

      if (template) {
        await this.bot.editMessageText(
          `⚡ *${template.name}*\n\nSend this command with your API key:\n\n\`/provider ${templateId} YOUR_API_KEY\`\n\nModels: ${template.models.slice(0, 4).map(m => `\`${m}\``).join(', ')}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
          }
        );
      } else {
        await this.bot.editMessageText(
          `🔧 *Custom Provider*\n\nSend:\n\`/provider NAME API_KEY BASE_URL\`\n\nExample:\n\`/provider myai sk-xxx https://api.myai.com/v1\``,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
          }
        );
      }
    }
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stopPolling();
      this.bot = null;
    }
  }

  async sendMessage(userId: string, text: string): Promise<boolean> {
    if (!this.bot) return false;
    try {
      await this.bot.sendMessage(parseInt(userId), text, { parse_mode: 'Markdown' });
      return true;
    } catch (error: any) {
      try {
        await this.bot.sendMessage(parseInt(userId), text);
        return true;
      } catch {
        log.error('TELEGRAM', `Send failed: ${error.message}`);
        return false;
      }
    }
  }

  async sendMedia(userId: string, media: { type: string; url?: string; buffer?: Buffer; caption?: string }): Promise<boolean> {
    if (!this.bot) return false;
    try {
      const chatId = parseInt(userId);
      const opts: any = { caption: media.caption };

      if (media.type === 'photo' && media.url) await this.bot.sendPhoto(chatId, media.url, opts);
      else if (media.type === 'audio' && media.url) await this.bot.sendAudio(chatId, media.url, opts);
      else if (media.type === 'video' && media.url) await this.bot.sendVideo(chatId, media.url, opts);
      else if (media.type === 'document' && (media.url || media.buffer)) await this.bot.sendDocument(chatId, media.url || media.buffer!, opts);
      return true;
    } catch (error: any) {
      log.error('TELEGRAM', `Send media failed: ${error.message}`);
      return false;
    }
  }
}
