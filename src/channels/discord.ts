import { BaseChannel, IncomingMessage } from './base';
import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';
import WebSocket from 'ws';

/**
 * Discord channel using raw Gateway WebSocket (no discord.js dependency)
 */
export class DiscordChannel extends BaseChannel {
  name = 'discord';
  private ws: WebSocket | null = null;
  private token: string = '';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sequence: number | null = null;

  async isConfigured(): Promise<boolean> {
    const token = await getCredential('DISCORD_BOT_TOKEN');
    return !!token;
  }

  async start(): Promise<void> {
    this.token = (await getCredential('DISCORD_BOT_TOKEN')) || '';
    if (!this.token) { log.warn('DISCORD', 'Not configured, skipping'); return; }

    this.connect();
    log.success('DISCORD', 'Bot connecting via Gateway');
  }

  private connect() {
    this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

    this.ws.on('message', (data) => {
      const payload = JSON.parse(data.toString());
      this.handleGatewayEvent(payload);
    });

    this.ws.on('close', () => {
      log.warn('DISCORD', 'Connection closed, reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (err) => {
      log.error('DISCORD', `WebSocket error: ${err.message}`);
    });
  }

  private handleGatewayEvent(payload: any) {
    const { op, d, s, t } = payload;
    if (s) this.sequence = s;

    switch (op) {
      case 10: // Hello
        this.startHeartbeat(d.heartbeat_interval);
        this.identify();
        break;
      case 11: // Heartbeat ACK
        break;
    }

    if (t === 'MESSAGE_CREATE' && d.author && !d.author.bot) {
      const incoming: IncomingMessage = {
        id: d.id,
        userId: d.author.id,
        channel: 'discord',
        text: d.content || '',
        timestamp: new Date(d.timestamp).getTime(),
      };

      if (d.attachments?.length > 0) {
        incoming.hasMedia = true;
        incoming.mediaType = 'document';
        incoming.mediaUrl = d.attachments[0].url;
      }

      if (this.messageHandler) this.messageHandler(incoming);
    }
  }

  private startHeartbeat(interval: number) {
    this.heartbeatInterval = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 1, d: this.sequence }));
    }, interval);
  }

  private identify() {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: 513, // GUILDS + GUILD_MESSAGES
        properties: { os: 'linux', browser: 'cloudbrain', device: 'cloudbrain' },
      },
    }));
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.ws?.close();
    this.ws = null;
  }

  async sendMessage(userId: string, text: string): Promise<boolean> {
    // Discord sends to channels, not users directly. userId here is channelId.
    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${userId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      return response.ok;
    } catch (error: any) {
      log.error('DISCORD', `Send failed: ${error.message}`);
      return false;
    }
  }

  async sendMedia(userId: string, media: { type: string; url?: string; buffer?: Buffer; caption?: string }): Promise<boolean> {
    // Send as embed with URL
    try {
      const embed: any = { description: media.caption || '' };
      if (media.type === 'photo' && media.url) embed.image = { url: media.url };

      const response = await fetch(`https://discord.com/api/v10/channels/${userId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: media.caption || '', embeds: media.url ? [embed] : [] }),
      });
      return response.ok;
    } catch (error: any) {
      log.error('DISCORD', `Send media failed: ${error.message}`);
      return false;
    }
  }
}
