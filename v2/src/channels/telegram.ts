import TelegramBot from 'node-telegram-bot-api';
import { BaseChannel, IncomingMessage } from './base';
import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';

export class TelegramChannel extends BaseChannel {
  name = 'telegram';
  private bot: TelegramBot | null = null;
  private ownerId: string = '';

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

    this.bot.on('message', (msg) => {
      const userId = msg.from?.id.toString() || '';

      // Only accept messages from owner
      if (userId !== this.ownerId) return;

      const incoming: IncomingMessage = {
        id: msg.message_id.toString(),
        userId,
        channel: 'telegram',
        text: msg.text || '',
        timestamp: msg.date * 1000,
      };

      // Handle media
      if (msg.photo) {
        incoming.hasMedia = true;
        incoming.mediaType = 'photo';
      } else if (msg.voice || msg.audio) {
        incoming.hasMedia = true;
        incoming.mediaType = 'audio';
      } else if (msg.video) {
        incoming.hasMedia = true;
        incoming.mediaType = 'video';
      } else if (msg.document) {
        incoming.hasMedia = true;
        incoming.mediaType = 'document';
      }

      if (this.messageHandler) {
        this.messageHandler(incoming);
      }
    });

    log.success('TELEGRAM', 'Bot started (polling mode)');
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
      // Retry without markdown if it fails
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

      if (media.type === 'photo' && media.url) {
        await this.bot.sendPhoto(chatId, media.url, opts);
      } else if (media.type === 'audio' && media.url) {
        await this.bot.sendAudio(chatId, media.url, opts);
      } else if (media.type === 'video' && media.url) {
        await this.bot.sendVideo(chatId, media.url, opts);
      } else if (media.type === 'document' && (media.url || media.buffer)) {
        await this.bot.sendDocument(chatId, media.url || media.buffer!, opts);
      }
      return true;
    } catch (error: any) {
      log.error('TELEGRAM', `Send media failed: ${error.message}`);
      return false;
    }
  }
}
