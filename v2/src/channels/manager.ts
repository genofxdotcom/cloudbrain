import { BaseChannel, IncomingMessage, OutgoingMessage } from './base';
import { TelegramChannel } from './telegram';
import { DiscordChannel } from './discord';
import { WhatsAppChannel } from './whatsapp';
import { log } from '../utils/logger';

export class ChannelManager {
  private channels: Map<string, BaseChannel> = new Map();
  private messageHandler: ((msg: IncomingMessage) => void) | null = null;

  async initialize(): Promise<void> {
    const telegram = new TelegramChannel();
    const discord = new DiscordChannel();
    const whatsapp = new WhatsAppChannel();

    this.channels.set('telegram', telegram);
    this.channels.set('discord', discord);
    this.channels.set('whatsapp', whatsapp);
  }

  async startAll(): Promise<string[]> {
    const active: string[] = [];

    for (const [name, channel] of this.channels) {
      if (await channel.isConfigured()) {
        try {
          channel.onMessage((msg) => {
            if (this.messageHandler) this.messageHandler(msg);
          });
          await channel.start();
          active.push(name);
        } catch (error: any) {
          log.error('CHANNELS', `Failed to start ${name}: ${error.message}`);
        }
      }
    }

    log.info('CHANNELS', `Active channels: ${active.length > 0 ? active.join(', ') : 'none'}`);
    return active;
  }

  async stopAll(): Promise<void> {
    for (const [, channel] of this.channels) {
      await channel.stop();
    }
  }

  onMessage(handler: (msg: IncomingMessage) => void) {
    this.messageHandler = handler;
  }

  async send(channelName: string, userId: string, text: string): Promise<boolean> {
    const channel = this.channels.get(channelName);
    if (!channel) { log.warn('CHANNELS', `Channel ${channelName} not found`); return false; }
    return channel.sendMessage(userId, text);
  }

  async sendMedia(channelName: string, userId: string, media: OutgoingMessage['media']): Promise<boolean> {
    const channel = this.channels.get(channelName);
    if (!channel || !media) return false;
    return channel.sendMedia(userId, media);
  }

  getChannel(name: string): BaseChannel | undefined {
    return this.channels.get(name);
  }
}
