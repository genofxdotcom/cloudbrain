export interface IncomingMessage {
  id: string;
  userId: string;
  channel: 'telegram' | 'discord' | 'whatsapp' | 'cli';
  text: string;
  hasMedia?: boolean;
  mediaType?: 'photo' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  timestamp: number;
}

export interface OutgoingMessage {
  userId: string;
  channel: string;
  text: string;
  media?: { type: string; url?: string; buffer?: Buffer; caption?: string };
}

export abstract class BaseChannel {
  abstract name: string;
  abstract isConfigured(): Promise<boolean>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract sendMessage(userId: string, text: string): Promise<boolean>;
  abstract sendMedia(userId: string, media: { type: string; url?: string; buffer?: Buffer; caption?: string }): Promise<boolean>;

  protected messageHandler: ((msg: IncomingMessage) => void) | null = null;

  onMessage(handler: (msg: IncomingMessage) => void) {
    this.messageHandler = handler;
  }
}
