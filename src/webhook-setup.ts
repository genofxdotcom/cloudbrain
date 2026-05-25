const TELEGRAM_API_BASE = 'https://api.telegram.org';

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

interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_unixtime?: number;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Get current webhook information from Telegram
 * @param botToken Telegram bot token
 */
export async function getWebhookInfo(botToken: string): Promise<WebhookInfo | null> {
  try {
    logger.debug('WEBHOOK', 'Fetching webhook info from Telegram');
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${botToken}/getWebhookInfo`
    );
    const data: TelegramResponse<WebhookInfo> = await response.json();

    if (data.ok && data.result) {
      logger.debug('WEBHOOK', 'Webhook info retrieved', {
        url: data.result.url,
        pending: data.result.pending_update_count,
        hasError: !!data.result.last_error_date,
      });
      return data.result;
    }
    logger.warn('WEBHOOK', 'Telegram API error', { description: data.description });
    return null;
  } catch (error) {
    logger.error('WEBHOOK', 'Error getting webhook info', error);
    return null;
  }
}

/**
 * Register webhook with Telegram
 * @param botToken Telegram bot token
 * @param webhookUrl URL where Telegram should send updates
 * @param secretToken Optional secret token for validation
 */
export async function registerWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken?: string
): Promise<boolean> {
  try {
    logger.info('WEBHOOK', 'Registering webhook with Telegram', { url: webhookUrl });
    
    const payload: any = { url: webhookUrl };
    
    // Add secret token for security (recommended by Telegram)
    if (secretToken) {
      payload.secret_token = secretToken;
      logger.debug('WEBHOOK', 'Using secret token for webhook');
    }
    
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const data: TelegramResponse<boolean> = await response.json();

    if (data.ok) {
      logger.info('WEBHOOK', 'Webhook registered successfully', { url: webhookUrl });
      return true;
    } else {
      logger.error('WEBHOOK', 'Webhook registration failed', { description: data.description, errorCode: data.error_code });
      return false;
    }
  } catch (error) {
    logger.error('WEBHOOK', 'Error registering webhook', error);
    return false;
  }
}

/**
 * Check if webhook is properly configured
 */
export async function isWebhookConfigured(botToken: string, expectedUrl: string): Promise<boolean> {
  const info = await getWebhookInfo(botToken);
  if (!info) {
    logger.warn('WEBHOOK', 'Could not fetch webhook info');
    return false;
  }

  // Check if webhook URL matches expected URL
  const isConfigured = info.url === expectedUrl;
  const hasNoErrors = !info.last_error_date || info.last_error_date === 0;

  logger.debug('WEBHOOK', 'Configuration check', {
    expectedUrl,
    actualUrl: info.url,
    isConfigured,
    hasErrors: !hasNoErrors,
    lastError: info.last_error_message,
  });

  return isConfigured && hasNoErrors;
}

/**
 * Auto-setup webhook on first request
 * This is called once per worker instance
 * IMPORTANT: Must be called AFTER credentials are loaded from KV
 */
let webhookSetupAttempted = false;

export async function ensureWebhookSetup(
  botToken: string,
  workerUrl: string,
  maxRetries: number = 3
): Promise<void> {
  // Only attempt once per worker instance
  if (webhookSetupAttempted) {
    logger.debug('WEBHOOK', 'Webhook setup already attempted, skipping');
    return;
  }

  webhookSetupAttempted = true;

  // Validate inputs
  if (!botToken) {
    logger.error('WEBHOOK', 'Bot token not provided, cannot setup webhook');
    return;
  }

  if (!workerUrl) {
    logger.error('WEBHOOK', 'Worker URL not provided, cannot setup webhook');
    return;
  }

  try {
    // Use /telegram endpoint (where the handler listens)
    const webhookUrl = `${workerUrl}/telegram`;
    
    // Generate a secret token for webhook security
    // Use bot ID (first part before colon) as secret
    const botId = botToken.split(':')[0];
    const secretToken = botId;

    logger.info('WEBHOOK', 'Starting webhook setup', { webhookUrl });

    // Check if webhook is already configured correctly
    const isConfigured = await isWebhookConfigured(botToken, webhookUrl);

    if (isConfigured) {
      logger.info('WEBHOOK', 'Webhook already configured correctly, no action needed');
      return;
    }

    // Retry logic for webhook registration
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info('WEBHOOK', `Webhook registration attempt ${attempt}/${maxRetries}`);
      
      const success = await registerWebhook(botToken, webhookUrl, secretToken);

      if (success) {
        logger.info('WEBHOOK', 'Webhook setup completed successfully');
        
        // Verify setup after a small delay
        await new Promise(resolve => setTimeout(resolve, 500));
        const verified = await isWebhookConfigured(botToken, webhookUrl);
        if (verified) {
          logger.info('WEBHOOK', 'Webhook setup verified');
          return;
        } else {
          logger.warn('WEBHOOK', 'Webhook verification failed after setup');
          lastError = 'Verification failed after setup';
        }
      } else {
        lastError = 'Registration failed';
        if (attempt < maxRetries) {
          logger.warn('WEBHOOK', `Attempt ${attempt} failed, retrying...`);
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    logger.error('WEBHOOK', 'Failed to setup webhook after all retries', { lastError, attempts: maxRetries });
  } catch (error) {
    logger.error('WEBHOOK', 'Fatal error in webhook setup', error);
  }
}

/**
 * Get webhook status for debugging
 */
export async function getWebhookStatus(botToken: string): Promise<{
  configured: boolean;
  url: string | null;
  pending_updates: number;
  last_error: string | null;
  last_sync: number | null;
}> {
  const info = await getWebhookInfo(botToken);

  if (!info) {
    return {
      configured: false,
      url: null,
      pending_updates: 0,
      last_error: 'Unable to fetch webhook info',
      last_sync: null,
    };
  }

  return {
    configured: !!info.url,
    url: info.url || null,
    pending_updates: info.pending_update_count || 0,
    last_error: info.last_error_message || null,
    last_sync: info.last_synchronization_unixtime || null,
  };
}
