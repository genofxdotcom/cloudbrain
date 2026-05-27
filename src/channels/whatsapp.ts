import { BaseChannel, IncomingMessage } from './base';
import { getCredential } from '../db/credentials';
import { log } from '../utils/logger';
import express from 'express';

/**
 * WhatsApp Channel using Cloud API (webhook-based)
 */
export class WhatsAppChannel extends BaseChannel {
  name = 'whatsapp';
  private phoneId: string = '';
  private accessToken: string = '';
  private server: any = null;

  async isConfigured(): Promise<boolean> {
    const phoneId = await getCredential('WHATSAPP_PHONE_NUMBER_ID');
    const token = await getCredential('WHATSAPP_ACCESS_TOKEN');
    return !!(phoneId && token);
  }

  async start(): Promise<void> {
    this.phoneId = (await getCredential('WHATSAPP_PHONE_NUMBER_ID')) || '';
    this.accessToken = (await getCredential('WHATSAPP_ACCESS_TOKEN')) || '';
    const verifyToken = (await getCredential('WHATSAPP_VERIFY_TOKEN')) || 'cloudbrain_verify';

    if (!this.phoneId || !this.accessToken) {
      log.warn('WHATSAPP', 'Not configured, skipping');
      return;
    }

    // Start webhook server for WhatsApp
    const app = express();
    app.use(express.json());

    // Verification endpoint
    app.get('/whatsapp', (req, res) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === verifyToken) {
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    });

    // Message webhook
    app.post('/whatsapp', (req, res) => {
      res.sendStatus(200);
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const msg = change?.value?.messages?.[0];
      if (!msg) return;

      const incoming: IncomingMessage = {
        id: msg.id,
        userId: msg.from,
        channel: 'whatsapp',
        text: msg.text?.body || '',
        timestamp: parseInt(msg.timestamp) * 1000,
      };

      if (msg.type === 'image') { incoming.hasMedia = true; incoming.mediaType = 'photo'; }
      if (msg.type === 'audio') { incoming.hasMedia = true; incoming.mediaType = 'audio'; }
      if (msg.type === 'video') { incoming.hasMedia = true; incoming.mediaType = 'video'; }
      if (msg.type === 'document') { incoming.hasMedia = true; incoming.mediaType = 'document'; }

      if (this.messageHandler) this.messageHandler(incoming);
    });

    const port = parseInt(process.env.WHATSAPP_PORT || '3001');
    this.server = app.listen(port, () => {
      log.success('WHATSAPP', `Webhook server running on port ${port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) this.server.close();
  }

  async sendMessage(userId: string, text: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${this.phoneId}/messages`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: userId,
            type: 'text',
            text: { body: text },
          }),
        }
      );
      return response.ok;
    } catch (error: any) {
      log.error('WHATSAPP', `Send failed: ${error.message}`);
      return false;
    }
  }

  async sendMedia(userId: string, media: { type: string; url?: string; buffer?: Buffer; caption?: string }): Promise<boolean> {
    try {
      const body: any = { messaging_product: 'whatsapp', to: userId };
      if (media.type === 'photo') { body.type = 'image'; body.image = { link: media.url, caption: media.caption }; }
      else if (media.type === 'audio') { body.type = 'audio'; body.audio = { link: media.url }; }
      else if (media.type === 'video') { body.type = 'video'; body.video = { link: media.url, caption: media.caption }; }
      else { body.type = 'document'; body.document = { link: media.url, caption: media.caption }; }

      const response = await fetch(`https://graph.facebook.com/v18.0/${this.phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.ok;
    } catch (error: any) {
      log.error('WHATSAPP', `Send media failed: ${error.message}`);
      return false;
    }
  }
}
