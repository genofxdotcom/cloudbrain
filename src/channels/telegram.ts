/**
 * Telegram channel implementation
 */

import { TelegramBot } from '@codebam/cf-workers-telegram-bot';
import { BaseChannel, ChannelMessage, ChannelResponse } from './base';

const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [INFO] [${tag}] ${message}`, data || '');
  },
  error: (tag: string, message: string, error?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] [${tag}] ${message}`, error || '');
  },
  warn: (tag: string, message: string, data?: any) => {
    console.warn(`[${new Date().toISOString()}] [WARN] [${tag}] ${message}`, data || '');
  },
  debug: (tag: string, message: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] [DEBUG] [${tag}] ${message}`, data || '');
  },
};

export class TelegramChannel extends BaseChannel {
  private bot: TelegramBot | null = null;
  private token: string = '';
  private ownerId: string = '';

  constructor() {
    super('telegram');
    logger.debug('TELEGRAM', 'TelegramChannel instance created');
  }

  async initialize(credentials: Record<string, string>): Promise<void> {
    logger.info('TELEGRAM', 'Initializing Telegram channel');

    this.token = credentials.TELEGRAM_BOT_TOKEN || '';
    this.ownerId = credentials.TELEGRAM_OWNER_ID || '';

    if (!this.token) {
      logger.error('TELEGRAM', 'Missing TELEGRAM_BOT_TOKEN');
      this.isActive = false;
      return;
    }

    if (!this.ownerId) {
      logger.error('TELEGRAM', 'Missing TELEGRAM_OWNER_ID');
      this.isActive = false;
      return;
    }

    try {
      logger.debug('TELEGRAM', 'Creating TelegramBot instance');
      this.bot = new TelegramBot(this.token);
      this.isActive = true;
      logger.info('TELEGRAM', 'Telegram channel initialized successfully');
    } catch (error) {
      logger.error('TELEGRAM', 'Failed to initialize Telegram channel', error);
      this.isActive = false;
    }
  }

  async isConfigured(): Promise<boolean> {
    const configured = this.isActive && !!this.bot && !!this.token && !!this.ownerId;
    logger.debug('TELEGRAM', 'Configuration check', { configured });
    return configured;
  }

  async handleMessage(payload: any): Promise<ChannelMessage | null> {
    try {
      logger.debug('TELEGRAM', 'Handling incoming message payload', { 
        hasMessage: !!payload.message,
        payloadKeys: Object.keys(payload)
      });

      const update = payload;

      if (!update.message) {
        logger.debug('TELEGRAM', 'No message in payload, checking update type', {
          updateId: update.update_id,
          hasCallbackQuery: !!update.callback_query,
          hasEditedMessage: !!update.edited_message,
        });
        return null;
      }

      const message = update.message;
      const userId = message.from.id.toString();
      const text = message.text || '';

      logger.debug('TELEGRAM', 'Message received', {
        userId,
        messageId: message.message_id,
        textLength: text.length,
        hasText: !!text,
        hasChatId: !!message.chat?.id,
        senderName: message.from.first_name,
      });

      // Only process messages from owner
      if (userId !== this.ownerId) {
        logger.warn('TELEGRAM', 'Message from unauthorized user', { 
          userId, 
          ownerId: this.ownerId,
          firstName: message.from.first_name
        });
        return null;
      }

      if (!text) {
        logger.debug('TELEGRAM', 'Message has no text content, skipping', { userId, messageId: message.message_id });
        return null;
      }

      logger.info('TELEGRAM', 'Valid message from owner', { userId, messageId: message.message_id, textLength: text.length });

      return {
        id: message.message_id.toString(),
        channelType: 'telegram',
        userId,
        text,
        timestamp: message.date * 1000,
        metadata: {
          chatId: message.chat.id,
          firstName: message.from.first_name,
          lastName: message.from.last_name,
        },
      };
    } catch (error) {
      logger.error('TELEGRAM', 'Error handling Telegram message', error);
      return null;
    }
  }

  async sendMessage(userId: string, text: string): Promise<ChannelResponse> {
    if (!this.token) {
      logger.error('TELEGRAM', 'Telegram token not available');
      return { success: false, error: 'Telegram token not available' };
    }

    try {
      logger.debug('TELEGRAM', 'Sending message', { userId, textLength: text.length });

      // Use direct Telegram Bot API call via fetch
      // This is more reliable than using the library's internal methods
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: parseInt(userId),
          text: text,
        }),
      });

      const result = await response.json();

      if (result.ok && result.result?.message_id) {
        logger.info('TELEGRAM', 'Message sent successfully', {
          userId,
          messageId: result.result.message_id,
        });
        return {
          success: true,
          messageId: result.result.message_id?.toString(),
        };
      } else {
        logger.error('TELEGRAM', 'Invalid response from Telegram API', { result });
        return {
          success: false,
          error: result.description || 'Invalid response from Telegram API',
        };
      }
    } catch (error) {
      logger.error('TELEGRAM', 'Error sending Telegram message', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendFile(userId: string, fileUrl: string, caption?: string): Promise<ChannelResponse> {
    if (!this.token) {
      logger.error('TELEGRAM', 'Telegram token not available');
      return { success: false, error: 'Telegram token not available' };
    }

    try {
      logger.debug('TELEGRAM', 'Sending file', { userId, fileUrl, hasCaption: !!caption });

      // Use direct Telegram Bot API call via fetch
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: parseInt(userId),
          document: fileUrl,
          caption: caption || undefined,
        }),
      });

      const result = await response.json();

      if (result.ok && result.result?.message_id) {
        logger.info('TELEGRAM', 'File sent successfully', {
          userId,
          messageId: result.result.message_id,
        });
        return {
          success: true,
          messageId: result.result.message_id?.toString(),
        };
      } else {
        logger.error('TELEGRAM', 'Invalid response from Telegram API', { result });
        return {
          success: false,
          error: result.description || 'Invalid response from Telegram API',
        };
      }
    } catch (error) {
      logger.error('TELEGRAM', 'Error sending Telegram file', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
