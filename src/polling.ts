import { CloudBrainEnv, TelegramUpdate } from './types';
import { TelegramChannel } from './channels/telegram';
import { ChannelMessage } from './channels/base';

/**
 * Polling-based update handler for Telegram
 * This is more reliable on serverless platforms than webhooks
 * because it avoids IP caching issues
 * 
 * NOTE: This is currently not used by default.
 * The webhook-based approach is preferred for Cloudflare Workers.
 * This can be used with Scheduled Workers for polling if needed.
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
 * Requires credentials object with Telegram token and owner ID
 */
export async function startPolling(credentials: Record<string, string>): Promise<void> {
  console.log('🔄 Starting Telegram polling...');
  
  const token = credentials.TELEGRAM_API_TOKEN;
  const ownerId = credentials.TELEGRAM_OWNER_ID;
  
  if (!token || !ownerId) {
    console.error('❌ Telegram credentials not available for polling');
    return;
  }
  
  while (true) {
    try {
      await pollUpdates(token);
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
async function pollUpdates(telegramToken: string): Promise<void> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${telegramToken}/getUpdates?offset=${pollingState.offset}&timeout=30`,
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
        const message: ChannelMessage = {
          id: update.update_id.toString(),
          channelType: 'telegram',
          userId: update.message?.from?.id?.toString() || '',
          text: update.message?.text || '',
          timestamp: Date.now(),
        };
        
        console.log('📨 Received update via polling:', { updateId: update.update_id, userId: message.userId });
        
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
