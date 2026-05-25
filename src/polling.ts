import { CloudBrainEnv, TelegramUpdate } from './types';
// import { handleTelegramWebhook } from './channels/telegram';
import { TelegramChannel } from './channels/telegram';
import { ChannelMessage } from './channels/base';

/**
 * Polling-based update handler for Telegram
 * This is more reliable on serverless platforms than webhooks
 * because it avoids IP caching issues
 */

interface PollingState {
  offset: number;
  lastUpdate: number;
}

// Store polling state in memory (per worker instance)
let pollingState: PollingState = {
  offset: 0,
  lastUpdate: 0,
};

/**
 * Start polling for Telegram updates
 * This should be called from a scheduled worker or Durable Object
 */
export async function startPolling(env: CloudBrainEnv): Promise<void> {
  console.log('🔄 Starting Telegram polling...');
  
  while (true) {
    try {
      await pollUpdates(env);
    } catch (error) {
      console.error('Polling error:', error);
    }
    
    // Poll every 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * Poll for updates from Telegram
 */
async function pollUpdates(env: CloudBrainEnv): Promise<void> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${pollingState.offset}&timeout=30`,
      {
        method: 'GET',
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram API error:', data.description);
      return;
    }

    if (!data.result || data.result.length === 0) {
      return;
    }

    // Process each update
    for (const update of data.result) {
      try {
        // Handle the update using TelegramChannel
        const telegramChannel = new TelegramChannel();
        await telegramChannel.initialize({
          SECRET_TELEGRAM_API_TOKEN: env.TELEGRAM_BOT_TOKEN,
          TELEGRAM_OWNER_ID: env.TELEGRAM_OWNER_ID,
        });
        
        const message: ChannelMessage = {
          id: update.update_id.toString(),
          channelType: 'telegram',
          userId: update.message?.from?.id?.toString() || '',
          text: update.message?.text || '',
          timestamp: Date.now(),
        };
        
        // Update offset for next poll
        pollingState.offset = update.update_id + 1;
        pollingState.lastUpdate = Date.now();
      } catch (error) {
        console.error(`Error processing update ${update.update_id}:`, error);
      }
    }
  } catch (error) {
    console.error('Polling fetch error:', error);
  }
}

/**
 * Get current polling status
 */
export function getPollingStatus(): {
  offset: number;
  lastUpdate: number;
  timeSinceLastUpdate: number;
} {
  return {
    offset: pollingState.offset,
    lastUpdate: pollingState.lastUpdate,
    timeSinceLastUpdate: Date.now() - pollingState.lastUpdate,
  };
}

/**
 * Reset polling state
 */
export function resetPollingState(): void {
  pollingState = {
    offset: 0,
    lastUpdate: 0,
  };
  console.log('✅ Polling state reset');
}
